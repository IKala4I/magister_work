import { assert, assertEquals, assertNotEquals, assertThrows } from '@std/assert';
import { randomSeed, seededRng } from './rng.ts';

Deno.test('same seed ⇒ same stream; different seeds differ', () => {
  const a = seededRng(2026);
  const b = seededRng(2026);
  const c = seededRng(2027);
  const sa = Array.from({ length: 8 }, () => a.nextU32());
  const sb = Array.from({ length: 8 }, () => b.nextU32());
  const sc = Array.from({ length: 8 }, () => c.nextU32());
  assertEquals(sa, sb);
  assertNotEquals(sa, sc);
});

Deno.test('random() ∈ [0, 1) and int(n) is uniform (chi-square within bounds)', () => {
  const rng = seededRng(7);
  for (let i = 0; i < 10_000; i++) {
    const r = rng.random();
    assert(r >= 0 && r < 1);
  }
  const n = 5;
  const trials = 50_000;
  const counts = new Array<number>(n).fill(0);
  for (let i = 0; i < trials; i++) counts[rng.int(n)]++;
  const expected = trials / n;
  const chi2 = counts.reduce((acc, c) => acc + ((c - expected) ** 2) / expected, 0);
  assert(chi2 < 18.47, `chi2 ${chi2} exceeds the 0.001 critical value for 4 df`); // χ²₄(0.999)
});

Deno.test('int(n) rejects bad n; seeds must be safe integers; randomSeed is a 53-bit safe int', () => {
  const rng = seededRng(1);
  assertThrows(() => rng.int(0), RangeError);
  assertThrows(() => rng.int(1.5), RangeError);
  assertThrows(() => seededRng(-1), RangeError);
  assertThrows(() => seededRng(2 ** 53), RangeError);
  for (let i = 0; i < 100; i++) {
    const s = randomSeed();
    assert(Number.isSafeInteger(s) && s >= 0);
  }
  assertEquals(rng.int(1), 0);
});
