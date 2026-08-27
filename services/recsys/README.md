# Hourwell RecSys service

Bandit-weighted CP-SAT planning service for Hourwell (thesis codename Kairos): `POST /plan`,
`POST /feedback`, `GET /insights`, `POST /parse-preview`, `GET /healthz` — the contract in
`specs/07_engine_internals_and_schema.md` §5, generated into `packages/shared/src/api.ts`.

## Deploy

Self-hosted on an Oracle Cloud Always Free VM in the EU (ADR-0009): CI builds the linux/arm64
image (`deploy-recsys.yml`), pushes it to GHCR, and the VM's rollout timer pulls it — see
`deploy/` (compose, Caddyfile, systemd units) and `docs/runbooks/oracle-vm.md`.

## Run locally

```bash
uv sync
uv run python -m hourwell_recsys.main        # http://127.0.0.1:7860, in-memory state
uv run ruff check . && uv run mypy src tests && uv run pytest
```

Without `DATABASE_URL` the service keeps per-user model state in memory (local runs, tests).

## Configuration (environment)

| Variable              | Purpose                                                                 |
| --------------------- | ----------------------------------------------------------------------- |
| `DATABASE_URL`        | Supabase pooler DSN (session or transaction mode); state persistence   |
| `SUPABASE_URL`        | Project URL — JWKS at `/auth/v1/.well-known/jwks.json` (ES256)          |
| `RECSYS_JWKS_URL`     | Optional override of the JWKS URL                                       |
| `HOURWELL_SERVICE_KEY`| Service-to-service secret (`X-Service-Key`) shared with edge functions  |
| `PORT`                | Listen port (HF Spaces: 7860)                                           |

Secrets live only in the HF Space settings and the Supabase edge-function env — never in the
client bundle, never in the repository (specs/07 §7, NFR-S1).

## Deploy

`.github/workflows/deploy-recsys.yml` pushes this directory to the Space on every merge to
`main` that touches `services/recsys/**` (requires the `HF_TOKEN` secret and `HF_SPACE` variable).
