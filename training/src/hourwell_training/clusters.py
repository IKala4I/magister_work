"""Behavioral clusters over ALS user factors — File 04 §3.4 (k by silhouette, ADR-0015 §4)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score

from hourwell_training.params import KMEANS_K_RANGE

if TYPE_CHECKING:
    from numpy.typing import NDArray

__all__ = ["Clustering", "fit_clusters", "nearest_centroid"]


@dataclass(frozen=True)
class Clustering:
    k: int
    silhouette: float
    centroids: NDArray[np.float64]  # (k, dim)
    labels: NDArray[np.int64]  # (n_users,)


def fit_clusters(
    factors: NDArray[np.float64],
    *,
    k_range: tuple[int, int] = KMEANS_K_RANGE,
    seed: int = 0,
) -> Clustering | None:
    """Silhouette-selected k-means; None when the cohort cannot support the smallest k
    (silhouette needs 2 ≤ k ≤ n−1) — the caller keeps the previous clustering."""
    n = factors.shape[0]
    k_lo, k_hi = k_range
    candidates = [k for k in range(k_lo, k_hi + 1) if 2 <= k <= n - 1]
    if not candidates:
        return None
    best: Clustering | None = None
    for k in candidates:
        km = KMeans(n_clusters=k, n_init=10, random_state=seed)
        labels = km.fit_predict(factors)
        if len(set(labels.tolist())) < 2:
            continue
        score = float(silhouette_score(factors, labels))
        if best is None or score > best.silhouette:
            best = Clustering(
                k=k,
                silhouette=score,
                centroids=np.asarray(km.cluster_centers_, dtype=np.float64),
                labels=labels.astype(np.int64),
            )
    return best


def nearest_centroid(clustering: Clustering, x: NDArray[np.float64]) -> int:
    d = np.linalg.norm(clustering.centroids - x[None, :], axis=1)
    return int(np.argmin(d))
