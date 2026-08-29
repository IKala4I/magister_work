"""/feedback — two-phase learning update (specs/07 §3.5 step 4–5; File 05 §1).

Three structurally distinct paths (spec-conflicts H3, invariant 3/4):
  • `excluded = true`  → EXCLUDE: counted, never touches any state (ambiguous rewards);
  • external displacement → there is NO tuple at all (the schema's `reason` vocabulary has no
    such value — the request cannot even represent it);
  • lapse (r = 0.0, reason `lapsed`) → APPLY like any other outcome: a 0.0 teaches.
Idempotent re-delivery: the (recommendation_id, kind) id-set check. `correction = true` →
full rebuild from stored tuples, never a rank-one downdate (invariant 6).

P9 (ADR-0013): belief labels (FR-33/FR-41) are corrections in the invariant-6 sense — every
`/labels` delivery stores the labels and rebuilds from stored tuples + the label in force per
cell, so a cleared or flipped toggle is never a downdate either. Labels touch only the Beta
cells (they name a cell, not a placement — there is no feature vector to put into (A, b)); the
bandit and the blend replay are unchanged by them.

Per applied tuple (specs/07 §3.5 step 4): Sherman–Morrison on (A_g, b_g); decayed Beta evidence;
one projected-SGD step on the blend weights (P7, ADR-0010) using the cell mean the plan saw
(feature 15 of the snapshot) and the linear estimate xᵀθ̂_g BEFORE the tuple is applied — the
rebuild replays the same sequence from the initial weights, so blend state is a pure function of
the stored tuples like everything else.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import datetime
from enum import StrEnum

import numpy as np

from hourwell_recsys import bandit
from hourwell_recsys.blend import Blend, sgd_step
from hourwell_recsys.energy import BetaCell, apply_label, apply_reward, reset_evidence
from hourwell_recsys.features import decode_cell
from hourwell_recsys.repo import (
    CATEGORIES,
    Repo,
    StoredLabel,
    StoredTuple,
    latest_labels,
    parse_state_ref,
)
from hourwell_recsys.schemas import (
    FeedbackRequest,
    FeedbackResponse,
    FeedbackTuple,
    LabelsRequest,
    LabelsResponse,
)

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


def _timeline_key(item: StoredTuple | StoredLabel) -> tuple[datetime, int, str]:
    if isinstance(item, StoredLabel):
        return (item.labeled_at, 1, item.id)
    return (item.attributed_at, 0, f"{item.recommendation_id}:{item.kind}")


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
    initial weights (specs/07 §3.5.5; ADR-0010). P9: the belief label in force per cell enters
    the Beta recount at its own timestamp, interleaved with the tuples (ADR-0013)."""
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
    labels = [
        lab
        for lab in latest_labels(repo.load_labels(user_id)).values()
        if lab.label != "none" and lab.key in fresh
    ]
    # one timeline: tuples and labels in timestamp order (ties: tuples first, then labels)
    timeline: list[StoredTuple | StoredLabel] = [*stored, *labels]
    for item in sorted(timeline, key=_timeline_key):
        if isinstance(item, StoredLabel):
            fresh[item.key] = apply_label(fresh[item.key], item.label, item.labeled_at)
            continue
        key = _cell_key(item.category, item.features)
        fresh[key] = apply_reward(fresh[key], item.reward, item.attributed_at)
        blend = _blend_step(blend, replay[item.category], item.features, item.reward)
        replay[item.category] = bandit.update(replay[item.category], item.features, item.reward)
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


def apply_labels(req: LabelsRequest, repo: Repo) -> LabelsResponse:
    """`POST /labels` (P9, ADR-0013): store the labels (idempotent by id), then rebuild — a
    label is a correction of the model's belief, and corrections rebuild (invariant 6). The
    response mirrors /feedback so the delivering edge function can treat both alike."""
    user_id = str(req.user_id)
    cells = {c.key: c for c in repo.load_cells(user_id)}
    if any(c.prior_version < 0 for c in cells.values()):
        raise StateNotInstantiated(user_id)
    stored: list[StoredLabel] = []
    for lab in req.labels:
        category, daypart, day_type = parse_state_ref(lab.state_ref)  # ValueError → 422
        stored.append(StoredLabel(lab.id, category, daypart, day_type, lab.label, lab.labeled_at))
    repo.save_labels(user_id, stored)
    states = repo.load_bandit(user_id)
    version = max(s.state_version for s in states.values()) + 1
    states, cells, blend, keys = rebuild_all(repo, user_id, cells, version)
    repo.save_all(user_id, states.values(), cells.values(), keys, version, blend=blend)
    return LabelsResponse(applied=len(stored), rebuilt=True, state_version=version)
