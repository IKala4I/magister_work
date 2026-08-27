"""/feedback — two-phase learning update (specs/07 §3.5 step 4–5; File 05 §1).

Three structurally distinct paths (spec-conflicts H3, invariant 3/4):
  • `excluded = true`  → EXCLUDE: counted, never touches any state (ambiguous rewards);
  • external displacement → there is NO tuple at all (the schema's `reason` vocabulary has no
    such value — the request cannot even represent it);
  • lapse (r = 0.0, reason `lapsed`) → APPLY like any other outcome: a 0.0 teaches.
Idempotent re-delivery: the (recommendation_id, kind) id-set check. `correction = true` →
full rebuild from stored tuples, never a rank-one downdate (invariant 6).

Per applied tuple (specs/07 §3.5 step 4): Sherman–Morrison on (A_g, b_g); decayed Beta evidence;
one projected-SGD step on the blend weights (P7, ADR-0010) using the cell mean the plan saw
(feature 15 of the snapshot) and the linear estimate xᵀθ̂_g BEFORE the tuple is applied — the
rebuild replays the same sequence from the initial weights, so blend state is a pure function of
the stored tuples like everything else.
"""

from __future__ import annotations

from dataclasses import replace
from enum import StrEnum

import numpy as np

from hourwell_recsys import bandit
from hourwell_recsys.blend import Blend, sgd_step
from hourwell_recsys.energy import BetaCell, apply_reward, reset_evidence
from hourwell_recsys.features import decode_cell
from hourwell_recsys.repo import CATEGORIES, Repo
from hourwell_recsys.schemas import FeedbackRequest, FeedbackResponse, FeedbackTuple

CELL_MEAN_FEATURE = 14  # specs/07 §3.2.4 feature 15 (0-based index 14)


class StateNotInstantiated(Exception):
    """/feedback for a user whose Beta cells were never instantiated (trigger, ADR-0005): the
    evidence could not be persisted, so refusing is the only honest answer (adversarial finding)."""


class TupleDisposition(StrEnum):
    APPLY = "apply"
    EXCLUDE = "exclude"


def classify(t: FeedbackTuple) -> TupleDisposition:
    """The single decision point between "learn from it" and "audit-only" (H3 guard)."""
    return TupleDisposition.EXCLUDE if t.excluded else TupleDisposition.APPLY


def _cell_key(category: str, features: np.ndarray) -> tuple[str, str, str]:
    dp, dt = decode_cell(features)
    return (category, dp.value, dt)


def _blend_step(blend: Blend, state: bandit.LinearState, x: np.ndarray, reward: float) -> Blend:
    return sgd_step(blend, float(x[CELL_MEAN_FEATURE]), float(x @ state.theta), reward)


def rebuild_all(
    repo: Repo, user_id: str, cells: dict[tuple[str, str, str], BetaCell], state_version: int
) -> tuple[
    dict[str, bandit.LinearState],
    dict[tuple[str, str, str], BetaCell],
    Blend,
    set[tuple[str, str]],
]:
    """Recompute A_g = I + Σ x xᵀ, b_g = Σ r x, recount Beta evidence with decay as of each
    tuple's original timestamp, and replay the blend's SGD trajectory in tuple order from the
    initial weights (specs/07 §3.5.5; ADR-0010)."""
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
    blend = Blend(state_version=state_version)
    replay = {g: bandit.init_state(g) for g in CATEGORIES}  # θ trajectory for the blend replay
    for s in sorted(stored, key=lambda t: (t.attributed_at, t.recommendation_id, t.kind)):
        key = _cell_key(s.category, s.features)
        fresh[key] = apply_reward(fresh[key], s.reward, s.attributed_at)
        blend = _blend_step(blend, replay[s.category], s.features, s.reward)
        replay[s.category] = bandit.update(replay[s.category], s.features, s.reward)
    return states, fresh, blend, {(s.recommendation_id, s.kind) for s in stored}


def apply_feedback(req: FeedbackRequest, repo: Repo) -> FeedbackResponse:
    user_id = str(req.user_id)
    cells = {c.key: c for c in repo.load_cells(user_id)}
    if any(c.prior_version < 0 for c in cells.values()):
        raise StateNotInstantiated(user_id)
    states = repo.load_bandit(user_id)
    blend = repo.load_blend(user_id)
    applied = repo.applied_keys(user_id)
    version = max(s.state_version for s in states.values())

    skipped_excluded = 0
    updated = 0
    newly: set[tuple[str, str]] = set()
    # deterministic order (attributed_at, recommendation_id, kind) — the same total order the
    # rebuild replays, so blend state is a pure function of the tuples (adversarial #8)
    ordered = sorted(req.tuples, key=lambda t: (t.attributed_at, str(t.recommendation_id), t.kind))
    for t in ordered:
        if classify(t) is TupleDisposition.EXCLUDE:
            skipped_excluded += 1
            continue  # never reaches any state update
        key = (t.recommendation_id, t.kind)
        if key in applied or key in newly:
            continue  # safe re-delivery (id-set check)
        x = np.asarray(t.features, dtype=np.float64)
        blend = _blend_step(blend, states[t.category], x, t.reward)  # θ̂ before this tuple
        states[t.category] = bandit.update(states[t.category], x, t.reward)
        ck = _cell_key(t.category, x)
        cells[ck] = apply_reward(cells[ck], t.reward, t.attributed_at)
        newly.add(key)
        updated += 1

    # "`correction: true` on ANY tuple triggers the rebuild" (specs/07 §5) — including an excluded
    # correction, which is exactly the case that must purge now-ambiguous evidence (invariant 3)
    rebuilt = any(t.correction for t in req.tuples)
    if rebuilt:
        version += 1
        states, cells, blend, stored_keys = rebuild_all(repo, user_id, cells, version)
        newly |= stored_keys
    elif updated:
        version += 1
        states = {g: replace(s, state_version=version) for g, s in states.items()}
        blend = replace(blend, state_version=version)

    if updated or rebuilt:
        repo.save_all(user_id, states.values(), cells.values(), newly, version, blend=blend)
    return FeedbackResponse(
        updated=updated, skipped_excluded=skipped_excluded, rebuilt=rebuilt, state_version=version
    )
