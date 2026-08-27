# Hourwell RecSys — container image for the self-hosted VM (ADR-0009: Oracle Cloud Always Free,
# linux/arm64) and any linux/amd64 host; both base images are multi-arch. Built by
# .github/workflows/deploy-recsys.yml and pushed to GHCR; the VM pulls it (pull-based rollout).
FROM python:3.12-slim AS base
COPY --from=ghcr.io/astral-sh/uv:0.12.5 /uv /uvx /bin/
ARG RECSYS_BUILD=dev
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/opt/venv PORT=7860 \
    PYTHONUNBUFFERED=1 RECSYS_BUILD=$RECSYS_BUILD
LABEL org.opencontainers.image.source="https://github.com/IKala4I/magister_work" \
      org.opencontainers.image.description="Hourwell RecSys — bandit-weighted CP-SAT planning service" \
      org.opencontainers.image.licenses="MIT"
WORKDIR /app
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --locked --no-dev --no-install-project
COPY src ./src
COPY scripts ./scripts
RUN uv sync --locked --no-dev
# unprivileged runtime user; the app dir stays read-only for it apart from nothing it needs to write
RUN useradd -m -u 1000 app && chown -R app:app /app
USER app
EXPOSE 7860
CMD ["/opt/venv/bin/python", "-m", "hourwell_recsys.main"]
