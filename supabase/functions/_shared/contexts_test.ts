import { assertEquals, assertThrows } from '@std/assert';
import {
  BUCKET_IDS,
  bucketFromId,
  bucketsForGrid,
  daypartForHour,
  fatiguedTicks,
} from './contexts.ts';
import { buildGrid } from './grid.ts';

const HOURS = { mon: [540, 1080] as const, tue: [540, 1080] as const, wed: [540, 1080] as const };

Deno.test('|C| = 14 bucket ids in the service order (specs/07 §3.2.5; contexts.py BUCKET_IDS)', () => {
  assertEquals(BUCKET_IDS, [
    'EM.wd',
    'MO.wd.fresh',
    'MO.wd.fatigued',
    'MD.wd',
    'AF.wd.fresh',
    'AF.wd.fatigued',
    'EV.wd',
    'NT.wd',
    'EM.we',
    'MO.we',
    'MD.we',
    'AF.we',
    'EV.we',
    'NT.we',
  ]);
  assertEquals(bucketFromId('AF.wd.fatigued').position, 'fatigued');
  assertThrows(() => bucketFromId('AF.wd'), RangeError);
});

Deno.test('daypart boundaries EM 06-09 · MO 09-12 · MD 12-14 · AF 14-17 · EV 17-20 · NT 20-24', () => {
  assertEquals([5, 6, 8, 9, 11, 12, 13, 14, 16, 17, 19, 20, 23].map(daypartForHour), [
    null,
    'EM',
    'EM',
    'MO',
    'MO',
    'MD',
    'MD',
    'AF',
    'AF',
    'EV',
    'EV',
    'NT',
    'NT',
  ]);
  assertThrows(() => daypartForHour(24), RangeError);
});

Deno.test('fatigue: ≥ 90 occupied minutes ending ≤ 15 min before the tick (weekday MO/AF only)', () => {
  // Wed 2026-08-26 Kyiv; busy 09:00–10:30 (6 ticks) ⇒ 10:30 and 10:45 fatigued, 11:00 fresh again
  const grid = buildGrid({
    planDate: '2026-08-26',
    horizon: 'day',
    timezone: 'Europe/Kyiv',
    workingHours: HOURS,
    sleepWindow: [1380, 420],
    busy: [{
      startMs: Date.parse('2026-08-26T09:00:00+03:00'),
      endMs: Date.parse('2026-08-26T10:30:00+03:00'),
    }],
  });
  const fat = fatiguedTicks(grid, grid.occupied);
  const tickAt = (h: number, m: number) => (h * 60 + m) / 15;
  assertEquals(fat[tickAt(10, 30)], 1);
  assertEquals(fat[tickAt(10, 45)], 1);
  assertEquals(fat[tickAt(11, 0)], 0);
  const buckets = bucketsForGrid(grid, grid.occupied);
  assertEquals(buckets[tickAt(10, 30)]?.id, 'MO.wd.fatigued');
  assertEquals(buckets[tickAt(11, 0)]?.id, 'MO.wd.fresh');
  assertEquals(buckets[tickAt(12, 0)]?.id, 'MD.wd'); // MD never splits
  assertEquals(buckets[tickAt(3, 0)], null); // no daypart before 06:00
  // 75 min of busy time is below the 90-min run: never fatigued
  const short = buildGrid({
    planDate: '2026-08-26',
    horizon: 'day',
    timezone: 'Europe/Kyiv',
    workingHours: HOURS,
    sleepWindow: [1380, 420],
    busy: [{
      startMs: Date.parse('2026-08-26T09:00:00+03:00'),
      endMs: Date.parse('2026-08-26T10:15:00+03:00'),
    }],
  });
  assertEquals(Array.from(fatiguedTicks(short, short.occupied)).some((v) => v === 1), false);
});
