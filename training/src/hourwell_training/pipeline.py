"""The nightly run (ADR-0015): export → EB prior refresh (+gate) → ALS → clusters →
fold-in with unvisited-cell-only refresh → MC propensity backfill → aggregate report.

Everything happens on the EU VM against DATABASE_URL (ADR-0011 option A); in CI the same
code runs against the local stack seeded with synthetic data — no branch distinguishes
them. Every stage is skippable-by-data (a thin cohort skips ALS, an unfittable refresh
carries over) and says so in the summary; nothing fails silently.
"""

from __future__ import annotations

import hashlib
import io
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import psycopg
from hourwell_recsys import bandit
from hourwell_recsys.blend import Blend
from hourwell_recsys.contexts import DAYPART_ORDER
from hourwell_recsys.energy import BetaCell, decayed_evidence, posterior
from psycopg.rows import dict_row
from sklearn.linear_model import LogisticRegression

from hourwell_training import als, clusters, ope, par, priors, propensity, report
from hourwell_training.export import DroppedRows, Exporter, mixed_ts_rows
from hourwell_training.params import (
    DM_FEATURE_SLICE,
    EB_MIN_USERS,
    HOLDOUT_USER_FRACTION,
)
from hourwell_training.registry import RegistryClient

__all__ = ["run_nightly"]


@dataclass
class Ctx:
    conninfo: str
    registry: RegistryClient
    now: datetime
    seed: int
    dropped: DroppedRows
    summary: dict[str, Any]


def _holdout(uid: str) -> bool:
    h = int(hashlib.sha256(uid.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
    return h < HOLDOUT_USER_FRACTION


def _mature_rates(
    ctx: Ctx, exp: Exporter, chrono: dict[str, str]
) -> tuple[dict[priors.CellKey, list[float]], dict[priors.CellKey, list[float]]]:
    """(train, holdout) mature cell rates keyed by (class, category, daypart, day_type)."""
    train: dict[priors.CellKey, list[float]] = {}
    hold: dict[priors.CellKey, list[float]] = {}
    for row in exp.table("beta_cells", ctx.dropped):
        uid = str(row["user_id"])
        cell = BetaCell(
            category=row["category"],
            daypart=row["daypart"],
            day_type=row["day_type"],
            alpha0=float(row["alpha0"]),
            beta0=float(row["beta0"]),
            succ=float(row["succ"]),
            fail=float(row["fail"]),
            last_event_at=row["last_event_at"],
        )
        s, f = decayed_evidence(cell, ctx.now)
        if s + f <= cell.alpha0 + cell.beta0:  # rung-2 maturity (File 04 §3.5)
            continue
        key: priors.CellKey = (
            chrono.get(uid, "INT"), row["category"], row["daypart"], row["day_type"]
        )
        (hold if _holdout(uid) else train).setdefault(key, []).append(s / (s + f))
    return train, hold


def _previous_priors(ctx: Ctx) -> tuple[int, dict[priors.CellKey, priors.PriorCell]]:
    """The version instantiate_user_priors would use (highest PROMOTED, fallback highest)."""
    with psycopg.connect(ctx.conninfo, row_factory=dict_row) as conn:
        row = conn.execute(
            """
            select max(pc.version) as v from public.prior_cells pc
              join public.model_registry mr
                on mr.kind = 'priors' and mr.promoted and mr.version = pc.version::text
            """
        ).fetchone()
        version = row["v"] if row and row["v"] is not None else None
        if version is None:
            row = conn.execute("select max(version) as v from public.prior_cells").fetchone()
            version = row["v"] if row else 0
        table: dict[priors.CellKey, priors.PriorCell] = {}
        for r in conn.execute(
            "select chronotype_class, category, daypart, day_type, mu0, n0 "
            "from public.prior_cells where version = %s",
            (version,),
        ):
            table[(r["chronotype_class"], r["category"], r["daypart"], r["day_type"])] = (
                priors.PriorCell(mu0=float(r["mu0"]), n0=float(r["n0"]))
            )
    return int(version), table


def _stage_priors(ctx: Ctx, exp: Exporter, chrono: dict[str, str]) -> None:
    prev_version, prev = _previous_priors(ctx)
    train, hold = _mature_rates(ctx, exp, chrono)
    new_table, fit_metrics = priors.refresh(train, prev)
    out: dict[str, Any] = {"previous_version": prev_version, **fit_metrics}
    if fit_metrics["cells_refit"] == 0.0:
        out["skipped"] = "no cell cleared the refit guards — carry-over only, nothing recorded"
        ctx.summary["priors"] = out
        return
    gate_metrics: dict[str, Any]
    try:
        promoted, gate_metrics = priors.eval_gate(new_table, prev, hold)
    except ValueError:
        promoted, gate_metrics = False, {"note": "no holdout observations — gate refused"}
    out.update(gate_metrics)
    complete = len(new_table) == 240  # 5 classes x 48 cells — an incomplete promoted
    # version would leave new users with a near-empty cell table (adversarial finding 19)
    if not complete:
        promoted = False
        out["completeness"] = f"{len(new_table)}/240 — promotion refused"
    version = max(prev_version + 1, ctx.registry.next_version("priors"))
    artifact: dict[str, Any] = {
        "kind": "priors",
        "version": version,
        "cells": {"|".join(k): [c.mu0, c.n0] for k, c in sorted(new_table.items())},
        "metrics": {**fit_metrics, **gate_metrics},
    }
    uri = ctx.registry.upload_json(f"priors/{version}/priors.json", artifact)
    promoted = bool(promoted and uri is not None)
    ctx.registry.record("priors", str(version), uri, {**fit_metrics, **gate_metrics}, promoted)
    if promoted:
        with psycopg.connect(ctx.conninfo) as conn:
            conn.cursor().executemany(
                "insert into public.prior_cells "
                "(version, chronotype_class, category, daypart, day_type, mu0, n0) "
                "values (%s, %s, %s, %s, %s, %s, %s) on conflict do nothing",
                [
                    (version, k[0], k[1], k[2], k[3], c.mu0, c.n0)
                    for k, c in new_table.items()
                ],
            )
            conn.commit()
    out.update({"version": version, "promoted": promoted, "artifact": uri})
    ctx.summary["priors"] = out


def _cluster_cells_rows(
    model: als.AlsModel,
    clu: clusters.Clustering,
    cells_by_user: dict[str, list[als.CellObs]],
    strengths: dict[tuple[str, str, str, str], float],
    version: int,
) -> list[tuple[int, int, str, str, str, float, float]]:
    """Per-cluster EB aggregates over member cell rates (File 04 §3.4) — MATURE cells only
    (decayed evidence above the cell's own prior strength), the same rule the class-prior
    refresh applies. Without it, one-tuple cells and pure-label pseudo-evidence (rate
    exactly 0/1) polluted the aggregates that overwrite other users' unvisited priors
    (adversarial finding 5; a pure-label cell decays to <= its prior strength, so the
    strict > keeps statements-not-behaviour out)."""
    member_rates: dict[tuple[int, str, str, str], list[float]] = {}
    for idx, uid in enumerate(model.user_ids):
        cluster_id = int(clu.labels[idx])
        for obs in cells_by_user.get(uid, []):
            strength = strengths.get((uid, obs.category, obs.daypart, obs.day_type))
            if strength is not None and obs.evidence > strength:
                member_rates.setdefault(
                    (cluster_id, obs.category, obs.daypart, obs.day_type), []
                ).append(obs.rate)
    rows = []
    for (cid, cat, dp, dt), rates in sorted(member_rates.items()):
        fitted = priors.fit_cell(rates)
        if fitted is not None:
            rows.append((version, cid, cat, dp, dt, fitted.mu0, fitted.n0))
    return rows


def _stage_als(ctx: Ctx, exp: Exporter, cells_by_user: dict[str, list[als.CellObs]]) -> None:
    with_evidence = {
        u: cs for u, cs in cells_by_user.items() if any(c.evidence > 0 for c in cs)
    }
    if len(with_evidence) < EB_MIN_USERS:
        ctx.summary["als"] = {
            "skipped": f"{len(with_evidence)} users with evidence < {EB_MIN_USERS}"
        }
        return
    model = als.fit_als(with_evidence, seed=ctx.seed)
    clu = clusters.fit_clusters(model.user_factors, seed=ctx.seed)
    if clu is None:
        ctx.summary["als"] = {"skipped": "cohort too small for any k — previous clustering kept"}
        return
    version = ctx.registry.next_version("als")
    buf = io.BytesIO()
    np.savez(
        buf,
        user_ids=np.asarray(model.user_ids),
        user_factors=model.user_factors,
        item_factors=model.item_factors,
        centroids=clu.centroids,
        labels=clu.labels,
    )
    uri = ctx.registry.upload(
        f"als/{version}/model.npz", buf.getvalue(), "application/octet-stream"
    )
    prev_sil = _latest_metric(ctx, "als", "silhouette")
    # a 0.05 tolerance band: silhouette is not comparable across growing cohorts, and a
    # strict ratchet would freeze "re-fit nightly" at the first lucky run (finding 10)
    promoted = bool(uri is not None and (prev_sil is None or clu.silhouette >= prev_sil - 0.05))
    metrics = {"k": clu.k, "silhouette": round(clu.silhouette, 4), "users": len(with_evidence)}
    ctx.registry.record("als", str(version), uri, metrics, promoted)
    ctx.summary["als"] = {**metrics, "version": version, "promoted": promoted, "artifact": uri}
    if not promoted:
        return
    strengths = exp.prior_strength_by_cell(ctx.dropped)
    rows = _cluster_cells_rows(model, clu, cells_by_user, strengths, version)
    outcomes = exp.attributed_outcomes_by_user()
    first_fold_ins = 0
    folded = 0
    refreshed_cells = 0
    with psycopg.connect(ctx.conninfo, row_factory=dict_row) as conn:
        if rows:
            conn.cursor().executemany(
                "insert into public.cluster_cells "
                "(version, cluster_id, category, daypart, day_type, mu0, n0) "
                "values (%s, %s, %s, %s, %s, %s, %s) on conflict do nothing",
                rows,
            )
        current_method = {
            str(r["user_id"]): r["method"]
            for r in conn.execute("select user_id, method from public.cluster_assignments")
        }
        for uid, cs in with_evidence.items():
            x = als.fold_in(model, cs, outcomes=outcomes.get(uid, 0))
            if x is None:
                continue
            folded += 1
            new_cluster = clusters.nearest_centroid(clu, x)
            if current_method.get(uid) != "als_foldin":
                first_fold_ins += 1
            # k-means label ids permute freely across runs, so "did the cluster change" is
            # not identifiable from raw ids (finding 11). Semantics: every folded-in user is
            # REASSIGNED nightly (File 04 §3.4 "re-fit nightly") and their UNVISITED cells
            # take the current promoted aggregates — idempotent for unchanged behaviour,
            # invariant 5 untouched (succ = 0 and fail = 0 rows only, prior_version kept:
            # cluster provenance lives in cluster_assignments + cluster_cells — finding 16).
            conn.execute(
                "insert into public.cluster_assignments (user_id, cluster_id, method, assigned_at) "
                "values (%s, %s, 'als_foldin', %s) "
                "on conflict (user_id) do update set cluster_id = excluded.cluster_id, "
                "method = excluded.method, assigned_at = excluded.assigned_at",
                (uid, new_cluster, ctx.now),
            )
            cur = conn.execute(
                """
                update public.beta_cells b
                   set alpha0 = cc.n0 * cc.mu0,
                       beta0 = cc.n0 * (1.0 - cc.mu0),
                       updated_at = now()
                  from public.cluster_cells cc
                 where b.user_id = %s and b.succ = 0 and b.fail = 0
                   and cc.version = %s and cc.cluster_id = %s
                   and cc.category = b.category and cc.daypart = b.daypart
                   and cc.day_type = b.day_type
                """,
                (uid, version, new_cluster),
            )
            refreshed_cells += cur.rowcount or 0
        conn.commit()
    ctx.summary["fold_in"] = {
        "folded": folded,
        "first_fold_ins": first_fold_ins,
        "unvisited_cells_refreshed": refreshed_cells,
        "cluster_cells_rows": len(rows),
    }


def _latest_metric(ctx: Ctx, kind: str, key: str) -> float | None:
    with psycopg.connect(ctx.conninfo, row_factory=dict_row) as conn:
        row = conn.execute(
            "select metrics ->> %s as v from public.model_registry "
            "where kind = %s and promoted order by created_at desc limit 1",
            (key, kind),
        ).fetchone()
    return float(row["v"]) if row and row["v"] is not None else None


def _stage_mc_backfill(ctx: Ctx, limit: int = 5000) -> None:
    sql = """
        select r.id, r.user_id, t.category, r.context_bucket, r.features
          from public.recommendations r
          join public.tasks t on t.id = r.task_id
         where r.propensity is null and not r.is_experiment and r.engine = 'learned'
         order by r.created_at
         limit %s
    """
    done = 0
    skipped = 0
    with psycopg.connect(ctx.conninfo, row_factory=dict_row) as conn:
        rows = conn.execute(sql, (limit,)).fetchall()
        states: dict[str, dict[str, bandit.LinearState]] = {}
        blends: dict[str, Blend] = {}
        cells: dict[str, dict[tuple[str, str], propensity.CellPosterior]] = {}
        for row in rows:
            uid = str(row["user_id"])
            if uid not in states:
                states[uid] = _load_bandit(conn, uid)
                blends[uid] = _load_blend(conn, uid)
                cells[uid] = _load_cells(conn, uid, ctx.now)
            state = states[uid].get(row["category"])
            feats = row["features"]
            if state is None or not isinstance(feats, list):
                skipped += 1
                continue
            mc_row = propensity.McRow(
                recommendation_id=str(row["id"]),
                category=row["category"],
                bucket_id=row["context_bucket"],
                features=tuple(float(v) for v in feats),
            )
            bucket_cells = {
                bucket: cp
                for (cat, bucket), cp in cells[uid].items()
                if cat == row["category"]
            }
            seed = int(hashlib.sha256(str(row["id"]).encode()).hexdigest()[:8], 16)
            p = propensity.mc_propensity(
                mc_row, state, blends[uid], bucket_cells, seed=seed
            )
            conn.execute(
                "update public.recommendations set propensity = %s where id = %s",
                (p, row["id"]),
            )
            done += 1
        dist = conn.execute(
            "select count(*) as n, min(propensity) as p_min, "
            "percentile_cont(0.5) within group (order by propensity) as p_med, "
            "max(propensity) as p_max from public.recommendations "
            "where propensity is not null and not is_experiment"
        ).fetchone()
        conn.commit()
    ctx.summary["mc_backfill"] = {
        "filled": done,
        "skipped": skipped,
        "distribution": {k: float(v) if v is not None else None for k, v in (dist or {}).items()},
    }


def _load_bandit(conn: psycopg.Connection[Any], uid: str) -> dict[str, bandit.LinearState]:
    out: dict[str, bandit.LinearState] = {}
    for r in conn.execute(
        "select category, d, a_matrix, b_vector, state_version "
        "from public.bandit_state where user_id = %s",
        (uid,),
    ):
        out[r["category"]] = bandit.from_arrays(
            r["category"], r["a_matrix"], r["b_vector"], int(r["d"]), int(r["state_version"])
        )
    return out


def _load_blend(conn: psycopg.Connection[Any], uid: str) -> Blend:
    r = conn.execute(
        "select w_energy, w_bandit from public.blend_state where user_id = %s", (uid,)
    ).fetchone()
    if r is None:
        return Blend()
    return Blend(round(float(r["w_energy"]), 6), round(1.0 - float(r["w_energy"]), 6))


def _load_cells(
    conn: psycopg.Connection[Any], uid: str, now: datetime
) -> dict[tuple[str, str], propensity.CellPosterior]:
    out: dict[tuple[str, str], propensity.CellPosterior] = {}
    for r in conn.execute(
        "select category, daypart, day_type, succ, fail, alpha0, beta0, last_event_at "
        "from public.beta_cells where user_id = %s",
        (uid,),
    ):
        cell = BetaCell(
            category=r["category"], daypart=r["daypart"], day_type=r["day_type"],
            alpha0=float(r["alpha0"]), beta0=float(r["beta0"]),
            succ=float(r["succ"]), fail=float(r["fail"]), last_event_at=r["last_event_at"],
        )
        post = posterior(cell, now)
        day_code = "wd" if r["day_type"] == "weekday" else "we"
        base = f"{r['daypart']}.{day_code}"
        buckets = (
            [f"{base}.fresh", f"{base}.fatigued"]
            if day_code == "wd" and r["daypart"] in ("MO", "AF")
            else [base]
        )
        for b in buckets:
            out[(r["category"], b)] = propensity.CellPosterior(post.mean, post.sd)
    return out


def _dm_model(rows: list[ope.SliceRow]) -> ope.RewardModel:
    """DR's direct method (ADR-0015 §9): logistic on the bucket-swappable slice 0–13."""
    xs = []
    ys = []
    for r in rows:
        feats = [float(r.context.get(f"x{i}", 0.0) or 0.0) for i in range(17)]
        xs.append(feats[DM_FEATURE_SLICE])
        ys.append(r.reward >= 0.5)
    if len(set(ys)) < 2:
        return lambda r, b: sum(ys) / max(len(ys), 1)
    fit = LogisticRegression(max_iter=1000).fit(np.asarray(xs), np.asarray(ys))

    def r_hat(r: ope.SliceRow, b: str) -> float:
        x = [float(r.context.get(f"x{i}", 0.0) or 0.0) for i in range(17)]
        x[1:7] = [0.0] * 6
        daypart, day_code = b.split(".")[0], b.split(".")[1]
        x[1 + [d.value for d in DAYPART_ORDER].index(daypart)] = 1.0
        x[7] = 1.0 if day_code == "we" else 0.0
        x[8] = 1.0 if b.endswith(".fatigued") else 0.0
        return float(fit.predict_proba(np.asarray([x[DM_FEATURE_SLICE]]))[0][1])

    return r_hat


def _par_by_arm_phase(ctx: Ctx, exp: Exporter) -> dict[str, Any]:
    """The study's PRIMARY outcome (File 06 §1.4) — per (arm × phase), from FACTS and
    PLACEMENTS only (par.py, H2). Row-level assembly happens in-region; only the grouped,
    min-cell-suppressed rates leave (privacy §7). Phase comes from the study_assignments
    date range, so no timezone leaves the database (adversarial finding 2)."""
    facts: dict[str, list[par.FocusFact]] = {}
    for row in exp.table("events", ctx.dropped):
        if row["type"] != "focus_end" or row["recommendation_id"] is None:
            continue
        rid = str(row["recommendation_id"])
        facts.setdefault(rid, []).append(
            par.FocusFact(
                recommendation_id=rid,
                started_at=row["focus_started_at"],
                outcome=row["focus_outcome"],
                focused_ms=row["focused_ms"],
                planned_minutes=row["planned_minutes"],
            )
        )
    pairs: list[tuple[str, float]] = []
    with psycopg.connect(ctx.conninfo, row_factory=dict_row) as conn:
        for r in conn.execute(
            """
            select r.id, r.slot_start, r.slot_end, r.status, p.arm, sa.phase_no
              from public.recommendations r
              join public.plans p on p.id = r.plan_id
              left join public.study_assignments sa on sa.user_id = r.user_id
                   and (r.slot_start at time zone 'UTC')::date
                       between sa.starts_on and sa.ends_on
             where r.slot_end < %s
            """,
            (ctx.now,),
        ):
            if r["status"] in par.PAR_SKIPPED_STATUSES:
                continue
            block = par.ParBlock(
                id=str(r["id"]),
                slot_start=r["slot_start"],
                slot_end=r["slot_end"],
                status=r["status"],
            )
            group = f"arm={r['arm'] or 'none'}|phase={r['phase_no'] or 0}"
            pairs.append((group, float(par.par_of_block(block, facts.get(block.id, [])))))
    return report.grouped_rate(pairs)


def _dm_sensitivity(rows: list[ope.SliceRow]) -> dict[str, Any]:
    """ADR-0015 §9: the DM excludes the bucket-dependent features 14–16; fit with and
    without them on the factual rows and report the shift on the shared coefficients."""
    xs14: list[list[float]] = []
    xs17: list[list[float]] = []
    ys: list[bool] = []
    for r in rows:
        feats = [float(r.context.get(f"x{i}", 0.0) or 0.0) for i in range(17)]
        xs14.append(feats[DM_FEATURE_SLICE])
        xs17.append(feats)
        ys.append(r.reward >= 0.5)
    if len(ys) < 10 or len(set(ys)) < 2:
        return {"note": "insufficient data for the sensitivity fit"}
    f14 = LogisticRegression(max_iter=1000).fit(np.asarray(xs14), np.asarray(ys))
    f17 = LogisticRegression(max_iter=1000).fit(np.asarray(xs17), np.asarray(ys))
    shift = float(np.linalg.norm(f17.coef_[0][:14] - f14.coef_[0]))
    return {"coef_shift_l2_on_shared_dims": round(shift, 4), "n": len(ys)}


def _posterior_policy(
    ctx: Ctx, rows: list[ope.SliceRow]
) -> tuple[ope.DeterministicPolicy, ope.StochasticPolicy]:
    """ADR-0015 §8's posterior-mean-greedy reference policy: argmax of the user's CURRENT
    Beta posterior mean over A_m(x) (evaluation-time state — the File 04 §2.3 caveat)."""
    users = {str(r.context["user_id"]) for r in rows if r.context.get("user_id")}
    cells: dict[str, dict[tuple[str, str], propensity.CellPosterior]] = {}
    with psycopg.connect(ctx.conninfo, row_factory=dict_row) as conn:
        for uid in users:
            cells[uid] = _load_cells(conn, uid, ctx.now)

    def det(r: ope.SliceRow) -> str:
        cm = cells.get(str(r.context.get("user_id")), {})
        cat = str(r.context.get("category"))

        def mean_of(b: str) -> float:
            cp = cm.get((cat, b))
            return cp.mean if cp is not None else 0.5

        return sorted(r.top_m, key=lambda b: (-mean_of(b), b))[0]

    def sto(r: ope.SliceRow, b: str) -> float:
        return 1.0 if b == det(r) else 0.0

    return det, sto


def _stage_report(ctx: Ctx, exp: Exporter, out_dir: Path) -> None:
    slice_rows = exp.slice_rows(ctx.dropped)
    doc: dict[str, Any] = {"run_date": ctx.now.date().isoformat()}
    doc["par_by_arm_phase"] = _par_by_arm_phase(ctx, exp)
    drops = [
        (str(r["arm"] or "none"), 1.0 if r["experiment_dropped"] else 0.0)
        for r in exp.table("plans", ctx.dropped)
        if r["experiment_dropped"] is not None
    ]
    doc["experiment_drop_rate_by_arm"] = report.grouped_rate(drops)
    if slice_rows:
        model = _dm_model(slice_rows)

        def logged_det(r: ope.SliceRow) -> str:
            return r.bucket_id

        def logged_sto(r: ope.SliceRow, b: str) -> float:
            return 1.0 if b == r.bucket_id else 0.0

        def uniform(r: ope.SliceRow, b: str) -> float:
            return 1.0 / len(r.top_m)

        def uniform_det(r: ope.SliceRow) -> str:
            return sorted(r.top_m)[0]

        def dm_det(r: ope.SliceRow) -> str:
            return sorted(r.top_m, key=lambda b: (-model(r, b), b))[0]

        def dm_sto(r: ope.SliceRow, b: str) -> float:
            return 1.0 if b == dm_det(r) else 0.0

        policies: dict[str, tuple[ope.DeterministicPolicy, ope.StochasticPolicy]] = {
            "logged": (logged_det, logged_sto),
            "uniform": (uniform_det, uniform),
            "dm_greedy": (dm_det, dm_sto),
            "posterior_mean_greedy": _posterior_policy(ctx, slice_rows),
        }
        doc["ope"] = report.ope_table(slice_rows, policies, model)
        doc["dm_sensitivity"] = _dm_sensitivity(slice_rows)
        probe = report.interference_probe(slice_rows)
        doc["interference_probe"] = {
            "interaction_coef": probe.interaction_coef, "n": probe.n, "note": probe.note
        }
    else:
        doc["ope"] = "no randomized-slice rows with full provenance yet"
    mixed = mixed_ts_rows(exp, ctx.dropped)
    if mixed:
        mixed_model = _dm_model(mixed)

        def m_logged_det(r: ope.SliceRow) -> str:
            return r.bucket_id

        def m_logged_sto(r: ope.SliceRow, b: str) -> float:
            return 1.0 if b == r.bucket_id else 0.0

        def m_uniform(r: ope.SliceRow, b: str) -> float:
            return 1.0 / len(r.top_m)

        doc["ope_mixed_ts"] = {
            "note": (
                "TS traffic under MC propensities (K=32, evaluation-time state, day-type "
                "candidate set) — the File 04 §2.3 acknowledged approximation; IPS family "
                "only, replay excluded by construction (ADR-0015 §10)"
            ),
            "table": report.ope_table(
                mixed,
                {"logged": (m_logged_det, m_logged_sto), "uniform": (m_logged_det, m_uniform)},
                mixed_model,
                include_replay=False,
            ),
        }
    doc["label_and_scaling"] = _label_scaling_aggregates(ctx)
    doc["slice_rows"] = len(slice_rows)
    doc["mixed_ts_rows"] = len(mixed)
    doc["dropped"] = dict(ctx.dropped)
    doc["stages"] = {
        k: v for k, v in ctx.summary.items() if k in ("priors", "als", "fold_in", "mc_backfill")
    }
    js, md = report.render(doc)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "report.json").write_text(js)
    (out_dir / "report.md").write_text(md)
    ctx.registry.upload_json(f"reports/{doc['run_date']}/report.json", doc)
    ctx.summary["report"] = {"path": str(out_dir / "report.json")}


def _label_scaling_aggregates(ctx: Ctx) -> dict[str, Any]:
    """privacy §7 aggregate queries (counts only): personal-by-label share (revisit P9) and
    duration-scaling-active users (revisit P7)."""
    with psycopg.connect(ctx.conninfo, row_factory=dict_row) as conn:
        labeled = conn.execute(
            "select count(distinct (user_id, category, daypart, day_type)) as n "
            "from public.belief_labels where label <> 'none'"
        ).fetchone()
        personal = conn.execute(
            "select count(*) as n from public.beta_cells where succ + fail > alpha0 + beta0"
        ).fetchone()
        scaling = conn.execute(
            "select count(distinct user_id) as n from public.duration_estimates where n >= 3"
        ).fetchone()
        users = conn.execute("select count(*) as n from public.profiles").fetchone()
    return {
        "labeled_cells": int(labeled["n"]) if labeled else 0,
        "evidence_personal_cells": int(personal["n"]) if personal else 0,
        "scaling_active_users": int(scaling["n"]) if scaling else 0,
        "profiles": int(users["n"]) if users else 0,
    }


def run_nightly(
    conninfo: str,
    registry: RegistryClient,
    out_dir: Path,
    *,
    now: datetime | None = None,
    seed: int = 0,
) -> dict[str, Any]:
    ctx = Ctx(
        conninfo=conninfo,
        registry=registry,
        now=now or datetime.now(tz=UTC),
        seed=seed,
        dropped=DroppedRows(),
        summary={},
    )
    exp = Exporter(conninfo)
    chrono = exp.chronotype_by_user(ctx.dropped)
    cells_by_user = exp.cell_obs_by_user(ctx.dropped, ctx.now)
    _stage_priors(ctx, exp, chrono)
    _stage_als(ctx, exp, cells_by_user)
    _stage_mc_backfill(ctx)
    _stage_report(ctx, exp, out_dir)
    return ctx.summary
