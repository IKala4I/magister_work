"""PAR rule vs hand-computed cases — the same cases par_test.ts pins (H2: one rule, two
runtimes), plus the source lock: this module must never read a reward column."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

from hourwell_training import par

T0 = datetime(2026, 9, 7, 9, 0, tzinfo=UTC)  # a Monday, 09:00


def block(status: str = "completed", minutes: int = 60) -> par.ParBlock:
    return par.ParBlock(
        id="r1", slot_start=T0, slot_end=T0 + timedelta(minutes=minutes), status=status
    )


def fact(**kw: object) -> par.FocusFact:
    base: dict[str, object] = {
        "recommendation_id": "r1",
        "started_at": T0,
        "outcome": None,
        "focused_ms": None,
        "planned_minutes": None,
    }
    base.update(kw)
    return par.FocusFact(**base)  # type: ignore[arg-type]


def test_finished_in_window_is_adherent() -> None:
    assert par.par_of_block(block(), [fact(outcome="finished")]) == 1


def test_started_16_minutes_late_is_not_adherent() -> None:
    late = fact(outcome="finished", started_at=T0 + timedelta(minutes=16))
    assert par.par_of_block(block(), [late]) == 0


def test_started_15_minutes_late_is_within_grace() -> None:
    edge = fact(outcome="finished", started_at=T0 + timedelta(minutes=15))
    assert par.par_of_block(block(), [edge]) == 1


def test_half_focused_meets_the_fraction_rule() -> None:
    # 30 of 60 planned minutes focused: 1_800_000 ms / 3_600_000 ms = 0.5 >= 0.5
    assert par.par_of_block(block(), [fact(focused_ms=1_800_000.0)]) == 1
    assert par.par_of_block(block(), [fact(focused_ms=1_799_999.0)]) == 0


def test_planned_minutes_override_beats_slot_length() -> None:
    # payload says 90 planned minutes: 30 focused / 90 = 0.33 < 0.5 despite the 60-min slot
    f = fact(focused_ms=1_800_000.0, planned_minutes=90.0)
    assert par.par_of_block(block(), [f]) == 0


def test_abandoned_at_04_is_not_adherent_even_though_reward_is_04() -> None:
    # H2's canonical divergence: r = f = 0.4 for the bandit, PAR = 0 for the study
    assert par.par_of_block(block(), [fact(focused_ms=1_440_000.0, outcome="abandoned")]) == 0


def test_other_blocks_facts_do_not_count() -> None:
    other = fact(recommendation_id="r2", outcome="finished")
    assert par.par_of_block(block(), [other]) == 0


def test_displaced_and_expired_blocks_leave_the_denominator() -> None:
    blocks = [block(status=s) for s in ("displaced", "displaced_pending", "expired")]
    out = par.weekly_par(blocks, [fact(outcome="finished")], "Europe/Kyiv", T0 + timedelta(days=1))
    assert out == []


def test_weekly_series_groups_by_local_iso_week() -> None:
    b1 = par.ParBlock("r1", T0, T0 + timedelta(minutes=60), "completed")
    b2 = par.ParBlock(
        "r2", T0 + timedelta(days=7), T0 + timedelta(days=7, minutes=60), "lapsed"
    )
    facts = [fact(outcome="finished")]
    out = par.weekly_par([b1, b2], facts, "Europe/Kyiv", T0 + timedelta(days=8))
    assert [(w.week, w.par, w.n) for w in out] == [("2026-W37", 1.0, 1), ("2026-W38", 0.0, 1)]


def test_open_blocks_are_not_yet_outcomes() -> None:
    out = par.weekly_par([block()], [fact(outcome="finished")], "Europe/Kyiv", T0)
    assert out == []  # slot_end > now


def test_source_never_touches_reward_columns() -> None:
    """The H2 lock, Python side (the Deno twin covers par.ts): no identifier, attribute or
    string LITERAL in the CODE references the reward substrate — prose (docstrings,
    comments) may explain the rule, code may not touch it."""
    import ast

    tree = ast.parse(Path(par.__file__).read_text())
    tokens: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            tokens.add(node.id)
        elif isinstance(node, ast.Attribute):
            tokens.add(node.attr)
        elif isinstance(node, ast.Constant) and isinstance(node.value, str):
            # keep only non-docstring literals (docstrings are Expr-level constants)
            tokens.add(node.value)
    docstrings = {ast.get_docstring(n, clean=False) for n in ast.walk(tree)
                  if isinstance(n, ast.Module | ast.FunctionDef | ast.ClassDef)}
    tokens -= {d for d in docstrings if d}
    for t in tokens:
        assert "reward" not in t and "feedback" not in t, t
