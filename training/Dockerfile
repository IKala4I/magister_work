# Hourwell training/analysis container — runs ONLY on the EU VM (ADR-0011 option A: participant
# data never leaves the EU and never reaches CI; train.yml uses this same image on synthetic
# data). Build context = the REPO ROOT (the package depends on services/recsys by path).
FROM python:3.12-slim AS base
COPY --from=ghcr.io/astral-sh/uv:0.12.5 /uv /uvx /bin/
ARG TRAINING_BUILD=dev
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/opt/venv \
    PYTHONUNBUFFERED=1 TRAINING_BUILD=$TRAINING_BUILD
# libgomp1: OpenMP runtime for `implicit` (ALS) and scikit-learn on slim images
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*
LABEL org.opencontainers.image.source="https://github.com/IKala4I/magister_work" \
      org.opencontainers.image.description="Hourwell nightly training + OPE harness (ADR-0015)" \
      org.opencontainers.image.licenses="MIT"
WORKDIR /app/training
COPY services/recsys /app/services/recsys
COPY training/pyproject.toml training/uv.lock ./
RUN uv sync --locked --no-dev --no-install-project
COPY training/src ./src
COPY training/scripts ./scripts
RUN uv sync --locked --no-dev
RUN useradd -m -u 1000 app && chown -R app:app /app
USER app
ENTRYPOINT ["/opt/venv/bin/hourwell-train"]
