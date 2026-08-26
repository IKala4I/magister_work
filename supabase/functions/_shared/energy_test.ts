import { assertAlmostEquals, assertEquals } from '@std/assert';
import { cellKey, decayFactor, fallbackCells, posterior, posteriorTable } from './energy.ts';

Deno.test('decay: half-life 28 d; out-of-order deltas clamp to 0', () => {
  assertAlmostEquals(decayFactor(28 * 86_400), 0.5, 1e-12);
  assertAlmostEquals(decayFactor(14 * 86_400), 0.7071067811865476, 1e-12); // Python reference
  assertEquals(decayFactor(-5), 1);
});

Deno.test('posterior matches the service reference (energy.py) for a 28-day-old cell', () => {
  const now = Date.parse('2026-08-26T12:00:00Z');
  const p = posterior(
    {
      category: 'deep',
      daypart: 'MO',
      dayType: 'weekday',
      alpha0: 2,
      beta0: 2,
      succ: 3,
      fail: 1,
      lastEventAtMs: now - 28 * 86_400_000,
    },
    now,
  );
  assertAlmostEquals(p.alpha, 3.5, 1e-12);
  assertAlmostEquals(p.beta, 2.5, 1e-12);
  assertAlmostEquals(p.nEffective, 2.0, 1e-12);
  assertAlmostEquals(p.mean, 0.5833333333333334, 1e-12);
  assertAlmostEquals(p.sd, 0.18633899812498247, 1e-12);
});

Deno.test('flat fallback prior: 48 cells at (2, 2) = μ₀ 0.5 at half strength; user cells override', () => {
  const cells = fallbackCells();
  assertEquals(cells.length, 48);
  assertEquals(cells.every((c) => c.alpha0 === 2 && c.beta0 === 2), true);
  const now = 0;
  const table = posteriorTable([{
    category: 'admin',
    daypart: 'AF',
    dayType: 'weekday',
    alpha0: 5,
    beta0: 3,
    succ: 0,
    fail: 0,
    lastEventAtMs: null,
  }], now);
  assertEquals(table.size, 48);
  assertAlmostEquals(table.get(cellKey('admin', 'AF', 'weekday'))?.mean ?? -1, 0.625, 1e-12);
  assertAlmostEquals(table.get(cellKey('deep', 'AF', 'weekday'))?.mean ?? -1, 0.5, 1e-12);
  assertAlmostEquals(
    table.get(cellKey('deep', 'AF', 'weekday'))?.sd ?? -1,
    Math.sqrt(4 / (16 * 5)),
    1e-12,
  );
});
