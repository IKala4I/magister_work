"""The researcher-facing aggregate report — the ONLY thing that leaves the VM (privacy
README §7; ADR-0015 §15). Every group smaller than REPORT_MIN_CELL is suppressed, never
printed; the OPE table always carries its ESS and the non-evidence label (specs/04 §2.3).
Covers the revisit ledger: experiment-drop rate per arm (P6), share of personal-by-label
cells (P9), duration-scaling-active share per arm (P7), and the L4 interference probe.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any

import numpy as np
from sklearn.linear_model import LogisticRegression

from hourwell_training import ope
from hourwell_training.params import REPORT_MIN_CELL

__all__ = ["Suppressed", "grouped_rate", "interference_probe", "ope_table", "render"]

Suppressed = f"suppressed(n<{REPORT_MIN_CELL})"


def grouped_rate(pairs: Sequence[tuple[str, float]]) -> dict[str, Any]:
    """group → mean with min-cell suppression; groups keep their n either way."""
    acc: dict[str, list[float]] = {}
    for g, v in pairs:
        acc.setdefault(g, []).append(v)
    out: dict[str, Any] = {}
    for g in sorted(acc):
        vals = acc[g]
        out[g] = {
            "n": len(vals),
            "value": round(sum(vals) / len(vals), 4) if len(vals) >= REPORT_MIN_CELL
            else Suppressed,
        }
    return out


def ope_table(
    rows: Sequence[ope.SliceRow],
    policies: dict[str, tuple[ope.DeterministicPolicy, ope.StochasticPolicy]],
    model: ope.RewardModel,
) -> list[dict[str, Any]]:
    """estimator × policy with the ESS gate rendered, not just stored."""
    out: list[dict[str, Any]] = []
    for name, (det, sto) in sorted(policies.items()):
        entries: list[tuple[str, ope.Estimate]] = [
            ("replay", ope.replay(rows, det)),
            ("ips", ope.ips(rows, sto)),
            ("ips_clip", ope.ips_clipped(rows, sto)),
            ("snips", ope.snips(rows, sto)),
            ("dr", ope.doubly_robust(rows, sto, model)),
        ]
        for est_name, est in entries:
            out.append({
                "policy": name,
                "estimator": est_name,
                "value": round(est.value, 4) if est.n else None,
                "ess": round(est.ess, 1),
                "n": est.n,
                "evidence": est.is_evidence,
                "label": "" if est.is_evidence else "NON-EVIDENCE (ESS < 100)",
            })
    return out


@dataclass(frozen=True)
class ProbeResult:
    interaction_coef: float | None
    n: int
    note: str


def interference_probe(
    rows: Sequence[ope.SliceRow],
    *,
    is_morning: Callable[[str], bool] = lambda b: b.split(".")[0] in ("EM", "MO"),
) -> ProbeResult:
    """L4 / File 04 §2.4: does morning-slot reward shift with surrounding load? Logistic
    reward ~ morning + preceding_load + morning×load on the slice; the interaction
    coefficient is the additivity check (|coef| >> 0 ⇒ the additive-slate assumption is
    strained — reported, not asserted)."""
    xs: list[list[float]] = []
    ys: list[float] = []
    for r in rows:
        load = r.context.get("x16")
        if not isinstance(load, int | float):
            continue
        m = 1.0 if is_morning(r.bucket_id) else 0.0
        xs.append([m, float(load), m * float(load)])
        ys.append(r.reward)
    n = len(ys)
    if n < REPORT_MIN_CELL * 2 or len(set(ys)) < 2:
        return ProbeResult(None, n, "insufficient data for the probe")
    fit = LogisticRegression(penalty=None, max_iter=1000).fit(np.asarray(xs), np.asarray(ys))
    return ProbeResult(round(float(fit.coef_[0][2]), 4), n, "")


def render(doc: dict[str, Any]) -> tuple[str, str]:
    """(json, markdown) — both uploaded next to the artifacts."""
    js = json.dumps(doc, indent=2, default=str)
    lines = [f"# Hourwell nightly report — {doc.get('run_date', '?')}", ""]
    for section, body in doc.items():
        if section == "run_date":
            continue
        lines.append(f"## {section}")
        lines.append("```json")
        lines.append(json.dumps(body, indent=2, default=str))
        lines.append("```")
        lines.append("")
    return js, "\n".join(lines)
