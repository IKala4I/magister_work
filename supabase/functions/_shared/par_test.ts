/**
 * PAR (File 06 §1.4) as pre-registered code: the per-block rule, the denominator exclusions,
 * ISO weeks in the user's zone, and the H2 guard — the module never touches reward columns.
 */
import { assert, assertEquals } from '@std/assert';
import { isoWeek, type ParBlock, type ParFact, parOfBlock, weeklyPar } from './par.ts';

const block = (over: Partial<ParBlock> = {}): ParBlock => ({
  id: 'r1',
  slot_start: '2026-09-02T11:00:00Z', // Wed 14:00 Kyiv
  slot_end: '2026-09-02T12:30:00Z',
  status: 'completed',
  ...over,
});
const focusEnd = (payload: Record<string, unknown>, rec = 'r1'): ParFact => ({
  type: 'focus_end',
  recommendation_id: rec,
  payload,
});

Deno.test('PAR = 1 for an in-window finished session; 0 for none, off-window, or < 50 %', () => {
  assertEquals(parOfBlock(block(), []), 0);
  assertEquals(
    parOfBlock(block(), [focusEnd({ outcome: 'finished', started_at: '2026-09-02T11:14:00Z' })]),
    1,
  );
  assertEquals(
    parOfBlock(block(), [focusEnd({ outcome: 'finished', started_at: '2026-09-02T11:16:00Z' })]),
    0,
    'started 16 min late is outside the ±15 min grace',
  );
  assertEquals(
    parOfBlock(block(), [
      focusEnd({
        outcome: 'abandoned',
        started_at: '2026-09-02T11:00:00Z',
        focused_ms: 40 * 60_000,
        planned_minutes: 90,
      }),
    ]),
    0,
    '40/90 < 0.5',
  );
  assertEquals(
    parOfBlock(block(), [
      focusEnd({
        outcome: 'abandoned',
        started_at: '2026-09-02T11:00:00Z',
        focused_ms: 30 * 60_000,
        planned_minutes: 90,
      }),
      focusEnd({
        outcome: 'abandoned',
        started_at: '2026-09-02T11:10:00Z',
        focused_ms: 20 * 60_000,
        planned_minutes: 90,
      }),
    ]),
    1,
    'sessions inside the window add up: 50/90 ≥ 0.5',
  );
  // a task_completed fact without a session is not adherence (File 06: focus started in window)
  assertEquals(
    parOfBlock(block(), [{ type: 'task_completed', recommendation_id: 'r1', payload: {} }]),
    0,
  );
  // another block's session never counts
  assertEquals(
    parOfBlock(block(), [
      focusEnd({ outcome: 'finished', started_at: '2026-09-02T11:00:00Z' }, 'r2'),
    ]),
    0,
  );
});

Deno.test('ISO week follows the LOCAL date: Sunday 23:30 Kyiv is still that week; Monday 00:30 is the next', () => {
  // 2026-08-30 is a Sunday. 20:30Z = 23:30 Kyiv (UTC+3) → W35; 21:30Z = 00:30 Mon Kyiv → W36
  assertEquals(isoWeek(Date.parse('2026-08-30T20:30:00Z'), 'Europe/Kyiv'), '2026-W35');
  assertEquals(isoWeek(Date.parse('2026-08-30T21:30:00Z'), 'Europe/Kyiv'), '2026-W36');
  assertEquals(isoWeek(Date.parse('2026-08-30T21:30:00Z'), 'UTC'), '2026-W35');
  assertEquals(
    isoWeek(Date.parse('2027-01-01T12:00:00Z'), 'UTC'),
    '2026-W53',
    'Jan 1 2027 is a Friday of ISO week 53 of 2026',
  );
  assertEquals(isoWeek(Date.parse('2026-01-01T12:00:00Z'), 'UTC'), '2026-W01');
});

Deno.test('weekly PAR: displaced/displaced_pending/expired excluded, open slots excluded, oldest first, capped', () => {
  const facts = [focusEnd({ outcome: 'finished', started_at: '2026-09-02T11:00:00Z' })];
  const weeks = weeklyPar(
    [
      block(), // W36 hit
      block({ id: 'r2', slot_start: '2026-09-03T11:00:00Z', slot_end: '2026-09-03T12:00:00Z' }), // W36 miss
      block({
        id: 'r3',
        status: 'displaced',
        slot_start: '2026-09-03T13:00:00Z',
        slot_end: '2026-09-03T14:00:00Z',
      }),
      block({ id: 'r4', status: 'displaced_pending' }),
      block({ id: 'r5', status: 'expired' }),
      block({
        id: 'r6',
        slot_start: '2026-08-26T11:00:00Z',
        slot_end: '2026-08-26T12:00:00Z',
        status: 'lapsed',
      }), // W35 miss
      block({ id: 'r7', slot_start: '2026-09-10T11:00:00Z', slot_end: '2026-09-10T12:00:00Z' }), // future: open
    ],
    facts,
    'Europe/Kyiv',
    Date.parse('2026-09-05T00:00:00Z'),
  );
  assertEquals(weeks, [
    { week: '2026-W35', par: 0, n: 1 },
    { week: '2026-W36', par: 0.5, n: 2 },
  ]);
  assertEquals(
    weeklyPar([block()], facts, 'Europe/Kyiv', Date.parse('2026-09-05T00:00:00Z'), 0),
    [],
  );
});

Deno.test('H2 guard: the PAR module never reads a reward column or the reward table', async () => {
  const src = await Deno.readTextFile(new URL('./par.ts', import.meta.url));
  // code only: the header comment names the rule (and the table it must avoid) on purpose
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  for (const forbidden of ['feedback_rewards', 'reward', 'excluded', 'propensity', 'q_hat']) {
    assert(!code.toLowerCase().includes(forbidden), `par.ts code mentions ${forbidden}`);
  }
  assert(code.includes("from './params.ts'"), 'the two study constants come from params.ts');
});
