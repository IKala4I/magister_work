"""The committed cross-language fixture equals a fresh generation (H1: the arm-A edge function
mirrors this grid/φ/F_τ/eligibility exactly — its Deno test reads the same file)."""

from __future__ import annotations

import json

from hourwell_recsys.parity_fixture import FIXTURE, generate


def test_committed_fixture_matches_generation() -> None:
    assert FIXTURE.exists(), "run: uv run python scripts/gen_grid_parity.py"
    assert json.loads(FIXTURE.read_text()) == generate()
