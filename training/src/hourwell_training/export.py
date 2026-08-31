"""Read-side of the pipeline: every SELECT flows through the whitelist module (NFR-S3 —
there is no other SQL producer), events pass the closed-vocabulary gate, and feature
snapshots are validated numeric-only before anything leaves the connection.

Runs on the EU VM against DATABASE_URL (ADR-0011 option A) or against the CI stack's local
Postgres in synthetic mode — the code cannot tell the difference, which is the point.
"""

from __future__ import annotations

from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from typing import Any

import psycopg
from psycopg.rows import dict_row

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


def validate_features(value: object) -> list[float] | None:
    """The features snapshot must be a flat numeric array (specs/07 §7)."""
    if not isinstance(value, list):
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
            psycopg.connect(self.conninfo, row_factory=dict_row) as conn,
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
    def cell_obs_by_user(self, dropped: DroppedRows) -> dict[str, list[CellObs]]:
        out: dict[str, list[CellObs]] = {}
        for row in self.table("beta_cells", dropped):
            out.setdefault(str(row["user_id"]), []).append(
                CellObs(
                    category=row["category"],
                    daypart=row["daypart"],
                    day_type=row["day_type"],
                    succ=float(row["succ"]),
                    fail=float(row["fail"]),
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
        with psycopg.connect(self.conninfo, row_factory=dict_row) as conn:
            return {str(r["user_id"]): int(r["n"]) for r in conn.execute(sql)}

    def slice_rows(self, dropped: DroppedRows) -> list[SliceRow]:
        """The randomized slice: experiment rows joined to their plan's logged A_m(x) and
        their attributed reward. Rows without full provenance are counted and skipped —
        ope.replay would refuse them anyway."""
        sql = """
            select r.id, r.context_bucket, r.propensity, r.features,
                   p.arm, p.engine, p.plan_date,
                   p.telemetry -> 'ef' -> 'experiment' -> 'top_m' as top_m,
                   fr.reward, fr.excluded
              from public.recommendations r
              join public.plans p on p.id = r.plan_id
              left join public.feedback_rewards fr
                     on fr.recommendation_id = r.id and fr.kind = 'outcome'
             where r.is_experiment
        """
        out: list[SliceRow] = []
        with psycopg.connect(self.conninfo, row_factory=dict_row) as conn:
            for row in conn.execute(sql):
                top_m = row["top_m"]
                if not isinstance(top_m, list) or not top_m:
                    dropped.bump("slice:no_logged_top_m")
                    continue
                if row["propensity"] is None:
                    dropped.bump("slice:no_propensity")
                    continue
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
                }
                context.update({f"x{i}": v for i, v in enumerate(feats)})
                out.append(
                    SliceRow(
                        recommendation_id=str(row["id"]),
                        bucket_id=row["context_bucket"],
                        top_m=tuple(str(b) for b in top_m),
                        propensity=float(row["propensity"]),
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
    with psycopg.connect(conninfo, row_factory=dict_row) as conn:
        return {
            r["column_name"]: r["data_type"]
            for r in conn.execute(sql, (table, list(columns)))
        }
