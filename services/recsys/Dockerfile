# Hourwell RecSys — Hugging Face Spaces (Docker SDK, free CPU). Port 7860 per HF convention.
FROM python:3.12-slim AS base
COPY --from=ghcr.io/astral-sh/uv:0.12.5 /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/opt/venv PORT=7860 \
    PYTHONUNBUFFERED=1
WORKDIR /app
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --locked --no-dev --no-install-project
COPY src ./src
RUN uv sync --locked --no-dev
# HF Spaces run as uid 1000; keep the venv readable and the app dir owned by it
RUN useradd -m -u 1000 app && chown -R app:app /app
USER app
EXPOSE 7860
CMD ["/opt/venv/bin/python", "-m", "hourwell_recsys.main"]
