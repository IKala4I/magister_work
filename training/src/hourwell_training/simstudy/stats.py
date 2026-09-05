"""Small statistics helpers shared by E2 and E3 (File 06 §1.6 robustness (a), §2.2)."""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np
from scipy import stats

__all__ = ["PairedResult", "mc_summary", "paired_tests", "welch_test"]


@dataclass(frozen=True)
class PairedResult:
    mean_diff: float
    t_p: float
    wilcoxon_p: float
    n: int

    def rejects(self, alpha: float = 0.05) -> bool:
        """Two-sided test, rejection counted only in the hypothesised direction (d̄ > 0)."""
        return self.t_p < alpha and self.mean_diff > 0

    def wilcoxon_rejects(self, alpha: float = 0.05) -> bool:
        return self.wilcoxon_p < alpha and self.mean_diff > 0


def paired_tests(b: Sequence[float], a: Sequence[float]) -> PairedResult:
    """Paired t (two-sided) and Wilcoxon signed-rank on d = b − a (per-user condition means)."""
    bb = np.asarray(b, dtype=np.float64)
    aa = np.asarray(a, dtype=np.float64)
    if bb.shape != aa.shape or bb.ndim != 1 or bb.size < 2:
        raise ValueError("paired_tests needs two equal-length vectors with n ≥ 2")
    d = bb - aa
    t_p = float(stats.ttest_rel(bb, aa).pvalue)
    # every difference zero: no evidence either way (scipy would raise on an all-zero sample)
    w_p = 1.0 if np.allclose(d, 0.0) else float(stats.wilcoxon(d).pvalue)
    return PairedResult(mean_diff=float(d.mean()), t_p=t_p, wilcoxon_p=w_p, n=int(d.size))


def welch_test(b: Sequence[float], a: Sequence[float]) -> tuple[float, float]:
    """Two-sample Welch t (two-sided): (mean difference, p)."""
    bb = np.asarray(b, dtype=np.float64)
    aa = np.asarray(a, dtype=np.float64)
    res = stats.ttest_ind(bb, aa, equal_var=False)
    return float(bb.mean() - aa.mean()), float(res.pvalue)


def mc_summary(values: Sequence[float]) -> dict[str, float | int]:
    """mean, SD and the Monte-Carlo SE (SD/√R) of a per-replicate statistic."""
    v = np.asarray(values, dtype=np.float64)
    v = v[~np.isnan(v)]
    if v.size == 0:
        return {"mean": math.nan, "sd": math.nan, "mc_se": math.nan, "n": 0}
    sd = float(v.std(ddof=1)) if v.size > 1 else 0.0
    return {
        "mean": float(v.mean()),
        "sd": sd,
        "mc_se": sd / math.sqrt(v.size),
        "n": int(v.size),
    }
