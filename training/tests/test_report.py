"""Aggregates-only discipline: suppression below the minimum cell, the ESS label on every
OPE row, and the probe's refusal on thin data."""

from __future__ import annotations

from hourwell_training import ope, report, synthetic
from hourwell_training.params import REPORT_MIN_CELL


def test_small_groups_are_suppressed_with_n_visible() -> None:
    pairs = [("A", 1.0)] * (REPORT_MIN_CELL - 1) + [("B", 0.5)] * REPORT_MIN_CELL
    out = report.grouped_rate(pairs)
    assert out["A"]["value"] == report.Suppressed and out["A"]["n"] == REPORT_MIN_CELL - 1
    assert out["B"]["value"] == 0.5


def test_ope_table_labels_non_evidence() -> None:
    world = synthetic.make_world(n_rows=40, seed=1)  # far below ESS 100

    def det(r: ope.SliceRow) -> str:
        return sorted(r.top_m)[0]

    def sto(r: ope.SliceRow, b: str) -> float:
        return 1.0 / len(r.top_m)

    rows = report.ope_table(world.rows, {"uniform": (det, sto)}, lambda r, b: 0.5)
    assert {r["estimator"] for r in rows} == {"replay", "ips", "ips_clip", "snips", "dr"}
    assert all("NON-EVIDENCE" in r["label"] for r in rows if not r["evidence"])
    ips_row = next(r for r in rows if r["estimator"] == "ips")
    assert not ips_row["evidence"]  # 40 rows can never clear the 100 floor


def test_probe_refuses_thin_or_degenerate_data() -> None:
    world = synthetic.make_world(n_rows=6, seed=2)
    res = report.interference_probe(world.rows)
    assert res.interaction_coef is None and "insufficient" in res.note


def test_probe_fits_when_load_varies() -> None:
    world = synthetic.make_world(n_rows=400, seed=3)
    rows = []
    for i, r in enumerate(world.rows):
        ctx = dict(r.context)
        ctx["x16"] = (i % 10) / 10.0
        rows.append(
            ope.SliceRow(r.recommendation_id, r.bucket_id, r.top_m, r.propensity, r.reward, ctx)
        )
    res = report.interference_probe(rows)
    assert res.interaction_coef is not None and res.n == 400


def test_render_emits_both_shapes() -> None:
    js, md = report.render({"run_date": "2026-08-31", "drop_rate": {"A": {"n": 9, "value": 0.1}}})
    assert '"drop_rate"' in js and md.startswith("# Hourwell nightly report — 2026-08-31")
