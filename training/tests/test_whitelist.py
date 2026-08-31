"""NFR-S3 whitelist contract (specs/07 §7; ADR-0015 §2).

Three locks: (1) the closed-vocab pair list here is byte-identical to the pgTAP fixture that
proves each pair is CHECK-constrained in the schema; (2) no free-text or blob column name can
enter the whitelist; (3) the SQL producer only ever emits whitelisted columns + typed DERIVED
extractions.
"""

from __future__ import annotations

import re
from pathlib import Path

from hourwell_training import whitelist as wl

REPO_ROOT = Path(__file__).resolve().parents[2]
PGTAP = REPO_ROOT / "supabase" / "tests" / "p11_training_test.sql"

#: Column names that must never be exportable, per table or anywhere (free text / blobs /
#: client-generated strings). A new column with one of these names fails closed.
FORBIDDEN_COLUMNS = {
    "title",
    "rationale_key",
    "rationale_params",
    "payload",
    "context",
    "telemetry",
    "settings",
    "working_hours",
    "sleep_window",
    "top_categories",
    "locale",
    "timezone",
    "op_id",
    "reason",
    "excluded_reason",
    "email",
    "state_ref",
    "label",
}


def pgtap_pairs() -> set[tuple[str, str]]:
    text = PGTAP.read_text()
    block = re.search(r"insert into __wl \(t, col\) values\n(.*?);", text, re.S)
    assert block, "pgTAP whitelist fixture not found"
    return set(re.findall(r"\('([a-z_]+)', '([a-z_]+)'\)", block.group(1)))


def test_closed_vocab_pairs_match_pgtap() -> None:
    assert wl.closed_vocab_pairs() == pgtap_pairs()


def test_no_forbidden_column_is_whitelisted() -> None:
    for table, cols in wl.WHITELIST.items():
        assert not FORBIDDEN_COLUMNS.intersection(cols), (table, cols)


def test_every_text_column_is_closed_vocab_or_argued() -> None:
    """Columns not in the closed-vocab list and not obviously typed must carry an argument."""
    typed_suffixes = ("_id", "_at", "_on", "_ms", "_ts", "id")
    typed_exact = {
        "succ", "fail", "alpha0", "beta0", "prior_version", "rmeq_score", "survey_skipped",
        "research_cohort", "eu_eea_resident", "reward", "excluded", "q_hat", "confidence",
        "propensity", "is_experiment", "conflict_flag", "chunk_index", "slot_start", "slot_end",
        "plan_date", "phase_no", "cluster_id", "local_day",
    }
    closed = wl.closed_vocab_pairs()
    for table, cols in wl.WHITELIST.items():
        for col in cols:
            if (table, col) in closed or (table, col) in wl.ARGUED_EXCEPTIONS:
                continue
            assert col in typed_exact or col.endswith(typed_suffixes), (
                f"{table}.{col} is neither closed-vocab, argued, nor recognizably typed"
            )


def test_sql_producer_emits_only_whitelisted_columns() -> None:
    """The SQL is reconstructed here from the whitelist — any other producer path fails."""
    for table in wl.WHITELIST:
        pieces = list(wl.WHITELIST[table])
        pieces += [f"{d.expression} as {d.name}" for d in wl.DERIVED if d.table == table]
        assert wl.select_sql(table) == f"select {', '.join(pieces)} from public.{table}"

def test_derived_extractions_are_typed_values_not_blobs() -> None:
    for d in wl.DERIVED:
        assert d.kind in {"numeric", "boolean", "text_closed", "timestamp", "text_array_closed"}
        # every expression reaches INTO the blob (->> or -> path), never selects the blob itself
        assert "->" in d.expression, d.expression
        assert d.why


def test_event_types_match_the_client_vocabulary() -> None:
    """EVENT_TYPES == CLIENT_EVENT_TYPES (apps/mobile/src/db/writes.ts) — one vocabulary."""
    writes = (REPO_ROOT / "apps" / "mobile" / "src" / "db" / "writes.ts").read_text()
    block = re.search(r"export const CLIENT_EVENT_TYPES = \[\n(.*?)\n\] as const;", writes, re.S)
    assert block, "CLIENT_EVENT_TYPES not found in writes.ts"
    client = set(re.findall(r"'([a-z_]+)'", block.group(1)))
    assert frozenset(client) == wl.EVENT_TYPES


def test_events_type_is_argued_and_gated() -> None:
    assert ("events", "type") in wl.ARGUED_EXCEPTIONS
    assert "focus_end" in wl.EVENT_TYPES and "task_created" in wl.EVENT_TYPES
    # the gate is meaningful only if it is closed: nothing free-form slipped in
    assert all(re.fullmatch(r"[a-z_]+", t) for t in wl.EVENT_TYPES)


def test_tables_are_a_subset_of_the_known_schema() -> None:
    """The whitelist may only name tables that exist in the base schema contract."""
    known = {
        "profiles", "tasks", "calendar_events", "plans", "recommendations", "events",
        "feedback_rewards", "bandit_state", "beta_cells", "blend_state", "prior_cells",
        "model_registry", "cluster_assignments", "study_assignments", "gcal_sync_state",
        "deletion_audit", "duration_estimates", "belief_labels", "sync_ops", "sync_leases",
        "recsys_applied_tuples", "cluster_cells",
    }
    assert set(wl.WHITELIST) <= known
    # and the riskiest tables are wholly absent
    assert "tasks" not in wl.WHITELIST and "calendar_events" not in wl.WHITELIST


def test_float4_slice_propensities_are_recovered_symbolically() -> None:
    """L22: pre-P6 rows stored float32(1/3); the adapter recovers the exact 1/|A_m(x)|,
    keeps genuinely exact values untouched, and refuses anything further off."""
    import struct

    from hourwell_training.export import normalize_slice_propensity

    f32_third = struct.unpack("f", struct.pack("f", 1.0 / 3.0))[0]  # 0.3333333432674408
    assert normalize_slice_propensity(f32_third, 3) == 1.0 / 3.0
    assert normalize_slice_propensity(0.25, 4) == 0.25
    assert normalize_slice_propensity(0.5, 4) is None  # corrupt, not rounding
