"""Request/response schemas — the exact shapes of specs/07 §5 (additive optional fields are marked).

`packages/shared/src/api.ts` is generated from this app's OpenAPI document; CI diffs it.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Literal
from zoneinfo import ZoneInfo

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from hourwell_recsys.params import EPSILON, FEATURE_DIM, TOP_M

Category = Literal["deep", "admin", "physical", "learning"]
DayKey = Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
Policy = Literal["ts", "linucb", "heuristic-shadow"]
Horizon = Literal["day", "week"]
Arm = Literal["A", "B"]
# specs/07 §3.4.1 rows 1–9. Row 10 (external displacement) has NO reward row and therefore no
# reason value: a displacement can never be encoded as a feedback tuple (spec-conflicts H3).
Reason = Literal[
    "completed",
    "partial",
    "off_slot",
    "lapsed",
    "skipped",
    "rejected",
    "override_out",
    "override_in",
]
Kind = Literal["outcome", "override_out", "override_in"]
Degradation = Literal["coarse_30min", "day_by_day"]
UnplacedReason = Literal["no_feasible_start", "deferred", "infeasible"]
OptionKind = Literal["drop", "shrink", "move_past_deadline", "unpin"]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class BusyInterval(_Strict):
    start: AwareDatetime
    end: AwareDatetime

    @model_validator(mode="after")
    def _ordered(self) -> BusyInterval:
        if self.end <= self.start:
            raise ValueError("busy interval must end after it starts")
        return self


class TaskIn(_Strict):
    id: str = Field(min_length=1, max_length=64)
    category: Category
    est_minutes: int = Field(gt=0, le=24 * 60)
    deadline: AwareDatetime | None = None
    value: int = Field(ge=1, le=3)
    splittable: bool = False
    earliest_start: AwareDatetime | None = None
    pinned_start: AwareDatetime | None = None
    postpone_count: int = Field(ge=0, default=0)


class PreviousAssignment(_Strict):
    task_id: str
    slot_start: AwareDatetime
    chunk_index: int = Field(ge=0, default=0)


class PlanSettings(_Strict):
    epsilon: float = Field(ge=0.0, le=1.0, default=EPSILON)
    top_m: int = Field(ge=1, default=TOP_M)
    policy: Policy = "ts"
    seed: int | None = Field(ge=0, lt=2**63, default=None)  # additive: reproducible plans


class PlanRequest(_Strict):
    user_id: uuid.UUID
    plan_date: date
    horizon: Horizon = "day"
    timezone: str
    working_hours: dict[DayKey, tuple[int, int]]
    sleep_window: tuple[int, int] | None = None
    busy: list[BusyInterval] = Field(default_factory=list)  # MAY be empty (decision 5)
    tasks: list[TaskIn] = Field(max_length=200)
    previous_assignments: list[PreviousAssignment] = Field(default_factory=list)
    settings: PlanSettings = Field(default_factory=PlanSettings)
    arm: Arm | None = None
    now: AwareDatetime | None = None  # additive: ticks before `now` are not workable

    @model_validator(mode="after")
    def _validate(self) -> PlanRequest:
        try:
            ZoneInfo(self.timezone)
        except Exception as exc:  # noqa: BLE001 — zoneinfo raises several types
            raise ValueError(f"unknown timezone {self.timezone!r}") from exc
        for key, (ws, we) in self.working_hours.items():
            if not (0 <= ws < we <= 1440):
                raise ValueError(f"working_hours[{key}] must satisfy 0 ≤ start < end ≤ 1440")
        if self.sleep_window is not None:
            s, e = self.sleep_window
            if not (0 <= s < 1440 and 0 <= e < 1440):
                raise ValueError("sleep_window minutes must be in [0, 1440)")
        ids = [t.id for t in self.tasks]
        if len(ids) != len(set(ids)):
            raise ValueError("task ids must be unique")
        return self


class Assignment(_Strict):
    task_id: str
    chunk_index: int
    slot_start: datetime
    slot_end: datetime
    context_bucket: str
    q_hat: float
    confidence: float
    rationale_key: str
    rationale_params: dict[str, Any]
    is_experiment: bool
    propensity: float | None  # M-01: exactly ε/m on the randomized slice, null otherwise
    experiment_top_m: list[str] | None = None  # A_m(x) for replay (File 04 §2.2); slice rows only
    features: list[float] = Field(min_length=FEATURE_DIM, max_length=FEATURE_DIM)


class Unplaced(_Strict):
    task_id: str
    reason: UnplacedReason


class TradeOffOption(_Strict):
    kind: OptionKind
    task_id: str
    delta_minutes: int | None = None
    consequence: dict[str, float | str]


class Infeasible(_Strict):
    options: list[TradeOffOption]


class Telemetry(_Strict):
    solve_ms: int
    literals: int
    degradation: Degradation | None
    rng_seed: int
    policy: Policy
    experiment_drawn: bool
    experiment_dropped: bool
    n_ticks: int
    tick_minutes: int
    objective: float
    hints: int
    run_length_penalty: int
    fragmentation_penalty: int
    solves: int
    build_ms: int  # CP-SAT model construction
    total_ms: int  # end-to-end inside the service (NFR-P1 accounting)


class PlanResponse(_Strict):
    engine: Literal["learned"] = "learned"
    model_version: str
    solver_status: str
    assignments: list[Assignment]
    unplaced: list[Unplaced]
    infeasible: Infeasible | None
    telemetry: Telemetry


class FeedbackTuple(_Strict):
    recommendation_id: str = Field(min_length=1, max_length=64)
    kind: Kind = "outcome"
    reward: float = Field(ge=0.0, le=1.0)
    reason: Reason
    category: Category
    features: list[float] = Field(min_length=FEATURE_DIM, max_length=FEATURE_DIM)
    excluded: bool = False
    excluded_reason: str | None = None
    attributed_at: AwareDatetime
    correction: bool = False


class FeedbackRequest(_Strict):
    user_id: uuid.UUID
    tuples: list[FeedbackTuple] = Field(max_length=1000)


class FeedbackResponse(_Strict):
    updated: int
    skipped_excluded: int
    rebuilt: bool
    state_version: int


Label = Literal["correct", "incorrect", "none"]


class HeatmapCell(_Strict):
    category: Category
    daypart: str
    day_type: Literal["weekday", "weekend"]
    mean: float
    ci: tuple[float, float]
    n_effective: float
    # P9 (specs/07 §3.6 rung 2): the cell's evidence exceeds its prior, or it carries a label
    personal: bool = False


class Affinity(_Strict):
    key: str
    params: dict[str, Any]
    confidence: float
    state_ref: str
    # P9: the label in force on the referenced cell (FR-41 toggle state) and rung-2 phrasing
    label: Label | None = None
    personal: bool = False


class Belief(_Strict):
    """FR-41 "What Hourwell believes about you": per (category, day_type) the daypart the
    posterior currently favours — present even below the affinity threshold, so the user always
    has something to confirm or correct (FR-33 "actually, I am a morning person")."""

    category: Category
    day_type: Literal["weekday", "weekend"]
    daypart: str
    mean: float
    factor: float
    confidence: float
    n_effective: float
    personal: bool
    affinity: bool
    state_ref: str
    label: Label | None = None


class LabelState(_Strict):
    state_ref: str
    label: Label
    labeled_at: datetime


class AdherenceWeek(_Strict):
    week: str
    par: float


class InsightsResponse(_Strict):
    heatmap: list[HeatmapCell]
    affinities: list[Affinity]
    adherence: list[AdherenceWeek]
    # P9 additions (additive — the P5 contract shape above is unchanged)
    beliefs: list[Belief] = Field(default_factory=list)
    learning_mode: bool = True
    labels: list[LabelState] = Field(default_factory=list)


class BeliefLabel(_Strict):
    """One client `belief_label` fact (P9, ADR-0013); `id` = the event op_id."""

    id: str = Field(min_length=1, max_length=128)
    state_ref: str = Field(min_length=6, max_length=64)
    label: Label
    labeled_at: AwareDatetime


class LabelsRequest(_Strict):
    user_id: uuid.UUID
    labels: list[BeliefLabel] = Field(min_length=1, max_length=200)


class LabelsResponse(_Strict):
    applied: int
    rebuilt: bool
    state_version: int


class ParsePreviewRequest(_Strict):
    text: str = Field(min_length=1, max_length=500)
    timezone: str
    now: AwareDatetime

    @model_validator(mode="after")
    def _tz(self) -> ParsePreviewRequest:
        try:
            ZoneInfo(self.timezone)
        except Exception as exc:  # noqa: BLE001
            raise ValueError(f"unknown timezone {self.timezone!r}") from exc
        return self


class ParsePreviewResponse(_Strict):
    title: str
    category_guess: Category | None
    est_minutes: int | None
    deadline: datetime | None
    ambiguities: list[str]


class HealthzResponse(_Strict):
    status: Literal["ok"]
    model_versions: dict[str, str | None]
    uptime_s: float
    storage: Literal["postgres", "memory"]
    build: str  # RECSYS_BUILD at image build time (git sha) — the rollout check reads it
    arch: str  # platform.machine(): "aarch64" on the ADR-0009 box
