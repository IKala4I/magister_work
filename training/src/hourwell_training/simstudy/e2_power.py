"""E2 — simulation-based power for the primary contrast (preregistration §3; File 06 §2.3).

Block-level data from the File 06 §1.6 model with the spec's parameters; the paired analysis
of §2.2 (the analytic floor) and Wilcoxon (§1.6 robustness (a)); the N sweep; the phase-1
between-subject contrast. The §1.6 GLMM is not fitted (no mixed-model dependency) — the
figures are lower bounds for it, as the pre-registration states.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np

from hourwell_training.simstudy.config import StudyConfig
from hourwell_training.simstudy.stats import mc_summary, paired_tests, welch_test

__all__ = ["intercept_sd_from_icc", "run_e2", "simulate_cell"]

_LOGISTIC_VAR = math.pi**2 / 3.0


def intercept_sd_from_icc(icc: float) -> float:
    """σ₀ with ICC = σ₀² / (σ₀² + π²/3)  ⇒  σ₀² = ICC · (π²/3) / (1 − ICC)."""
    if not 0.0 <= icc < 1.0:
        raise ValueError("ICC must be in [0, 1)")
    return math.sqrt(icc * _LOGISTIC_VAR / (1.0 - icc))


def _expit(x: np.ndarray) -> np.ndarray:
    return np.asarray(1.0 / (1.0 + np.exp(-x)))


def _draw_users(
    rng: np.random.Generator, n: int, cfg: StudyConfig, icc: float, log_or: float
) -> tuple[np.ndarray, np.ndarray]:
    """(p_A, p_B) per user from logit = β₀ + β₁·cond + u₀ + u₁·cond."""
    b0 = math.log(cfg.e2_baseline / (1.0 - cfg.e2_baseline))
    u0 = rng.normal(0.0, intercept_sd_from_icc(icc), n)
    u1 = rng.normal(0.0, cfg.e2_slope_sd_logit, n)
    return _expit(b0 + u0), _expit(b0 + u0 + log_or + u1)


def simulate_cell(
    cfg: StudyConfig, *, icc: float, log_or: float, n_users: int, replicates: int, seed: int
) -> dict[str, Any]:
    rng = np.random.default_rng(seed)
    t_rej = 0
    w_rej = 0
    diffs: list[float] = []
    k = cfg.e2_blocks_per_condition
    for _ in range(replicates):
        pa, pb = _draw_users(rng, n_users, cfg, icc, log_or)
        ma = rng.binomial(k, pa) / k
        mb = rng.binomial(k, pb) / k
        res = paired_tests(mb, ma)
        t_rej += int(res.rejects())
        w_rej += int(res.wilcoxon_rejects())
        diffs.append(res.mean_diff)
    return {
        "icc": icc,
        "log_or": log_or,
        "n_users": n_users,
        "replicates": replicates,
        "power_paired_t": t_rej / replicates,
        "power_wilcoxon": w_rej / replicates,
        "mean_diff": mc_summary(diffs),
    }


def _phase1_between(
    cfg: StudyConfig, *, icc: float, log_or: float, replicates: int, seed: int
) -> dict[str, Any]:
    """15 vs 15 users, phase 1 only (40 blocks each), Welch t (File 06 §1.6 supplementary)."""
    rng = np.random.default_rng(seed)
    half = cfg.e2_n_users // 2
    k = cfg.e2_phase1_blocks
    rej = 0
    for _ in range(replicates):
        pa, pb = _draw_users(rng, cfg.e2_n_users, cfg, icc, log_or)
        ma = rng.binomial(k, pa[:half]) / k  # users whose sequence starts with A
        mb = rng.binomial(k, pb[half:]) / k  # users whose sequence starts with B
        diff, p = welch_test(mb, ma)
        rej += int(p < 0.05 and diff > 0)
    return {"icc": icc, "replicates": replicates, "power_welch": rej / replicates}


def run_e2(cfg: StudyConfig) -> dict[str, Any]:
    log_or = math.log(cfg.e2_odds_ratio)
    cells: list[dict[str, Any]] = []
    seed = cfg.e2_seed_base
    for icc in cfg.e2_iccs:
        for lo in (log_or, 0.0):
            cells.append(simulate_cell(
                cfg, icc=icc, log_or=lo, n_users=cfg.e2_n_users,
                replicates=cfg.e2_replicates, seed=seed,
            ))
            seed += 1
    sweep: list[dict[str, Any]] = []
    for n in cfg.e2_n_sweep:
        sweep.append(simulate_cell(
            cfg, icc=cfg.e2_iccs[-1], log_or=log_or, n_users=n,
            replicates=cfg.e2_sweep_replicates, seed=seed,
        ))
        seed += 1
    smallest = next((c["n_users"] for c in sweep if c["power_paired_t"] >= 0.80), None)
    between = []
    for icc in cfg.e2_iccs:
        between.append(_phase1_between(
            cfg, icc=icc, log_or=log_or, replicates=cfg.e2_replicates, seed=seed
        ))
        seed += 1
    return {
        "config": {
            "odds_ratio": cfg.e2_odds_ratio,
            "baseline": cfg.e2_baseline,
            "slope_sd_logit": cfg.e2_slope_sd_logit,
            "blocks_per_condition": cfg.e2_blocks_per_condition,
            "n_users": cfg.e2_n_users,
            "replicates": cfg.e2_replicates,
            "sweep_replicates": cfg.e2_sweep_replicates,
            "intercept_sd": {str(i): intercept_sd_from_icc(i) for i in cfg.e2_iccs},
        },
        "cells": cells,
        "n_sweep": sweep,
        "smallest_n_power_80": smallest,
        "phase1_between_subject": between,
    }
