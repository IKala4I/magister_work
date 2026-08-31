"""Read-side of the pipeline: every SELECT flows through the whitelist module (NFR-S3 —
there is no other SQL producer), events pass the closed-vocabulary gate, and feature
snapshots are validated numeric-only before anything leaves the connection.

Runs on the EU VM against DATABASE_URL (ADR-0011 option A) or against the CI stack's local
Postgres in synthetic mode — the code cannot tell the difference, which is the point.
"""

from __future__ import annotations

from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from hourwell_recsys.energy import BetaCell, decayed_evidence
from hourwell_recsys.params import FEATURE_DIM
from psycopg.rows import dict_row

from hourwell_training import db
from hourwell_training.als import CellObs
from hourwell_training.ope import SliceRow
from hourwell_training.whitelist import EVENT_TYPES, WHITELIST, select_sql

__all__ = [
    "DroppedRows",
    "Exporter",
    "validate_features",
]


class DroppedRows(dict[str, int]):
    """table → rows the gates refused (unknown event type, non-numeric features).
    Loud in the run report; the rows themselves never leave the database."""

    def bump(self, key: str) -> None:
        self[key] = self.get(key, 0) + 1


def normalize_slice_propensity(p: float, m: int) -> float | None:
    """Spec-conflicts L22's symbolic recovery: M-01 was float4 (`real`) until migration
    20260827130000, so pre-P6 rows store e.g. float32(1/3) = 0.33333334… — a 6e-8 relative
    error that would ride into every 1/p weight AND fail the harness's strict exactness
    check (it did, on the first fixed live run 2026-08-31). A_m(x) is logged, so p is
    recoverable as 1/|A_m(x)| exactly. Within float32 rounding (1e-6) → the exact value;
    anything further off is corrupt → None (drop + count)."""
    exact = 1.0 / m
    if abs(p - exact) <= 1e-9:
        return p
    if abs(p - exact) <= 1e-6:
        return exact
    return None


def validate_features(value: object) -> list[float] | None:
    """The features snapshot must be a flat numeric array of exactly d = 17 (specs/07
    §3.2.4) — a short/long snapshot would silently zero-pad the DM and the probe
    (adversarial finding 13)."""
    if not isinstance(value, list) or len(value) != FEATURE_DIM:
        return None
    out: list[float] = []
    for v in value:
        if isinstance(v, bool) or not isinstance(v, int | float):
            return None
        out.append(float(v))
    return out


@dataclass
class Exporter:
    conninfo: str

    def _rows(self, table: str, extra_sql: str = "") -> Iterator[dict[str, Any]]:
        assert table in WHITELIST  # the only SQL producer is whitelist.select_sql
        with (
            db.connect(self.conninfo, row_factory=dict_row) as conn,
            conn.cursor(name=f"exp_{table}") as cur,
        ):
            cur.execute(select_sql(table) + extra_sql)
            yield from cur

    def table(self, table: str, dropped: DroppedRows) -> Iterator[dict[str, Any]]:
        """Whitelisted rows with the per-table gates applied."""
        for row in self._rows(table):
            if table == "events" and row["type"] not in EVENT_TYPES:
                dropped.bump("events:unknown_type")
                continue
            if "features" in row:
                feats = validate_features(row["features"])
                if feats is None:
                    dropped.bump(f"{table}:non_numeric_features")
                    continue
                row["features"] = feats
            yield row

    # ------------------------------------------------------------------
    # shaped loaders for the pipeline stages
    # ------------------------------------------------------------------
    def cell_obs_by_user(
        self, dropped: DroppedRows, now: datetime
    ) -> dict[str, list[CellObs]]:
        """Decayed AS OF NOW (ADR-0015 §3 "decayed cell aggregates") — stored succ/fail is
        only decayed to each cell's last_event_at, which would weight a long-idle user's
        stale evidence at full ALS confidence (adversarial finding 8)."""
        out: dict[str, list[CellObs]] = {}
        for row in self.table("beta_cells", dropped):
            s, f = decayed_evidence(
                BetaCell(
                    category=row["category"],
                    daypart=row["daypart"],
                    day_type=row["day_type"],
                    alpha0=float(row["alpha0"]),
                    beta0=float(row["beta0"]),
                    succ=float(row["succ"]),
                    fail=float(row["fail"]),
                    last_event_at=row["last_event_at"],
                ),
                now,
            )
            out.setdefault(str(row["user_id"]), []).append(
                CellObs(
                    category=row["category"],
                    daypart=row["daypart"],
                    day_type=row["day_type"],
                    succ=s,
                    fail=f,
                )
            )
        return out

    def chronotype_by_user(self, dropped: DroppedRows) -> dict[str, str]:
        return {
            str(r["user_id"]): r["chronotype_class"] or "INT"
            for r in self.table("profiles", dropped)
        }

    def prior_strength_by_cell(
        self, dropped: DroppedRows
    ) -> dict[tuple[str, str, str, str], float]:
        """(user, cat, daypart, day_type) → the cell's own prior strength α₀+β₀ (the
        rung-2 maturity threshold: decayed S+F must exceed it)."""
        return {
            (str(r["user_id"]), r["category"], r["daypart"], r["day_type"]):
                float(r["alpha0"]) + float(r["beta0"])
            for r in self.table("beta_cells", dropped)
        }

    def attributed_outcomes_by_user(self) -> dict[str, int]:
        """Non-excluded outcome tuples per user — the File 04 §3.4 fold-in gate counter."""
        sql = (
            "select user_id, count(*) as n from public.feedback_rewards "
            "where kind = 'outcome' and not excluded group by user_id"
        )
        with db.connect(self.conninfo, row_factory=dict_row) as conn:
            return {str(r["user_id"]): int(r["n"]) for r in conn.execute(sql)}

    def slice_rows(self, dropped: DroppedRows) -> list[SliceRow]:
        """The randomized slice: experiment rows joined to their plan's logged A_m(x) and
        their attributed reward. Rows without full provenance are counted and skipped —
        ope.replay would refuse them anyway."""
        sql = """
            select r.id, r.user_id, r.context_bucket, r.propensity, r.features,
                   t.category, p.arm, p.engine, p.plan_date,
                   p.telemetry -> 'ef' -> 'experiment' -> 'top_m' as top_m,
                   fr.reward, fr.excluded
              from public.recommendations r
              join public.plans p on p.id = r.plan_id
              join public.tasks t on t.id = r.task_id
              left join public.feedback_rewards fr
                     on fr.recommendation_id = r.id and fr.kind = 'outcome'
             where r.is_experiment
        """
        out: list[SliceRow] = []
        with db.connect(self.conninfo, row_factory=dict_row) as conn:
            for row in conn.execute(sql):
                top_m = row["top_m"]
                if not isinstance(top_m, list) or not top_m:
                    dropped.bump("slice:no_logged_top_m")
                    continue
                if row["propensity"] is None:
                    dropped.bump("slice:no_propensity")
                    continue
                p = normalize_slice_propensity(float(row["propensity"]), len(top_m))
                if p is None:
                    dropped.bump("slice:corrupt_propensity")
                    continue
                if p != float(row["propensity"]):
                    dropped.bump("slice:float4_propensity_normalized")
                if row["reward"] is None or row["excluded"]:
                    dropped.bump("slice:no_usable_reward")
                    continue
                feats = validate_features(row["features"])
                if feats is None:
                    dropped.bump("slice:non_numeric_features")
                    continue
                context: dict[str, float | str | bool | None] = {
                    "arm": row["arm"],
                    "engine": row["engine"],
                    "user_id": str(row["user_id"]),
                    "category": row["category"],
                }
                context.update({f"x{i}": v for i, v in enumerate(feats)})
                out.append(
                    SliceRow(
                        recommendation_id=str(row["id"]),
                        bucket_id=row["context_bucket"],
                        top_m=tuple(str(b) for b in top_m),
                        propensity=p,
                        reward=float(row["reward"]),
                        context=context,
                    )
                )
        return out


def column_types(conninfo: str, table: str, columns: Sequence[str]) -> dict[str, str]:
    """information_schema types for a whitelisted table — the archive stamps them into its
    manifest so the deposit is self-describing."""
    sql = """
        select column_name, data_type from information_schema.columns
         where table_schema = 'public' and table_name = %s and column_name = any(%s)
    """
    with db.connect(conninfo, row_factory=dict_row) as conn:
        return {
            r["column_name"]: r["data_type"]
            for r in conn.execute(sql, (table, list(columns)))
        }


WEEKDAY_BUCKETS: tuple[str, ...] = (
    "EM.wd", "MO.wd.fresh", "MO.wd.fatigued", "MD.wd",
    "AF.wd.fresh", "AF.wd.fatigued", "EV.wd", "NT.wd",
)
WEEKEND_BUCKETS: tuple[str, ...] = ("EM.we", "MO.we", "MD.we", "AF.we", "EV.we", "NT.we")


def ts_candidate_set(bucket_id: str) -> tuple[str, ...]:
    """The MC backfill's candidate approximation (ADR-0015 §10): the day-type vocabulary."""
    return WEEKEND_BUCKETS if bucket_id.split(".")[1] == "we" else WEEKDAY_BUCKETS


def mixed_ts_rows(exporter: Exporter, dropped: DroppedRows) -> list[SliceRow]:
    """TS traffic with nightly MC propensities (File 04 §2.3 "all logged traffic") —
    `exact = False` rows for the IPS family; replay refuses them by construction.
    The candidate set mirrors the backfill's approximation, stated in the report."""
    sql = """
        select r.id, r.user_id, r.context_bucket, r.propensity, r.features, t.category,
               p.arm, p.engine, fr.reward, fr.excluded
          from public.recommendations r
          join public.plans p on p.id = r.plan_id
          join public.tasks t on t.id = r.task_id
          join public.feedback_rewards fr
                 on fr.recommendation_id = r.id and fr.kind = 'outcome'
         where not r.is_experiment and r.engine = 'learned' and r.propensity is not null
    """
    out: list[SliceRow] = []
    with db.connect(exporter.conninfo, row_factory=dict_row) as conn:
        for row in conn.execute(sql):
            if row["excluded"]:
                dropped.bump("mixed:excluded_reward")
                continue
            feats = validate_features(row["features"])
            if feats is None:
                dropped.bump("mixed:non_numeric_features")
                continue
            context: dict[str, float | str | bool | None] = {
                "arm": row["arm"],
                "engine": row["engine"],
                "user_id": str(row["user_id"]),
                "category": row["category"],
            }
            context.update({f"x{i}": v for i, v in enumerate(feats)})
            out.append(
                SliceRow(
                    recommendation_id=str(row["id"]),
                    bucket_id=row["context_bucket"],
                    top_m=ts_candidate_set(row["context_bucket"]),
                    propensity=float(row["propensity"]),
                    reward=float(row["reward"]),
                    context=context,
                    exact=False,
                )
            )
    return out
