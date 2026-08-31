"""Offline policy evaluation — the RQ4 estimator family (specs/04 §2; ADR-0015 §8).

Every estimator takes logged decision rows and reports (value, ess, n) — the ESS rides along
on every estimate and the caller renders `ess < ESS_FLOOR` as NON-EVIDENCE (specs/04 §2.3),
never as a result. Replay (specs/04 §2.2) is hard-restricted to the randomized slice: a row
without slice provenance (is_experiment + exact propensity + the logged A_m(x)) raises —
unbiasedness holds only where the logging draw was uniform within A_m(x).

Policies:
- replay evaluates a deterministic `choose(row) -> bucket_id` restricted to row.top_m;
- the IPS family evaluates a stochastic `prob(row, bucket_id) -> float` over row.top_m
  (a deterministic policy is the 0/1 special case).
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass

from hourwell_training.ess import effective_sample_size
from hourwell_training.params import ESS_FLOOR, IPS_CLIP_M

__all__ = [
    "Estimate",
    "SliceRow",
    "direct_method",
    "doubly_robust",
    "ips",
    "ips_clipped",
    "replay",
    "snips",
]


@dataclass(frozen=True)
class SliceRow:
    """One logged decision. `exact = True` (the randomized slice, File 04 §1.4): the chosen
    bucket, its EXACT within-slice propensity p = 1/|A_m(x)| (ε = 1 is pinned by the service
    and its arm-A mirror — spec-conflicts M2; anything else raises rather than silently
    mixing propensity meanings), the logged A_m(x), the realized reward. `exact = False`
    (TS traffic with nightly MC propensities, File 04 §2.3): the candidate set is the
    day-type vocabulary and p is the Laplace-smoothed MC estimate — usable by the IPS
    family (spec §2.3 "all logged traffic"), NEVER by replay."""

    recommendation_id: str
    bucket_id: str
    top_m: tuple[str, ...]
    propensity: float
    reward: float
    context: dict[str, float | str | bool | None]
    exact: bool = True

    def validate_slice(self) -> None:
        if not self.top_m:
            raise ValueError(f"{self.recommendation_id}: no logged A_m(x) — not a slice row")
        if self.bucket_id not in self.top_m:
            raise ValueError(
                f"{self.recommendation_id}: chosen bucket {self.bucket_id} outside A_m(x)"
            )
        if not 0.0 < self.propensity <= 1.0:
            raise ValueError(
                f"{self.recommendation_id}: propensity {self.propensity} not in (0, 1]"
            )
        if self.exact and abs(self.propensity - 1.0 / len(self.top_m)) > 1e-9:
            raise ValueError(
                f"{self.recommendation_id}: slice propensity {self.propensity} != "
                f"1/{len(self.top_m)} — a corrupt exact propensity poisons every 1/p weight"
            )


@dataclass(frozen=True)
class Estimate:
    value: float
    ess: float
    n: int

    @property
    def is_evidence(self) -> bool:
        return self.ess >= ESS_FLOOR


DeterministicPolicy = Callable[[SliceRow], str]
StochasticPolicy = Callable[[SliceRow, str], float]
RewardModel = Callable[[SliceRow, str], float]


def _checked(rows: Sequence[SliceRow]) -> Sequence[SliceRow]:
    if not rows:
        raise ValueError("no rows — an estimator over nothing is not an estimate")
    for row in rows:
        row.validate_slice()
    return rows


def replay(rows: Sequence[SliceRow], policy: DeterministicPolicy) -> Estimate:
    """Li et al. 2011: mean reward over the rows where the policy matches the logged draw.
    Valid because within A_m(x) the logged draw is uniform (specs/04 §2.2); the effective
    sample is the matched subset, so ESS = #matches (unit weights)."""
    matched: list[float] = []
    for row in _checked(rows):
        if not row.exact:
            raise ValueError(
                f"{row.recommendation_id}: replay is slice-only (File 04 §2.2) — "
                "MC-propensity rows have no uniform-logging guarantee"
            )
        pick = policy(row)
        if pick not in row.top_m:
            raise ValueError(f"policy chose {pick} outside A_m(x) for {row.recommendation_id}")
        if pick == row.bucket_id:
            matched.append(row.reward)
    if not matched:
        return Estimate(value=float("nan"), ess=0.0, n=0)
    return Estimate(
        value=sum(matched) / len(matched), ess=float(len(matched)), n=len(matched)
    )


def _weights(rows: Sequence[SliceRow], policy: StochasticPolicy) -> list[float]:
    out: list[float] = []
    for row in rows:
        total = sum(policy(row, b) for b in row.top_m)
        if abs(total - 1.0) > 1e-6:
            raise ValueError(
                f"policy mass over A_m(x) is {total:.6f} != 1 for {row.recommendation_id}"
            )
        out.append(policy(row, row.bucket_id) / row.propensity)
    return out


def ips(rows: Sequence[SliceRow], policy: StochasticPolicy) -> Estimate:
    rows = _checked(rows)
    w = _weights(rows, policy)
    value = sum(wi * r.reward for wi, r in zip(w, rows, strict=True)) / len(rows)
    return Estimate(value=value, ess=effective_sample_size(w), n=len(rows))


def ips_clipped(
    rows: Sequence[SliceRow], policy: StochasticPolicy, clip_m: float = IPS_CLIP_M
) -> Estimate:
    rows = _checked(rows)
    w = [min(wi, clip_m) for wi in _weights(rows, policy)]
    value = sum(wi * r.reward for wi, r in zip(w, rows, strict=True)) / len(rows)
    return Estimate(value=value, ess=effective_sample_size(w), n=len(rows))


def snips(rows: Sequence[SliceRow], policy: StochasticPolicy) -> Estimate:
    rows = _checked(rows)
    w = _weights(rows, policy)
    total = sum(w)
    if total == 0.0:
        return Estimate(value=float("nan"), ess=0.0, n=len(rows))
    value = sum(wi * r.reward for wi, r in zip(w, rows, strict=True)) / total
    return Estimate(value=value, ess=effective_sample_size(w), n=len(rows))


def direct_method(
    rows: Sequence[SliceRow], policy: StochasticPolicy, model: RewardModel
) -> Estimate:
    """The model-only estimate Σ_a π(a|x)·r̂(x,a) — reported as DR's ingredient and in the
    sensitivity table, never as primary (specs/04 §2.3: DR is primary)."""
    rows = _checked(rows)
    value = sum(
        sum(policy(row, b) * model(row, b) for b in row.top_m) for row in rows
    ) / len(rows)
    return Estimate(value=value, ess=float(len(rows)), n=len(rows))


def doubly_robust(
    rows: Sequence[SliceRow], policy: StochasticPolicy, model: RewardModel
) -> Estimate:
    """Dudík et al. 2011: DM baseline + IPS on the model's residual. Unbiased if EITHER the
    propensities OR r̂ are correct; ESS is that of the importance weights (the variance
    carrier)."""
    rows = _checked(rows)
    w = _weights(rows, policy)
    value = (
        sum(
            sum(policy(row, b) * model(row, b) for b in row.top_m)
            + wi * (row.reward - model(row, row.bucket_id))
            for wi, row in zip(w, rows, strict=True)
        )
        / len(rows)
    )
    return Estimate(value=value, ess=effective_sample_size(w), n=len(rows))
