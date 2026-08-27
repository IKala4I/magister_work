"""PostgresRepo against a real database (CI: the local Supabase started by the db job).

Skipped without DATABASE_URL. Exercises every query the service issues: cells load/save (update
only — the trigger owns instantiation), bandit upsert round-trip, blend default, applied id-set,
stored tuples (non-excluded only), health.
"""

from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime

import numpy as np
import pytest

from hourwell_recsys import bandit
from hourwell_recsys.energy import apply_reward
from hourwell_recsys.repo import CATEGORIES, PostgresRepo, fallback_cells

DSN = os.environ.get("DATABASE_URL")
pytestmark = pytest.mark.skipif(not DSN, reason="DATABASE_URL not set")


@pytest.fixture
def pg() -> PostgresRepo:  # type: ignore[misc]
    repo = PostgresRepo(DSN or "")
    repo.open()
    yield repo
    repo.close()


@pytest.fixture
def user(pg: PostgresRepo) -> str:  # type: ignore[misc]
    uid = str(uuid.uuid4())
    with pg._pool.connection() as conn:
        conn.execute(
            "insert into auth.users (id, email) values (%s, %s)", (uid, f"{uid}@test.local")
        )
        conn.execute(
            "insert into public.profiles (user_id, timezone, working_hours, sleep_window) "
            "values (%s, 'Europe/Kyiv', '{}'::jsonb, '{}'::jsonb) on conflict do nothing",
            (uid,),
        )
        for c in fallback_cells():
            conn.execute(
                "insert into public.beta_cells (user_id, category, daypart, day_type, alpha0, "
                "beta0, prior_version) values (%s, %s, %s, %s, %s, %s, 0)",
                (uid, c.category, c.daypart, c.day_type, c.alpha0, c.beta0),
            )
    yield uid
    with pg._pool.connection() as conn:
        conn.execute("delete from auth.users where id = %s", (uid,))


def test_health(pg: PostgresRepo) -> None:
    assert pg.healthy()


def test_cells_round_trip_and_fallback(pg: PostgresRepo, user: str) -> None:
    cells = pg.load_cells(user)
    assert len(cells) == 48 and all(c.prior_version == 0 for c in cells)
    at = datetime(2026, 9, 2, 12, tzinfo=UTC)
    updated = [apply_reward(c, 1.0, at) if c.key == ("deep", "MO", "weekday") else c for c in cells]
    pg.save_cells(user, updated)
    back = {c.key: c for c in pg.load_cells(user)}
    assert back[("deep", "MO", "weekday")].succ == pytest.approx(1.0)
    assert back[("deep", "MO", "weekday")].last_event_at == at
    unknown = pg.load_cells(str(uuid.uuid4()))
    assert len(unknown) == 48 and all(c.prior_version == -1 for c in unknown)


def test_bandit_upsert_round_trip(pg: PostgresRepo, user: str) -> None:
    states = pg.load_bandit(user)
    assert set(states) == set(CATEGORIES) and np.array_equal(states["deep"].A, np.eye(17))
    x = np.linspace(0, 1, 17)
    s = bandit.update(states["deep"], x, 0.8)
    s = bandit.LinearState(s.category, s.A, s.b, s.A_inv, state_version=5)
    pg.save_bandit(user, [s])
    pg.save_bandit(user, [s])  # idempotent upsert
    back = pg.load_bandit(user)["deep"]
    assert np.allclose(back.A, s.A) and np.allclose(back.b, s.b) and back.state_version == 5
    assert np.allclose(back.A_inv, np.linalg.inv(s.A))


def test_blend_default(pg: PostgresRepo, user: str) -> None:
    b = pg.load_blend(user)
    assert (b.w_energy, b.w_bandit) == (0.7, 0.3)


def test_applied_keys_and_tuples(pg: PostgresRepo, user: str) -> None:
    rec = str(uuid.uuid4())
    assert pg.applied_keys(user) == set()
    pg.mark_applied(user, [(rec, "outcome")], 3)
    pg.mark_applied(user, [(rec, "outcome")], 4)  # on conflict do nothing
    assert pg.applied_keys(user) == {(rec, "outcome")}
    with pg._pool.connection() as conn:
        task = str(uuid.uuid4())
        plan_id = str(uuid.uuid4())
        conn.execute(
            "insert into public.tasks (id, user_id, title, category, est_minutes, value) "
            "values (%s, %s, 't', 'deep', 60, 2)",
            (task, user),
        )
        conn.execute(
            "insert into public.plans (id, user_id, plan_date, engine) "
            "values (%s, %s, current_date, 'learned')",
            (plan_id, user),
        )
        feats = "[" + ",".join("1" if i == 0 else "0" for i in range(17)) + "]"
        for r_id, excluded in ((rec, False), (str(uuid.uuid4()), True)):
            conn.execute(
                "insert into public.recommendations (id, user_id, plan_id, task_id, slot_start, "
                "slot_end, context_bucket, features, rationale_key, engine) values (%s, %s, %s, "
                "%s, now(), now() + interval '1 hour', 'MO.wd.fresh', %s::jsonb, "
                "'best_available', 'learned')",
                (r_id, user, plan_id, task, feats),
            )
            conn.execute(
                "insert into public.feedback_rewards (user_id, recommendation_id, kind, reward, "
                "reason, category, features, excluded, excluded_reason) values (%s, %s, "
                "'outcome', 0.0, 'lapsed', 'deep', %s::jsonb, %s, %s)",
                (user, r_id, feats, excluded, "ambiguous" if excluded else None),
            )
    tuples = pg.load_tuples(user)
    assert [t.recommendation_id for t in tuples] == [rec]  # excluded rows never load
    assert tuples[0].features.shape == (17,) and tuples[0].reward == 0.0


def test_save_all_is_atomic_round_trip(pg: PostgresRepo, user: str) -> None:
    rec = str(uuid.uuid4())
    states = pg.load_bandit(user)
    s = bandit.update(states["deep"], np.linspace(0, 1, 17), 1.0)
    s = bandit.LinearState(s.category, s.A, s.b, s.A_inv, state_version=9)
    cells = pg.load_cells(user)
    pg.save_all(user, [s], cells, [(rec, "outcome")], 9)
    assert pg.load_bandit(user)["deep"].state_version == 9
    assert (rec, "outcome") in pg.applied_keys(user)


def test_blend_round_trip_and_save_all_with_blend(pg: PostgresRepo, user: str) -> None:
    from hourwell_recsys.blend import Blend

    pg.save_blend(user, Blend(0.55, 0.45, 3))
    loaded = pg.load_blend(user)
    assert loaded.w_energy == pytest.approx(0.55, abs=1e-6)
    assert loaded.w_bandit == pytest.approx(0.45, abs=1e-6)
    assert loaded.state_version == 3
    s = bandit.init_state("deep", state_version=4)
    pg.save_all(user, [s], [], [], 4, blend=Blend(0.2, 0.8, 4))
    again = pg.load_blend(user)
    assert again.w_energy == pytest.approx(0.2, abs=1e-6)
    assert again.state_version == 4
