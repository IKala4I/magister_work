"""FastAPI application — specs/07 §5 surface. Build with `create_app()`; `main.py` serves it."""

from __future__ import annotations

import os
import platform
import time
from collections import defaultdict
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from hourwell_recsys import __version__
from hourwell_recsys.auth import (
    AuthError,
    AuthSettings,
    JwksVerifier,
    Principal,
    TokenVerifier,
    authorize_user,
)
from hourwell_recsys.auth import authenticate as _authenticate
from hourwell_recsys.feedback import StateNotInstantiated, apply_feedback
from hourwell_recsys.insights import insights as _insights
from hourwell_recsys.params import MODEL_VERSION, PLAN_RATE_LIMIT_PER_DAY
from hourwell_recsys.parse_preview import parse_preview as _parse_preview
from hourwell_recsys.planner import PlanSettingsMismatch
from hourwell_recsys.planner import plan as _plan
from hourwell_recsys.repo import InMemoryRepo, PostgresRepo, Repo
from hourwell_recsys.schemas import (
    FeedbackRequest,
    FeedbackResponse,
    HealthzResponse,
    InsightsResponse,
    ParsePreviewRequest,
    ParsePreviewResponse,
    PlanRequest,
    PlanResponse,
)


class DailyRateLimiter:
    """Defense in depth for the Appendix A /plan cap; the edge function's counter (P6) is the
    authority — this one is per-process and resets on restart."""

    def __init__(self, limit: int = PLAN_RATE_LIMIT_PER_DAY) -> None:
        self.limit = limit
        self._counts: dict[tuple[str, date], int] = defaultdict(int)

    def hit(self, user_id: str, day: date, *, today: date | None = None) -> bool:
        today = today or datetime.now(UTC).date()  # evict by wall clock, never by request data
        stale = [k for k in self._counts if abs((today - k[1]).days) > 8]
        for k in stale:
            del self._counts[k]
        self._counts[(user_id, day)] += 1
        return self._counts[(user_id, day)] <= self.limit


def create_app(
    *,
    repo: Repo | None = None,
    auth: AuthSettings | None = None,
    verifier: TokenVerifier | None = None,
    rate_limiter: DailyRateLimiter | None = None,
) -> FastAPI:
    settings = auth or AuthSettings.from_env()
    if repo is None:
        dsn = os.environ.get("DATABASE_URL")
        repo = PostgresRepo(dsn) if dsn else InMemoryRepo()
    if verifier is None and settings.jwks_url:
        verifier = JwksVerifier(settings.jwks_url)
    limiter = rate_limiter or DailyRateLimiter()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if isinstance(repo, PostgresRepo):
            repo.open()
        try:
            yield
        finally:
            if isinstance(repo, PostgresRepo):
                repo.close()

    app = FastAPI(
        title="Hourwell RecSys",
        version=__version__,
        description="Bandit-weighted CP-SAT planning service (specs/04 §1, specs/07 §5).",
        lifespan=lifespan,
    )
    started = time.monotonic()

    def principal(request: Request) -> Principal:
        try:
            return _authenticate(
                authorization=request.headers.get("authorization"),
                x_service_key=request.headers.get("x-service-key"),
                settings=settings,
                verifier=verifier,
            )
        except AuthError as exc:
            raise HTTPException(exc.status, exc.detail) from exc

    def guard(p: Principal, user_id: str) -> None:
        try:
            authorize_user(p, user_id)
        except AuthError as exc:
            raise HTTPException(exc.status, exc.detail) from exc

    @app.exception_handler(StateNotInstantiated)
    async def _not_instantiated(_: Request, exc: StateNotInstantiated) -> JSONResponse:
        return JSONResponse(
            status_code=409, content={"detail": "model state not instantiated for this user"}
        )

    @app.get("/healthz", response_model=HealthzResponse, operation_id="healthz")
    def healthz() -> HealthzResponse:
        if not repo.healthy():
            raise HTTPException(503, "storage unavailable")
        return HealthzResponse(
            status="ok",
            model_versions={"priors": "0", "als": None, "blend": "init", "recsys": MODEL_VERSION},
            uptime_s=round(time.monotonic() - started, 1),
            storage=repo.storage,  # type: ignore[arg-type]
            build=os.environ.get("RECSYS_BUILD", "dev"),
            arch=platform.machine(),
        )

    @app.post("/plan", response_model=PlanResponse, operation_id="plan")
    def plan(req: PlanRequest, p: Principal = Depends(principal)) -> PlanResponse:  # noqa: B008
        guard(p, str(req.user_id))
        if not limiter.hit(str(req.user_id), req.plan_date):
            raise HTTPException(429, f"/plan limit of {limiter.limit} per user per day reached")
        try:
            return _plan(req, repo)
        except PlanSettingsMismatch as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.post("/feedback", response_model=FeedbackResponse, operation_id="feedback")
    def feedback(req: FeedbackRequest, p: Principal = Depends(principal)) -> FeedbackResponse:  # noqa: B008
        guard(p, str(req.user_id))
        return apply_feedback(req, repo)

    @app.get("/insights", response_model=InsightsResponse, operation_id="insights")
    def insights(
        user_id: str | None = Query(default=None),  # noqa: B008
        p: Principal = Depends(principal),  # noqa: B008
    ) -> InsightsResponse:
        uid = user_id or p.user_id
        if uid is None:
            raise HTTPException(422, "user_id is required with a service key")
        guard(p, uid)
        return _insights(uid, repo, now=datetime.now(UTC))

    @app.post("/parse-preview", response_model=ParsePreviewResponse, operation_id="parsePreview")
    def parse_preview(
        req: ParsePreviewRequest,
        p: Principal = Depends(principal),  # noqa: B008
    ) -> ParsePreviewResponse:
        return _parse_preview(req)

    return app
