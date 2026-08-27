/**
 * UC-07 target context: the moved block's new bucket/features come from the same grid + φ +
 * feature modules as arm A (parity-pinned), with the day's other blocks as a-priori occupancy.
 */
import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import { FEATURE_DIM } from '../_shared/params.ts';
import { targetContext } from './override.ts';

const kyiv = (h: number, m = 0) =>
  Date.parse(`2026-09-02T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+03:00`);
const base = {
  timezone: 'Europe/Kyiv',
  workingHours: { wed: [540, 1080] as [number, number] },
  sleepWindow: [1380, 420] as [number, number],
  busy: [],
  otherBlocks: [],
  task: {
    category: 'deep' as const,
    value: 3,
    est_minutes: 60,
    splittable: false,
    deadline: null,
    postpone_count: 1,
  },
  cells: [],
  nowMs: kyiv(13),
};

Deno.test('a 14:00 weekday target with a free morning is AF.wd.fresh with a 17-dim snapshot', () => {
  const t = targetContext({ ...base, toStartMs: kyiv(14), toEndMs: kyiv(15) });
  assert(t !== null);
  assertEquals(t.context_bucket, 'AF.wd.fresh');
  assertEquals(t.features.length, FEATURE_DIM);
  assertEquals(t.features[0], 1);
  assertEquals(t.features[1 + 3], 1); // AF one-hot (EM, MO, MD, AF …)
  assertEquals(t.features[7], 0); // weekday
  assertEquals(t.features[8], 0); // fresh
  assertEquals(t.features[9], 1); // value 3 → (3-1)/2
  assertEquals(t.features[16], 0); // no preceding load
  assertEquals(t.to_start, new Date(kyiv(14)).toISOString());
  assertEquals(t.local_day, '2026-09-02');
});

Deno.test('other committed blocks before the target make it fatigued and load feature 17', () => {
  const t = targetContext({
    ...base,
    otherBlocks: [{ startMs: kyiv(12, 15), endMs: kyiv(14) }], // 105 min run ending at the target
    toStartMs: kyiv(14),
    toEndMs: kyiv(15),
  });
  assert(t !== null);
  assertEquals(t.context_bucket, 'AF.wd.fatigued');
  assertEquals(t.features[8], 1);
  assert(t.features[16] > 0.5);
});

Deno.test('a weekend target uses the unsplit bucket and the weekend flag', () => {
  const sat = Date.parse('2026-09-05T10:00:00+03:00');
  const t = targetContext({
    ...base,
    workingHours: { sat: [600, 900] as [number, number] },
    toStartMs: sat,
    toEndMs: sat + 3_600_000,
  });
  assert(t !== null);
  assertEquals(t.context_bucket, 'MO.we');
  assertEquals(t.features[7], 1);
});

Deno.test('a target before 06:00 has no daypart → null (no override_in tuple)', () => {
  assertStrictEquals(targetContext({ ...base, toStartMs: kyiv(3), toEndMs: kyiv(4) }), null);
});

Deno.test('a deadline 4 h after the target gives the urgency term e^{-1}', () => {
  const t = targetContext({
    ...base,
    task: { ...base.task, deadline: new Date(kyiv(18)).toISOString() },
    toStartMs: kyiv(14),
    toEndMs: kyiv(15),
  });
  assert(t !== null);
  assertEquals(Math.round(t.features[12] * 1000) / 1000, Math.round(Math.exp(-1) * 1000) / 1000);
});
