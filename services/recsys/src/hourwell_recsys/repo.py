"""Persistence boundary. Per-user model state lives ONLY in Postgres (specs/07 §7); the in-memory
repo backs tests and local runs without a database. The service never instantiates Beta cells
(the P4 trigger owns that); users without cells get a non-persisted fallback prior.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol

import numpy as np

from hourwell_recsys import bandit
from hourwell_recsys.blend import Blend
from hourwell_recsys.contexts import DAYPART_ORDER
from hourwell_recsys.energy import BetaCell
from hourwell_recsys.params import FEATURE_DIM, N0_IN_HOURS

CATEGORIES: tuple[str, ...] = ("deep", "admin", "physical", "learning")
DAY_TYPES: tuple[str, ...] = ("weekday", "weekend")
FALLBACK_PRIOR_N0 = N0_IN_HOURS * 0.5  # unscored-survey strength (File 04 §3.3; ADR-0005)


@dataclass(frozen=True)
class StoredTuple:
    recommendation_id: str
    kind: str
    reward: float
    category: str
    features: np.ndarray
    attributed_at: datetime


def fallback_cells(mu0: float = 0.5, n0: float = FALLBACK_PRIOR_N0) -> list[BetaCell]:
    """Flat pre-onboarding prior (μ₀ = 0.5 at half strength); never persisted."""
    return [
        BetaCell(g, dp.value, dt, alpha0=mu0 * n0, beta0=(1 - mu0) * n0, prior_version=-1)
        for g in CATEGORIES
        for dt in DAY_TYPES
        for dp in DAYPART_ORDER
    ]


class Repo(Protocol):
    storage: str

    def load_cells(self, user_id: str) -> list[BetaCell]: ...
    def save_cells(self, user_id: str, cells: Iterable[BetaCell]) -> None: ...
    def load_bandit(self, user_id: str) -> dict[str, bandit.LinearState]: ...
    def save_bandit(self, user_id: str, states: Iterable[bandit.LinearState]) -> None: ...
    def load_blend(self, user_id: str) -> Blend: ...
    def save_blend(self, user_id: str, blend: Blend) -> None: ...
    def applied_keys(self, user_id: str) -> set[tuple[str, str]]: ...
    def mark_applied(
        self, user_id: str, keys: Iterable[tuple[str, str]], state_version: int
    ) -> None: ...
    def save_all(
        self,
        user_id: str,
        states: Iterable[bandit.LinearState],
        cells: Iterable[BetaCell],
        keys: Iterable[tuple[str, str]],
        state_version: int,
        blend: Blend | None = None,
    ) -> None: ...
    def load_tuples(self, user_id: str) -> list[StoredTuple]: ...
    def healthy(self) -> bool: ...


def _dicts(rows: Iterable[Any]) -> list[dict[str, Any]]:
    return [dict(r) for r in rows]


def _one(row: Any) -> dict[str, Any] | None:
    return None if row is None else dict(row)


def complete_states(states: dict[str, bandit.LinearState]) -> dict[str, bandit.LinearState]:
    for g in CATEGORIES:
        states.setdefault(g, bandit.init_state(g))
    return states


class InMemoryRepo:
    storage = "memory"

    def __init__(self) -> None:
        self.cells: dict[str, dict[tuple[str, str, str], BetaCell]] = {}
        self.bandits: dict[str, dict[str, bandit.LinearState]] = {}
        self.blends: dict[str, Blend] = {}
        self.applied: dict[str, dict[tuple[str, str], int]] = {}
        self.tuples: dict[str, list[StoredTuple]] = {}

    def seed_cells(self, user_id: str, cells: Iterable[BetaCell]) -> None:
        self.cells[user_id] = {c.key: c for c in cells}

    def load_cells(self, user_id: str) -> list[BetaCell]:
        cells = self.cells.get(user_id)
        return list(cells.values()) if cells else fallback_cells()

    def save_cells(self, user_id: str, cells: Iterable[BetaCell]) -> None:
        self.cells.setdefault(user_id, {}).update({c.key: c for c in cells})

    def load_bandit(self, user_id: str) -> dict[str, bandit.LinearState]:
        return complete_states(dict(self.bandits.get(user_id, {})))

    def save_bandit(self, user_id: str, states: Iterable[bandit.LinearState]) -> None:
        self.bandits.setdefault(user_id, {}).update({s.category: s for s in states})

    def load_blend(self, user_id: str) -> Blend:
        return self.blends.get(user_id, Blend())

    def save_blend(self, user_id: str, blend: Blend) -> None:
        self.blends[user_id] = blend

    def applied_keys(self, user_id: str) -> set[tuple[str, str]]:
        return set(self.applied.get(user_id, {}))

    def mark_applied(
        self, user_id: str, keys: Iterable[tuple[str, str]], state_version: int
    ) -> None:
        store = self.applied.setdefault(user_id, {})
        for k in keys:
            store.setdefault(k, state_version)

    def save_all(
        self,
        user_id: str,
        states: Iterable[bandit.LinearState],
        cells: Iterable[BetaCell],
        keys: Iterable[tuple[str, str]],
        state_version: int,
        blend: Blend | None = None,
    ) -> None:
        self.save_bandit(user_id, states)
        self.save_cells(user_id, cells)
        self.mark_applied(user_id, keys, state_version)
        if blend is not None:
            self.save_blend(user_id, blend)

    def load_tuples(self, user_id: str) -> list[StoredTuple]:
        return sorted(
            self.tuples.get(user_id, []),
            key=lambda t: (t.attributed_at, t.recommendation_id, t.kind),
        )

    def healthy(self) -> bool:
        return True


class PostgresRepo:
    """psycopg 3 pool against the Supabase pooler in transaction mode (port 6543).

    Transaction mode is fine for this service (no session state), with one constraint: Supavisor
    does not support server-side prepared statements, and psycopg prepares a statement after it
    has run ``prepare_threshold`` times on a connection — so the default (5) would start failing
    with "prepared statement does not exist" once a connection is reused by another transaction.
    ``prepare_threshold=None`` disables that (Supabase docs, "Disabling prepared statements").
    """

    storage = "postgres"
    # kwargs passed to every connection the pool opens
    CONNECTION_KWARGS: dict[str, object] = {"prepare_threshold": None}

    def __init__(self, conninfo: str, max_size: int = 4) -> None:
        from psycopg.rows import dict_row
        from psycopg_pool import ConnectionPool

        self._pool = ConnectionPool(
            conninfo,
            min_size=0,
            max_size=max_size,
            open=False,
            kwargs={"row_factory": dict_row, **self.CONNECTION_KWARGS},
        )

    def open(self) -> None:
        self._pool.open()

    def close(self) -> None:
        self._pool.close()

    def healthy(self) -> bool:
        try:
            with self._pool.connection() as conn:
                conn.execute("select 1")
            return True
        except Exception:  # noqa: BLE001 — any failure is "unhealthy"
            return False

    def load_cells(self, user_id: str) -> list[BetaCell]:
        with self._pool.connection() as conn:
            rows = _dicts(
                conn.execute(
                    "select category, daypart, day_type, succ, fail, last_event_at, alpha0, beta0, "
                    "prior_version from beta_cells where user_id = %s",
                    (user_id,),
                ).fetchall()
            )
        if not rows:
            return fallback_cells()
        return [
            BetaCell(
                r["category"],
                r["daypart"],
                r["day_type"],
                alpha0=float(r["alpha0"]),
                beta0=float(r["beta0"]),
                succ=float(r["succ"]),
                fail=float(r["fail"]),
                last_event_at=r["last_event_at"],
                prior_version=int(r["prior_version"]),
            )
            for r in rows
        ]

    def save_cells(self, user_id: str, cells: Iterable[BetaCell]) -> None:
        with self._pool.connection() as conn:
            self._save_cells(conn, user_id, cells)

    @staticmethod
    def _save_cells(conn: Any, user_id: str, cells: Iterable[BetaCell]) -> None:
        params = [
            (c.succ, c.fail, c.last_event_at, user_id, c.category, c.daypart, c.day_type)
            for c in cells
            if c.prior_version >= 0  # fallback cells are never persisted
        ]
        if not params:
            return
        conn.cursor().executemany(
            "update beta_cells set succ = %s, fail = %s, last_event_at = %s, "
            "updated_at = now() where user_id = %s and category = %s and daypart = %s "
            "and day_type = %s",
            params,
        )

    def load_bandit(self, user_id: str) -> dict[str, bandit.LinearState]:
        with self._pool.connection() as conn:
            rows = _dicts(
                conn.execute(
                    "select category, d, a_matrix, b_vector, state_version from bandit_state "
                    "where user_id = %s",
                    (user_id,),
                ).fetchall()
            )
        states = {
            r["category"]: bandit.from_arrays(
                r["category"], r["a_matrix"], r["b_vector"], int(r["d"]), int(r["state_version"])
            )
            for r in rows
            if int(r["d"]) == FEATURE_DIM
        }
        return complete_states(states)

    def save_bandit(self, user_id: str, states: Iterable[bandit.LinearState]) -> None:
        with self._pool.connection() as conn:
            self._save_bandit(conn, user_id, states)

    @staticmethod
    def _save_bandit(conn: Any, user_id: str, states: Iterable[bandit.LinearState]) -> None:
        params = []
        for s in states:
            a, b = bandit.to_arrays(s)
            params.append((user_id, s.category, s.d, a, b, s.state_version))
        conn.cursor().executemany(
            "insert into bandit_state (user_id, category, d, a_matrix, b_vector, "
            "state_version) values (%s, %s, %s, %s, %s, %s) "
            "on conflict (user_id, category) do update set "
            "d = excluded.d, a_matrix = excluded.a_matrix, b_vector = excluded.b_vector, "
            "state_version = excluded.state_version, updated_at = now()",
            params,
        )

    def load_blend(self, user_id: str) -> Blend:
        with self._pool.connection() as conn:
            row = _one(
                conn.execute(
                    "select w_energy, w_bandit, state_version from blend_state where user_id = %s",
                    (user_id,),
                ).fetchone()
            )
        if row is None:
            return Blend()
        return Blend(float(row["w_energy"]), float(row["w_bandit"]), int(row["state_version"]))

    def save_blend(self, user_id: str, blend: Blend) -> None:
        with self._pool.connection() as conn:
            self._save_blend(conn, user_id, blend)

    @staticmethod
    def _save_blend(conn: Any, user_id: str, blend: Blend) -> None:
        conn.execute(
            "insert into blend_state (user_id, w_energy, w_bandit, state_version) "
            "values (%s, %s, %s, %s) on conflict (user_id) do update set "
            "w_energy = excluded.w_energy, w_bandit = excluded.w_bandit, "
            "state_version = excluded.state_version, updated_at = now()",
            (user_id, blend.w_energy, blend.w_bandit, blend.state_version),
        )

    def applied_keys(self, user_id: str) -> set[tuple[str, str]]:
        with self._pool.connection() as conn:
            rows = _dicts(
                conn.execute(
                    "select recommendation_id, kind from recsys_applied_tuples where user_id = %s",
                    (user_id,),
                ).fetchall()
            )
        return {(str(r["recommendation_id"]), r["kind"]) for r in rows}

    def mark_applied(
        self, user_id: str, keys: Iterable[tuple[str, str]], state_version: int
    ) -> None:
        with self._pool.connection() as conn:
            self._mark_applied(conn, user_id, keys, state_version)

    @staticmethod
    def _mark_applied(
        conn: Any, user_id: str, keys: Iterable[tuple[str, str]], state_version: int
    ) -> None:
        params = [(user_id, rec, kind, state_version) for rec, kind in keys]
        if not params:
            return
        conn.cursor().executemany(
            "insert into recsys_applied_tuples (user_id, recommendation_id, kind, "
            "state_version) values (%s, %s, %s, %s) on conflict do nothing",
            params,
        )

    def save_all(
        self,
        user_id: str,
        states: Iterable[bandit.LinearState],
        cells: Iterable[BetaCell],
        keys: Iterable[tuple[str, str]],
        state_version: int,
        blend: Blend | None = None,
    ) -> None:
        """State, cells, blend and the id-set land in ONE transaction: a retry after a partial
        failure can neither double-apply nor lose evidence (adversarial finding)."""
        with self._pool.connection() as conn, conn.transaction():
            self._save_bandit(conn, user_id, states)
            self._save_cells(conn, user_id, cells)
            self._mark_applied(conn, user_id, keys, state_version)
            if blend is not None:
                self._save_blend(conn, user_id, blend)

    def load_tuples(self, user_id: str) -> list[StoredTuple]:
        with self._pool.connection() as conn:
            rows = _dicts(
                conn.execute(
                    "select recommendation_id, kind, reward, category, features, attributed_at "
                    "from feedback_rewards where user_id = %s and excluded = false "
                    "order by attributed_at, recommendation_id, kind",
                    (user_id,),
                ).fetchall()
            )
        return [
            StoredTuple(
                str(r["recommendation_id"]),
                r["kind"],
                float(r["reward"]),
                r["category"],
                np.asarray(r["features"], dtype=np.float64),
                r["attributed_at"],
            )
            for r in rows
        ]
