import { assert, assertEquals, assertThrows } from '@std/assert';
import {
  buildGrid,
  feasibleStarts,
  hasWorkingWindow,
  inWindow,
  localMidnightUtcMs,
  runLengths,
  tickFloor,
  tickStartMs,
  wallClock,
} from './grid.ts';

const KYIV = 'Europe/Kyiv';
const HOURS = {
  mon: [540, 1080] as const,
  tue: [540, 1080] as const,
  wed: [540, 1080] as const,
  thu: [540, 1080] as const,
  fri: [540, 1080] as const,
};

Deno.test('local midnight is DST-safe and the grid has 96 / 92 / 100 ticks', () => {
  assertEquals(localMidnightUtcMs(KYIV, 2026, 8, 26), Date.parse('2026-08-25T21:00:00Z')); // UTC+3
  assertEquals(localMidnightUtcMs(KYIV, 2026, 1, 15), Date.parse('2026-01-14T22:00:00Z')); // UTC+2
  const normal = buildGrid({
    planDate: '2026-08-26',
    horizon: 'day',
    timezone: KYIV,
    workingHours: HOURS,
    sleepWindow: null,
    busy: [],
  });
  const spring = buildGrid({
    planDate: '2026-03-29',
    horizon: 'day',
    timezone: KYIV,
    workingHours: HOURS,
    sleepWindow: null,
    busy: [],
  });
  const fall = buildGrid({
    planDate: '2026-10-25',
    horizon: 'day',
    timezone: KYIV,
    workingHours: HOURS,
    sleepWindow: null,
    busy: [],
  });
  assertEquals([normal.nTicks, spring.nTicks, fall.nTicks], [96, 92, 100]);
  const week = buildGrid({
    planDate: '2026-10-19',
    horizon: 'week',
    timezone: KYIV,
    workingHours: HOURS,
    sleepWindow: null,
    busy: [],
  });
  assertEquals(week.nTicks, 672 + 4); // the week contains the fall-back day
  assertEquals(week.dayIndex[week.nTicks - 1], 6);
  // every tick's wall-clock minute is decided on its own instant: after the fall-back the 03:00
  // hour repeats, so minute 180 appears twice and the daypart membership follows the wall clock
  const threes = Array.from(fall.localMinute).filter((m) => m === 180).length;
  assertEquals(threes, 2);
});

Deno.test('wallClock uses the zone, not the host; weekday 0 = Monday', () => {
  const wc = wallClock(Date.parse('2026-08-26T21:30:00Z'), KYIV); // Thu 00:30 local
  assertEquals([wc.year, wc.month, wc.day, wc.minuteOfDay, wc.weekday], [2026, 8, 27, 30, 3]);
  const ny = wallClock(Date.parse('2026-08-26T21:30:00Z'), 'America/New_York'); // Wed 17:30
  assertEquals([ny.day, ny.minuteOfDay, ny.weekday], [26, 17 * 60 + 30, 2]);
  assertThrows(
    () =>
      buildGrid({
        planDate: '2026-08-26',
        horizon: 'day',
        timezone: 'Mars/Olympus',
        workingHours: HOURS,
        sleepWindow: null,
        busy: [],
      }),
    RangeError,
  );
  assertThrows(
    () =>
      buildGrid({
        planDate: '2026-02-30',
        horizon: 'day',
        timezone: KYIV,
        workingHours: HOURS,
        sleepWindow: null,
        busy: [],
      }),
    RangeError,
  );
});

Deno.test('W = working hours ∖ (sleep ∪ busy±buffer ∪ past); 00–06 never workable', () => {
  const busy = [{
    startMs: Date.parse('2026-08-26T10:00:00+03:00'),
    endMs: Date.parse('2026-08-26T11:30:00+03:00'),
  }];
  const grid = buildGrid({
    planDate: '2026-08-26',
    horizon: 'day',
    timezone: KYIV,
    workingHours: HOURS,
    sleepWindow: [1380, 420],
    busy,
  });
  const workable = Array.from(grid.workable).map((v, k) => (v ? k : -1)).filter((k) => k >= 0);
  const t = (h: number, m = 0) => (h * 60 + m) / 15;
  // 09:00–18:00 = 36 ticks, minus busy 10:00–11:30 (6) and buffers 09:45 + 11:30 (2)
  assertEquals(workable.length, 36 - 6 - 2);
  assert(!grid.workable[t(9, 45)] && !grid.workable[t(11, 30)] && grid.workable[t(11, 45)]);
  assertEquals(Array.from(grid.occupied).filter(Boolean).length, 6);
  // weekend day with no hours: nothing workable; early hours with declared hours: no daypart ⇒ not workable
  const sat = buildGrid({
    planDate: '2026-08-29',
    horizon: 'day',
    timezone: KYIV,
    workingHours: HOURS,
    sleepWindow: null,
    busy: [],
  });
  assertEquals(Array.from(sat.workable).some(Boolean), false);
  const early = buildGrid({
    planDate: '2026-08-26',
    horizon: 'day',
    timezone: KYIV,
    workingHours: { wed: [240, 480] },
    sleepWindow: null,
    busy: [],
  });
  assertEquals(Array.from(early.workable).filter(Boolean).length, 8); // 06:00–08:00 only
  // now cuts the past
  const cut = buildGrid({
    planDate: '2026-08-26',
    horizon: 'day',
    timezone: KYIV,
    workingHours: HOURS,
    sleepWindow: null,
    busy: [],
    nowMs: Date.parse('2026-08-26T13:10:00+03:00'),
  });
  assert(!cut.workable[t(13, 0)] && cut.workable[t(13, 15)]);
  assertEquals(inWindow(30, [1380, 420]), true);
  assertEquals(inWindow(600, [1380, 420]), false);
});

Deno.test('hasWorkingWindow (ADR-0019): declared hours ∖ (sleep ∪ 00–06), never the clock or the calendar', () => {
  const base = { horizon: 'day' as const, timezone: KYIV, workingHours: HOURS, sleepWindow: null };
  assertEquals(hasWorkingWindow({ ...base, planDate: '2026-08-26' }), true); // Wednesday
  assertEquals(hasWorkingWindow({ ...base, planDate: '2026-08-29' }), false); // Saturday, no hours
  // hours entirely inside the 00–06 rule
  assertEquals(
    hasWorkingWindow({ ...base, planDate: '2026-08-26', workingHours: { wed: [60, 300] } }),
    false,
  );
  // hours entirely inside the sleep window (22:00–24:00 declared, sleep 21:00–07:00)
  assertEquals(
    hasWorkingWindow({
      ...base,
      planDate: '2026-08-26',
      workingHours: { wed: [1320, 1440] },
      sleepWindow: [1260, 420],
    }),
    false,
  );
  // one surviving tick is a window
  assertEquals(
    hasWorkingWindow({
      ...base,
      planDate: '2026-08-26',
      workingHours: { wed: [1305, 1440] },
      sleepWindow: [1320, 420],
    }),
    true,
  );
  // a week horizon has a window when ANY of its days does (Saturday start, Wednesday inside)
  assertEquals(hasWorkingWindow({ ...base, planDate: '2026-08-29', horizon: 'week' }), true);
  assertEquals(
    hasWorkingWindow({ ...base, planDate: '2026-08-29', horizon: 'week', workingHours: {} }),
    false,
  );
});

Deno.test('F_τ verbatim: [k, k+d+b) ⊆ W, e ≤ k, k + d ≤ dl; buffer may pass the deadline (L2)', () => {
  const grid = buildGrid({
    planDate: '2026-08-26',
    horizon: 'day',
    timezone: KYIV,
    workingHours: { wed: [540, 660] },
    sleepWindow: null,
    busy: [],
  }); // 09:00–11:00 = 8 ticks
  const r = runLengths(grid);
  assertEquals(r[36], 8);
  assertEquals(
    feasibleStarts(grid, { duration: 4, earliest: null, deadline: null, runLengths: r }),
    [36, 37, 38, 39],
  );
  assertEquals(feasibleStarts(grid, { duration: 4, earliest: 38, deadline: null }), [38, 39]);
  assertEquals(feasibleStarts(grid, { duration: 4, earliest: null, deadline: 42 }), [36, 37, 38]);
  assertEquals(feasibleStarts(grid, { duration: 7, earliest: null, deadline: 43 }), [36]); // buffer at 43 ⊆ W, past dl
  assertEquals(feasibleStarts(grid, { duration: 8, earliest: null, deadline: null }), []); // no room for the buffer
  assertEquals(tickFloor(grid, tickStartMs(grid, 40) + 1), 40);
});
