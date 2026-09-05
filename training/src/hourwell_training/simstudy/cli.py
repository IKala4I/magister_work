"""`hourwell-simstudy` — run the pre-registered simulation study once and write its outputs.

    uv run hourwell-simstudy --out ../docs/study/results [--workers 8]
    uv run hourwell-simstudy --out /tmp/x --quick        # smoke sizes; files are suffixed

The registered configuration is `simstudy.config.REGISTERED`; `run.json` records the commit
the run used, the configuration, and wall time per experiment.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from dataclasses import asdict
from pathlib import Path
from typing import Any

from hourwell_training.simstudy.config import REGISTERED
from hourwell_training.simstudy.e1_estimators import run_e1
from hourwell_training.simstudy.e2_power import run_e2
from hourwell_training.simstudy.e3_closedloop import run_e3

__all__ = ["main"]


def _commit() -> str:
    try:
        return subprocess.run(
            ["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def _dump(path: Path, doc: dict[str, Any]) -> None:
    path.write_text(json.dumps(doc, indent=2, default=str) + "\n")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="hourwell-simstudy")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--workers", type=int, default=1, help="process pool for E3 replicates")
    ap.add_argument("--quick", action="store_true",
                    help="smoke sizes only — NOT the registered configuration")
    ap.add_argument("--only", choices=["e1", "e2", "e3"], default=None)
    args = ap.parse_args(argv)
    cfg = REGISTERED.quick() if args.quick else REGISTERED
    suffix = "_quick" if args.quick else ""
    args.out.mkdir(parents=True, exist_ok=True)
    if args.quick:
        print("QUICK MODE — smoke sizes, not the registered configuration", file=sys.stderr)
    timings: dict[str, float] = {}
    runners = {"e1": run_e1, "e2": run_e2}
    filenames = {"e1": "e1_estimators", "e2": "e2_power", "e3": "e3_closedloop"}
    for name in ("e1", "e2", "e3"):
        if args.only and args.only != name:
            continue
        t0 = time.perf_counter()
        doc = run_e3(cfg, workers=args.workers) if name == "e3" else runners[name](cfg)
        timings[name] = round(time.perf_counter() - t0, 1)
        _dump(args.out / f"{filenames[name]}{suffix}.json", doc)
        print(f"{name}: {timings[name]} s", file=sys.stderr)
    _dump(args.out / f"run{suffix}.json", {
        "commit": _commit(),
        "registered": not args.quick,
        "config": asdict(cfg),
        "timings_s": timings,
        "workers": args.workers,
        "python": sys.version.split()[0],
    })
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
