"""Synthetic DATABASE seeding for train.yml (ADR-0015 §16) — the CI stack's local Postgres
gets a small, fully deterministic cohort so the nightly pipeline runs end-to-end with no
participant data anywhere near CI (G3). Profiles go through the real onboarding trigger
(instantiate_user_priors seeds beta_cells + the rmeq cluster), then evidence, bandit/blend
state, plans, slice + TS recommendations, rewards and a few PAR facts are written on top.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta

import numpy as np
import psycopg

from hourwell_training.synthetic import BUCKETS_WD, CLASSES, q_true

__all__ = ["seed_synthetic_db"]

_TASK_CATEGORIES = ("deep", "admin", "physical", "learning")


def _uid(i: int) -> str:
    return str(uuid.UUID(int=0xA11CE000_0000_4000_8000_000000000000 + i))


def seed_synthetic_db(
    conninfo: str, *, n_users: int = 16, days: int = 10, seed: int = 42
) -> dict[str, int]:
    rng = np.random.default_rng(seed)
    now = datetime.now(tz=UTC)
    counts = {"users": 0, "plans": 0, "recommendations": 0, "rewards": 0, "events": 0}
    with psycopg.connect(conninfo) as conn:
        cur = conn.cursor()
        for i in range(n_users):
            uid = _uid(i)
            klass = CLASSES[i % len(CLASSES)]
            # rMEQ score inside the class's band (P4 CHECK profiles_chronotype_matches_score)
            rmeq = {"DM": 24, "MM": 20, "INT": 14, "ME": 10, "DE": 6}[klass]
            cur.execute(
                "insert into auth.users (id, instance_id, aud, role, email, encrypted_password, "
                "created_at, updated_at) values (%s, '00000000-0000-0000-0000-000000000000', "
                "'authenticated', 'authenticated', %s, '', now(), now()) on conflict do nothing",
                (uid, f"synthetic{i:02d}@train.local"),
            )
            cur.execute(
                "insert into public.profiles (user_id, timezone, working_hours, rmeq_score, "
                "chronotype_class, survey_skipped, onboarding_completed_at) values "
                "(%s, 'Europe/Kyiv', %s, %s, %s, false, now()) on conflict do nothing",
                (
                    uid,
                    json.dumps({d: [540, 1080] for d in ("mon", "tue", "wed", "thu", "fri")}),
                    rmeq,
                    klass,
                ),
            )
            counts["users"] += 1
            # evidence: mature morning/evening pattern per the known q_true world
            for dp in ("EM", "MO", "MD", "AF", "EV", "NT"):
                q = q_true(f"{dp}.wd" if dp not in ("MO", "AF") else f"{dp}.wd.fresh", klass)
                s = round(20 * q, 2)
                f = round(20 * (1 - q), 2)
                cur.execute(
                    "update public.beta_cells set succ = %s, fail = %s, last_event_at = %s "
                    "where user_id = %s and category = 'deep' and daypart = %s "
                    "and day_type = 'weekday'",
                    (s, f, now, uid, dp),
                )
            # bandit + blend state (identity prior — the MC backfill needs SOME state)
            for cat in _TASK_CATEGORIES:
                eye = np.eye(17).reshape(-1).tolist()
                cur.execute(
                    "insert into public.bandit_state (user_id, category, d, a_matrix, b_vector) "
                    "values (%s, %s, 17, %s, %s) on conflict do nothing",
                    (uid, cat, eye, [0.0] * 17),
                )
            cur.execute(
                "insert into public.blend_state (user_id) values (%s) on conflict do nothing",
                (uid,),
            )
            task_id = str(uuid.UUID(int=0xBEEF0000_0000_4000_8000_000000000000 + i))
            cur.execute(
                "insert into public.tasks (id, user_id, title, category, est_minutes, value) "
                "values (%s, %s, 'synthetic task', 'deep', 60, 2) on conflict do nothing",
                (task_id, uid),
            )
            for day in range(days):
                plan_date = (now - timedelta(days=days - day)).date()
                plan_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"plan/{uid}/{day}"))
                m = int(rng.integers(2, 5))
                top_m = [str(b) for b in rng.choice(np.array(BUCKETS_WD), size=m, replace=False)]
                chosen = top_m[int(rng.integers(m))]
                arm = "B" if i % 2 == 0 else "A"
                telemetry = {
                    "ef": {
                        "reason": "learned" if arm == "B" else "arm_a",
                        "experiment": {
                            "task_id": task_id,
                            "bucket_id": chosen,
                            "top_m": top_m,
                            "propensity": 1.0 / m,
                            "n_eligible": 1,
                        },
                        "experiment_drawn": True,
                        "experiment_dropped": bool(rng.random() < 0.1),
                    }
                }
                cur.execute(
                    "insert into public.plans (id, user_id, plan_date, engine, arm, telemetry) "
                    "values (%s, %s, %s, %s, %s, %s) on conflict do nothing",
                    (
                        plan_id, uid, plan_date,
                        "learned" if arm == "B" else "heuristic", arm, json.dumps(telemetry),
                    ),
                )
                counts["plans"] += 1
                slot = datetime(
                    plan_date.year, plan_date.month, plan_date.day, 9, 0, tzinfo=UTC
                )
                features = [1.0] + [0.0] * 16
                # one slice row with the EXACT propensity
                rid = str(uuid.uuid5(uuid.NAMESPACE_URL, f"rec/{uid}/{day}/exp"))
                cur.execute(
                    "insert into public.recommendations (id, user_id, plan_id, task_id, "
                    "slot_start, slot_end, context_bucket, features, rationale_key, "
                    "is_experiment, engine, status, propensity, attributed_at) values "
                    "(%s, %s, %s, %s, %s, %s, %s, %s, 'experiment', true, %s, 'completed', "
                    "%s, %s) on conflict do nothing",
                    (
                        rid, uid, plan_id, task_id, slot, slot + timedelta(hours=1),
                        chosen, json.dumps(features),
                        "learned" if arm == "B" else "heuristic", 1.0 / m, now,
                    ),
                )
                reward = float(rng.random() < q_true(chosen, klass))
                cur.execute(
                    "insert into public.feedback_rewards (user_id, recommendation_id, kind, "
                    "reward, reason, category, features) values "
                    "(%s, %s, 'outcome', %s, 'completed', 'deep', %s) on conflict do nothing",
                    (uid, rid, reward, json.dumps(features)),
                )
                counts["rewards"] += 1
                # one learned TS row awaiting the MC backfill (arm B only)
                if arm == "B":
                    rid2 = str(uuid.uuid5(uuid.NAMESPACE_URL, f"rec/{uid}/{day}/ts"))
                    cur.execute(
                        "insert into public.recommendations (id, user_id, plan_id, task_id, "
                        "chunk_index, slot_start, slot_end, context_bucket, features, "
                        "rationale_key, is_experiment, engine, status) values "
                        "(%s, %s, %s, %s, 1, %s, %s, 'AF.wd.fresh', %s, 'best_available', "
                        "false, 'learned', 'completed') on conflict do nothing",
                        (
                            rid2, uid, plan_id, task_id, slot + timedelta(hours=3),
                            slot + timedelta(hours=4), json.dumps(features),
                        ),
                    )
                    counts["recommendations"] += 1
                # a PAR fact for the slice block
                cur.execute(
                    "insert into public.events (user_id, op_id, type, recommendation_id, "
                    "payload, client_ts, local_day) values (%s, %s, 'focus_end', %s, %s, %s, %s) "
                    "on conflict do nothing",
                    (
                        uid, f"seed-{i}-{day}", rid,
                        json.dumps({
                            "started_at": slot.isoformat(),
                            "outcome": "finished" if reward else "abandoned",
                            "focused_ms": 3_600_000 if reward else 600_000,
                        }),
                        slot, plan_date,
                    ),
                )
                counts["events"] += 1
                counts["recommendations"] += 1
        conn.commit()
    return counts
