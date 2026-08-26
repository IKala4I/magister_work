"""HTTP surface: auth matrix (service key / ES256 JWT / sub mismatch), rate limit, schema guards."""

from __future__ import annotations

import time
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

from hourwell_recsys.app import DailyRateLimiter, create_app
from hourwell_recsys.auth import ALGORITHMS, AUDIENCE, AuthSettings
from hourwell_recsys.repo import InMemoryRepo
from tests.conftest import OTHER_USER, USER, flat_cells, kyiv, plan_body, task

KEY = ec.generate_private_key(ec.SECP256R1())
PUB = KEY.public_key()


class StaticKeyVerifier:
    """Same decode path as JwksVerifier, with the JWKS fetch replaced by a fixed test key."""

    def verify(self, token: str) -> dict[str, Any]:
        claims: dict[str, Any] = jwt.decode(
            token,
            PUB,
            algorithms=ALGORITHMS,
            audience=AUDIENCE,
            options={"require": ["exp", "sub"]},
        )
        return claims


def _token(sub: str = USER, *, exp_delta: int = 600, aud: str = AUDIENCE) -> str:
    return jwt.encode(
        {"sub": sub, "aud": aud, "exp": int(time.time()) + exp_delta, "role": "authenticated"},
        KEY,
        algorithm="ES256",
        headers={"kid": "test-kid"},
    )


@pytest.fixture
def client() -> TestClient:
    repo = InMemoryRepo()
    repo.seed_cells(USER, flat_cells())
    app = create_app(
        repo=repo,
        auth=AuthSettings(service_key="s3cret", jwks_url=None),
        verifier=StaticKeyVerifier(),
        rate_limiter=DailyRateLimiter(limit=3),
    )
    return TestClient(app)


SVC = {"X-Service-Key": "s3cret"}


def test_healthz_is_open(client: TestClient) -> None:
    r = client.get("/healthz")
    assert r.status_code == 200
    body = r.json()
    assert (
        body["status"] == "ok"
        and body["storage"] == "memory"
        and "priors" in body["model_versions"]
    )


def test_auth_matrix(client: TestClient) -> None:
    body = plan_body([task("a", est_minutes=30)])
    assert client.post("/plan", json=body).status_code == 401
    assert client.post("/plan", json=body, headers={"X-Service-Key": "nope"}).status_code == 401
    assert (
        client.post("/plan", json=body, headers={"Authorization": "Bearer garbage"}).status_code
        == 401
    )
    assert (
        client.post(
            "/plan", json=body, headers={"Authorization": f"Bearer {_token(exp_delta=-5)}"}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/plan", json=body, headers={"Authorization": f"Bearer {_token(aud='anon')}"}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/plan", json=body, headers={"Authorization": f"Bearer {_token(OTHER_USER)}"}
        ).status_code
        == 403
    )
    assert (
        client.post("/plan", json=body, headers={"Authorization": f"Bearer {_token()}"}).status_code
        == 200
    )
    assert client.post("/plan", json=body, headers=SVC).status_code == 200


def test_plan_response_shape_and_rate_limit(client: TestClient) -> None:
    body = plan_body(
        [task("a", est_minutes=30), task("b", category="deep", est_minutes=60, value=3)]
    )
    # the auth-matrix fixture is fresh per test: limit 3 → 4th call 429
    codes = [client.post("/plan", json=body, headers=SVC).status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]
    first = client.post(
        "/plan", json=plan_body([task("a")], plan_date="2026-09-03"), headers=SVC
    ).json()
    assert set(first) == {
        "engine",
        "model_version",
        "solver_status",
        "assignments",
        "unplaced",
        "infeasible",
        "telemetry",
    }
    a = first["assignments"][0]
    assert set(a) == {
        "task_id",
        "chunk_index",
        "slot_start",
        "slot_end",
        "context_bucket",
        "q_hat",
        "confidence",
        "rationale_key",
        "rationale_params",
        "is_experiment",
        "propensity",
        "features",
        "experiment_top_m",
    }


def test_plan_settings_mismatch_and_validation(client: TestClient) -> None:
    body = plan_body([task("a")])
    body["settings"]["epsilon"] = 0.5
    assert client.post("/plan", json=body, headers=SVC).status_code == 422
    bad_tz = plan_body([task("a")], timezone="Mars/Olympus")
    assert client.post("/plan", json=bad_tz, headers=SVC).status_code == 422
    dup = plan_body([task("a"), task("a")])
    assert client.post("/plan", json=dup, headers=SVC).status_code == 422
    extra = plan_body([task("a")])
    extra["unknown_field"] = 1
    assert client.post("/plan", json=extra, headers=SVC).status_code == 422


def test_feedback_endpoint_and_displacement_guard(client: TestClient) -> None:
    from tests.test_feedback import _tuple

    ok = {
        "user_id": USER,
        "tuples": [_tuple("r1", 1.0, "completed"), _tuple("r2", 0.0, "lapsed", excluded=True)],
    }
    r = client.post("/feedback", json=ok, headers=SVC)
    assert r.status_code == 200
    assert r.json() == {
        "updated": 1,
        "skipped_excluded": 1,
        "rebuilt": False,
        "state_version": r.json()["state_version"],
    }
    bad = {"user_id": USER, "tuples": [_tuple("r3", 0.0, "displaced")]}
    assert client.post("/feedback", json=bad, headers=SVC).status_code == 422
    assert (
        client.post(
            "/feedback", json=ok, headers={"Authorization": f"Bearer {_token(OTHER_USER)}"}
        ).status_code
        == 403
    )


def test_insights(client: TestClient) -> None:
    r = client.get("/insights", headers={"Authorization": f"Bearer {_token()}"})
    assert r.status_code == 200
    body = r.json()
    assert len(body["heatmap"]) == 48
    cell = body["heatmap"][0]
    assert set(cell) == {"category", "daypart", "day_type", "mean", "ci", "n_effective"}
    assert body["adherence"] == []
    assert client.get("/insights", headers=SVC).status_code == 422  # service key needs user_id
    assert client.get("/insights", params={"user_id": USER}, headers=SVC).status_code == 200
    assert (
        client.get(
            "/insights",
            params={"user_id": OTHER_USER},
            headers={"Authorization": f"Bearer {_token()}"},
        ).status_code
        == 403
    )


def test_parse_preview(client: TestClient) -> None:
    r = client.post(
        "/parse-preview",
        json={"text": "report draft 2h by fri", "timezone": "Europe/Kyiv", "now": kyiv(9)},
        headers={"Authorization": f"Bearer {_token()}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert (
        body["title"] == "report draft"
        and body["est_minutes"] == 120
        and body["category_guess"] is None
    )
    assert (
        body["deadline"].startswith("2026-09-04") and "deadline_time_of_day" in body["ambiguities"]
    )


# --- adversarial-pass regressions (P5 review) -------------------------------------------------


def test_non_ascii_service_key_is_401_not_500(client: TestClient) -> None:
    r = client.get("/insights", params={"user_id": USER}, headers={"X-Service-Key": b"s3cr\xe9t"})
    assert r.status_code == 401


def test_feedback_for_uninstantiated_user_is_409(client: TestClient) -> None:
    from tests.test_feedback import _tuple

    body = {"user_id": OTHER_USER, "tuples": [_tuple("r1", 1.0, "completed")]}
    assert client.post("/feedback", json=body, headers=SVC).status_code == 409


def test_parse_preview_rejects_unknown_timezone(client: TestClient) -> None:
    r = client.post(
        "/parse-preview",
        json={"text": "x", "timezone": "Mars/Olympus", "now": kyiv(9)},
        headers={"Authorization": f"Bearer {_token()}"},
    )
    assert r.status_code == 422


def test_rate_limiter_evicts_by_wall_clock_not_request_date() -> None:
    from datetime import date, timedelta

    lim = DailyRateLimiter(limit=1)
    today = date(2026, 9, 2)
    assert lim.hit("a", today, today=today) and not lim.hit("a", today, today=today)
    lim.hit("b", today + timedelta(days=18), today=today)  # far-future request date
    assert not lim.hit("a", today, today=today)  # a's counter survived
    assert lim.hit("a", today, today=today + timedelta(days=9))  # …until the wall clock moves on
