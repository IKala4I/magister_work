"""The NFR-S3 export surface — the only producer of CROSS-USER export/archive SQL.

Scope, precisely: everything that feeds cross-user training or the Parquet archive flows
through `select_sql` below. The pipeline additionally makes (a) per-user state reads for the
MC backfill (bandit/blend/beta rows of one user at a time — the same data the service itself
serves that user) and (b) privacy-§7 aggregate COUNT queries for the report; both are
enumerated in `pipeline.py`, neither feeds cross-user training or leaves the region.

specs/07 §7: "The training-export query selects an explicit column whitelist; a CI test asserts
the whitelist contains no text-typed columns." Rule as decided by ADR-0015 §2: every column here
is numeric / boolean / date / timestamp / uuid, or a text column whose values a named CHECK
constraint pins in the schema (closed vocabulary — pgTAP §2 of p11_training_test.sql proves the
constraint exists for every pair; tests/test_whitelist.py pins the two lists to each other), or
one of the ARGUED_EXCEPTIONS below. Free text (titles, rationale params, payloads, notes) can
never be selected: it is not in the list, and the list is the only SQL producer.

`DERIVED` entries extract single typed values out of jsonb blobs (never the blob itself):
the replay needs A_m(x) from the plan telemetry (File 04 §2.2), PAR needs the focus_end
payload numbers (File 06 §1.4). Each names its type and why it is safe.
"""

from __future__ import annotations

from dataclasses import dataclass

#: (table, column) → why a non-CHECKed or jsonb column is still exportable.
ARGUED_EXCEPTIONS: dict[tuple[str, str], str] = {
    ("recommendations", "features"): (
        "jsonb, numeric-only by construction (specs/07 §7: the x snapshot is a numeric array); "
        "export re-validates every element and drops non-numeric rows loudly"
    ),
    ("feedback_rewards", "features"): "same numeric-array contract as recommendations.features",
    ("events", "type"): (
        "closed vocabulary in code but client-writable text in schema; export passes values "
        "through EVENT_TYPES and drops+counts unknown ones (they never leave the database)"
    ),
    ("recommendations", "model_version"): (
        "service-authored version tag (NFR-O1); clients cannot write it (RLS: placements are "
        "service-authored, client updates are status/version only)"
    ),
    ("plans", "model_version"): "service-authored version tag (NFR-O1), plan rows are EF-written",
}

#: Event types the export lets through — pinned byte-for-byte to the client's
#: CLIENT_EVENT_TYPES (apps/mobile/src/db/writes.ts) by tests/test_whitelist.py. An event of
#: any other type stays in the database and is counted in the run report.
EVENT_TYPES: frozenset[str] = frozenset({
    "task_created",
    "recommendation_shown",
    "focus_start",
    "focus_pause",
    "focus_resume",
    "focus_end",
    "task_completed",
    "block_skipped",
    "block_moved",
    "lapse_observed",
    "lapse_corrected",
    "session_rated",
    "skip_diagnostic",
    "belief_label",
    "tradeoff_decision",
    "tradeoff_rejected",
    "weekly_review_completed",
    "notification_response",
})

#: Closed-vocabulary text columns — every pair MUST have a CHECK constraint in the schema;
#: pgTAP proves it and tests/test_whitelist.py pins this list to the pgTAP fixture.
CLOSED_VOCAB_TEXT: tuple[tuple[str, str], ...] = (
    ("profiles", "chronotype_class"),
    ("beta_cells", "category"),
    ("beta_cells", "daypart"),
    ("beta_cells", "day_type"),
    ("feedback_rewards", "kind"),
    ("feedback_rewards", "category"),
    ("recommendations", "context_bucket"),
    ("recommendations", "engine"),
    ("recommendations", "status"),
    ("plans", "horizon"),
    ("plans", "engine"),
    ("plans", "arm"),
    ("cluster_assignments", "method"),
    ("study_assignments", "sequence"),
    ("study_assignments", "arm"),
)

#: table → exportable columns (plain SELECT list). Everything else in those tables — and
#: every table not listed — never crosses into training or the archive.
WHITELIST: dict[str, tuple[str, ...]] = {
    "profiles": (
        "user_id",
        "chronotype_class",
        "rmeq_score",
        "survey_skipped",
        "research_cohort",
        "eu_eea_resident",
        "onboarding_completed_at",
    ),
    "beta_cells": (
        "user_id",
        "category",
        "daypart",
        "day_type",
        "succ",
        "fail",
        "alpha0",
        "beta0",
        "prior_version",
        "last_event_at",
        "updated_at",
    ),
    "feedback_rewards": (
        "user_id",
        "recommendation_id",
        "kind",
        "reward",
        "category",
        "features",
        "excluded",
        "attributed_at",
        "corrected_at",
    ),
    "recommendations": (
        "id",
        "user_id",
        "plan_id",
        "task_id",
        "chunk_index",
        "slot_start",
        "slot_end",
        "context_bucket",
        "features",
        "q_hat",
        "confidence",
        "propensity",
        "is_experiment",
        "conflict_flag",
        "engine",
        "status",
        "model_version",
        "attributed_at",
    ),
    "plans": (
        "id",
        "user_id",
        "plan_date",
        "horizon",
        "engine",
        "arm",
        "model_version",
        "generated_at",
    ),
    "cluster_assignments": (
        "user_id",
        "cluster_id",
        "method",
        "assigned_at",
    ),
    "study_assignments": (
        "user_id",
        "phase_no",
        "sequence",
        "arm",
        "starts_on",
        "ends_on",
    ),
    "events": (
        "id",
        "user_id",
        "type",
        "task_id",
        "recommendation_id",
        "client_ts",
        "server_ts",
        "local_day",
    ),
}


@dataclass(frozen=True)
class Derived:
    """One typed value extracted from a jsonb blob (never the blob)."""

    table: str
    name: str
    expression: str
    kind: str  # 'numeric' | 'boolean' | 'text_closed' | 'timestamp' | 'text_array_closed'
    why: str


DERIVED: tuple[Derived, ...] = (
    Derived(
        "plans",
        "ef_reason",
        "telemetry -> 'ef' ->> 'reason'",
        "text_closed",
        "learned|arm_a|fallback:<kind> — L17 provenance label; closed in code",
    ),
    Derived(
        "plans",
        "experiment_dropped",
        "(telemetry -> 'ef' ->> 'experiment_dropped')::boolean",
        "boolean",
        "the drop-rate report per arm (revisit P6) and slice selection accounting",
    ),
    Derived(
        "plans",
        "experiment_top_m",
        "telemetry -> 'ef' -> 'experiment' -> 'top_m'",
        "text_array_closed",
        "A_m(x) for File 04 §2.2 replay; bucket ids from the CHECK-pinned phi vocabulary",
    ),
    Derived(
        "plans",
        "experiment_propensity",
        "(telemetry -> 'ef' -> 'experiment' ->> 'propensity')::double precision",
        "numeric",
        "cross-check of the M-01 row value (they must agree; the report flags mismatches)",
    ),
    Derived(
        "events",
        "focus_started_at",
        "case when type = 'focus_end' "
        "and pg_input_is_valid(payload ->> 'started_at', 'timestamptz') "
        "then (payload ->> 'started_at')::timestamptz end",
        "timestamp",
        "PAR needs the session start (File 06 §1.4 ±15 min rule); the payload is "
        "client-writable and events are append-only, so an unguarded cast could brick "
        "every future export on one bad row (adversarial finding 9)",
    ),
    Derived(
        "events",
        "focus_outcome",
        "case when type = 'focus_end' and payload ->> 'outcome' in ('finished', 'abandoned') "
        "then payload ->> 'outcome' end",
        "text_closed",
        "PAR finished/abandoned; values outside the pair export as NULL",
    ),
    Derived(
        "events",
        "focused_ms",
        "case when type = 'focus_end' "
        "and pg_input_is_valid(payload ->> 'focused_ms', 'double precision') "
        "then (payload ->> 'focused_ms')::double precision end",
        "numeric",
        "PAR >=50% rule numerator (guarded: client-writable payload)",
    ),
    Derived(
        "events",
        "planned_minutes",
        "case when type = 'focus_end' "
        "and pg_input_is_valid(payload ->> 'planned_minutes', 'double precision') "
        "then (payload ->> 'planned_minutes')::double precision end",
        "numeric",
        "PAR >=50% rule denominator override (mirrors _shared/par.ts; guarded)",
    ),
)


def select_sql(table: str) -> str:
    """The one producer of export SQL: plain whitelisted columns + this table's DERIVED."""
    cols = list(WHITELIST[table])
    cols += [f"{d.expression} as {d.name}" for d in DERIVED if d.table == table]
    return f"select {', '.join(cols)} from public.{table}"  # noqa: S608 — closed input


def closed_vocab_pairs() -> frozenset[tuple[str, str]]:
    return frozenset(CLOSED_VOCAB_TEXT)
