#!/usr/bin/env bash
# Regenerate packages/shared/src/api.ts from the FastAPI OpenAPI document (File 03 §6 step 2).
# Run from anywhere; CI diffs the committed file against a fresh generation.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TMP="$(mktemp -d)"
(cd "$ROOT/services/recsys" && uv run --no-sync python -m hourwell_recsys.openapi) > "$TMP/openapi.json"
(cd "$ROOT/packages/shared" && pnpm exec openapi-typescript "$TMP/openapi.json" -o src/api.ts --alphabetize --root-types)
rm -rf "$TMP"
