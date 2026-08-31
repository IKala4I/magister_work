"""train.yml's teeth: after `hourwell-train --synthetic`, prove the run DID the things
(ADR-0015 §16) — registry rows recorded and gated, propensities backfilled inside (0, 1],
prior_cells only grow when promoted, the report exists with the suppression discipline.
Usage: assert_synthetic_run.py <summary.json> <out-dir>   (DATABASE_URL in the env)
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from hourwell_training import db


def main() -> int:
    summary = json.loads(Path(sys.argv[1]).read_text())
    out_dir = Path(sys.argv[2])
    db_url = os.environ["DATABASE_URL"]
    failures: list[str] = []

    def check(cond: bool, msg: str) -> None:
        (print(f"ok - {msg}") if cond else failures.append(msg))

    check("priors" in summary and "als" in summary, "summary carries the priors + als stages")
    check(summary.get("mc_backfill", {}).get("filled", 0) > 0, "MC backfill filled TS rows")
    report = json.loads((out_dir / "report.json").read_text())
    check("ope" in report and "experiment_drop_rate_by_arm" in report, "report has OPE + drop rate")
    check((out_dir / "report.md").exists(), "markdown report rendered")
    ope_rows = report["ope"] if isinstance(report["ope"], list) else []
    check(len(ope_rows) >= 10, "OPE table covers 2 policies x 5 estimators")
    check(all("ess" in r and "evidence" in r for r in ope_rows), "every OPE row carries its ESS")

    with db.connect(db_url) as conn:
        n_reg = conn.execute(
            "select count(*) from public.model_registry where kind in ('priors', 'als')"
        ).fetchone()[0]
        check(n_reg >= 2, f"registry recorded priors + als rows (got {n_reg})")
        # CI has no storage credentials → nothing may promote beyond the seeded v0
        n_promoted = conn.execute(
            "select count(*) from public.model_registry where promoted and not "
            "(kind = 'priors' and version = '0')"
        ).fetchone()[0]
        check(n_promoted == 0, "without storage credentials nothing promotes (ADR-0015 §14)")
        n_versions = conn.execute(
            "select count(distinct version) from public.prior_cells"
        ).fetchone()[0]
        check(n_versions == 1, "unpromoted refresh writes NO prior_cells version")
        bad_p = conn.execute(
            "select count(*) from public.recommendations "
            "where propensity is not null and (propensity <= 0 or propensity > 1)"
        ).fetchone()[0]
        check(bad_p == 0, "every backfilled propensity is in (0, 1]")
        left = conn.execute(
            "select count(*) from public.recommendations "
            "where propensity is null and not is_experiment and engine = 'learned'"
        ).fetchone()[0]
        check(left == 0, "no learned TS row left without a propensity")
        exact = conn.execute(
            "select count(*) from public.recommendations r "
            "where r.is_experiment and r.propensity is distinct from "
            "  (select ((p.telemetry -> 'ef' -> 'experiment' ->> 'propensity'))::double precision "
            "     from public.plans p where p.id = r.plan_id)"
        ).fetchone()[0]
        check(exact == 0, "M-01 row propensity == the plan telemetry value (exact slice)")

    if failures:
        for f in failures:
            print(f"not ok - {f}", file=sys.stderr)
        return 1
    print(f"all assertions passed ({len(ope_rows)} OPE rows)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
