"""/feedback — two-phase learning update (specs/07 §3.5 step 4–5; File 05 §1).

Three structurally distinct paths (spec-conflicts H3, invariant 3/4):
  • `excluded = true`  → EXCLUDE: counted, never touches any state (ambiguous rewards);
  • external displacement → there is NO tuple at all (the schema's `reason` vocabulary has no
    such value — the request cannot even represent it);
  • lapse (r = 0.0, reason `lapsed`) → APPLY like any other outcome: a 0.0 teaches.
Idempotent re-delivery: the (recommendation_id, kind) id-set check. `correction = true` →
full rebuild from stored tuples, never a rank-one downdate (invariant 6).
"""

from __future__ import annotations

from dataclasses import replace
from enum import StrEnum

import numpy as np

from hourwell_recsys import bandit
from hourwell_recsys.energy import BetaCell, apply_reward, reset_evidence
from hourwell_recsys.features import decode_cell
from hourwell_recsys.repo import CATEGORIES, Repo
from hourwell_recsys.schemas import FeedbackRequest, FeedbackResponse, FeedbackTuple


class TupleDisposition(StrEnum):
    APPLY = "apply"
    EXCLUDE = "exclude"


def classify(t: FeedbackTuple) -> TupleDisposition:
    """The single decision point between "learn from it" and "audit-only" (H3 guard)."""
    return TupleDisposition.EXCLUDE if t.excluded else TupleDisposition.APPLY


def _cell_key(category: str, features: np.ndarray) -> tuple[str, str, str]:
    dp, dt = decode_cell(features)
    return (category, dp.value, dt)


def rebuild_all(
    repo: Repo, user_id: str, cells: dict[tuple[str, str, str], BetaCell], state_version: int
) -> tuple[
    dict[str, bandit.LinearState], dict[tuple[str, str, str], BetaCell], set[tuple[str, str]]
]:
    """Recompute A_g = I + Σ x xᵀ, b_g = Σ r x and recount Beta evidence with decay as of each
    tuple's original timestamp (specs/07 §3.5.5)."""
    stored = repo.load_tuples(user_id)  # non-excluded only
    states = {
        g: bandit.rebuild(
            g,
            [(s.features, s.reward) for s in stored if s.category == g],
            state_version=state_version,
        )
        for g in CATEGORIES
    }
    fresh = {k: reset_evidence(c) for k, c in cells.items()}
    for s in sorted(stored, key=lambda t: (t.attributed_at, t.recommendation_id)):
        key = _cell_key(s.category, s.features)
        fresh[key] = apply_reward(fresh[key], s.reward, s.attributed_at)
    return states, fresh, {(s.recommendation_id, s.kind) for s in stored}


def apply_feedback(req: FeedbackRequest, repo: Repo) -> FeedbackResponse:
    user_id = str(req.user_id)
    cells = {c.key: c for c in repo.load_cells(user_id)}
    states = repo.load_bandit(user_id)
    applied = repo.applied_keys(user_id)
    version = max(s.state_version for s in states.values())

    skipped_excluded = 0
    updated = 0
    newly: set[tuple[str, str]] = set()
    for t in req.tuples:
        if classify(t) is TupleDisposition.EXCLUDE:
            skipped_excluded += 1
            continue  # never reaches any state update
        key = (t.recommendation_id, t.kind)
        if key in applied or key in newly:
            continue  # safe re-delivery (id-set check)
        x = np.asarray(t.features, dtype=np.float64)
        states[t.category] = bandit.update(states[t.category], x, t.reward)
        ck = _cell_key(t.category, x)
        cells[ck] = apply_reward(cells[ck], t.reward, t.attributed_at)
        newly.add(key)
        updated += 1

    rebuilt = any(t.correction for t in req.tuples if classify(t) is TupleDisposition.APPLY)
    if rebuilt:
        version += 1
        states, cells, stored_keys = rebuild_all(repo, user_id, cells, version)
        newly |= stored_keys
    elif updated:
        version += 1
        states = {g: replace(s, state_version=version) for g, s in states.items()}

    if updated or rebuilt:
        repo.save_bandit(user_id, states.values())
        repo.save_cells(user_id, cells.values())
        repo.mark_applied(user_id, newly, version)
    return FeedbackResponse(
        updated=updated, skipped_excluded=skipped_excluded, rebuilt=rebuilt, state_version=version
    )
