"""Regenerate supabase/functions/_shared/testdata/grid_parity.json.

The generator lives in `hourwell_recsys.parity_fixture` (mypy-checked, pinned by its test).

Usage (from services/recsys): uv run python scripts/gen_grid_parity.py
"""

from __future__ import annotations

import json

from hourwell_recsys.parity_fixture import FIXTURE, generate

if __name__ == "__main__":
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(json.dumps(generate(), indent=1) + "\n")
    print(f"wrote {FIXTURE}")
