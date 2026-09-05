/**
 * FR-50 cap under a storm (PLAN §3 P10 acceptance): the pure planner never asks for more than
 * NOTIFICATION_DAILY_CAP per local day including what was already delivered, muted categories
 * and closed placements yield nothing, the ritual reserves one slot, ordering is deterministic.
 */
import { NOTIFICATION_DAILY_CAP } from '@hourwell/shared';

import { DEFAULT_NOTIFICATION_SETTINGS } from '../../domain/notificationSettings';
import { MIN_LEAD_MS, type PlanRecommendation, type PlanTask, planNotifications } from '../plan';

const NOW = new Date(2026, 8, 7, 9, 0); // Monday 2026-09-07 09:00 local
const DAY = '2026-09-07';

function rec(
  i: number,
  hour: number,
  minute = 0,
  over: Partial<PlanRecommendation> = {},
): PlanRecommendation {
  return {
    id: `r${i}`,
    taskId: `t${i}`,
    slotStart: new Date(2026, 8, 7, hour, minute),
    status: 'shown',
    ...over,
  };
}
function tasks(
  recs: PlanRecommendation[],
  category: PlanTask['category'] = 'deep',
): Map<string, PlanTask> {
  return new Map(recs.map((r) => [r.taskId, { id: r.taskId, category, deletedAt: null }]));
}
const base = {
  now: NOW,
  settings: DEFAULT_NOTIFICATION_SETTINGS,
  permissionGranted: true,
  deliveredByDay: new Map<string, number>(),
};

describe('planNotifications — FR-50 hard cap', () => {
  it('a storm of 20 placements yields the cap, earliest first, ritual reserving one slot', () => {
    const recs = Array.from({ length: 20 }, (_, i) => rec(i, 10 + Math.floor(i / 2), (i % 2) * 30));
    const r = planNotifications({ ...base, recommendations: recs, tasks: tasks(recs) });
    expect(r.reason).toBe('ok');
    // tomorrow's ritual is pre-scheduled into TOMORROW's budget; today holds exactly the cap
    expect(r.schedule.filter((s) => s.day !== DAY).map((s) => s.id)).toEqual(['ritual:2026-09-08']);
    expect(r.schedule.filter((s) => s.day === DAY)).toHaveLength(NOTIFICATION_DAILY_CAP);
    expect(r.schedule.filter((s) => s.kind === 'evening_ritual' && s.day === DAY)).toHaveLength(1);
    const blocks = r.schedule.filter((s) => s.kind === 'block_reminder');
    expect(blocks.map((s) => s.id)).toEqual(['block:r0', 'block:r1', 'block:r2', 'block:r3']);
    // reminder = slot start − 10 min
    expect(blocks[0]!.fireAt).toBe(new Date(2026, 8, 7, 9, 50).getTime());
    expect(r.dropped.capped).toBe(16);
    // sorted by fire time within the day: today's ritual (20:00) closes the day
    const todays = r.schedule.filter((s) => s.day === DAY);
    expect(todays[todays.length - 1]!.id).toBe(`ritual:${DAY}`);
  });

  it('what was already delivered today shrinks the budget; at the cap nothing more is asked for', () => {
    const recs = Array.from({ length: 6 }, (_, i) => rec(i, 10 + i));
    const three = planNotifications({
      ...base,
      recommendations: recs,
      tasks: tasks(recs),
      deliveredByDay: new Map([[DAY, 3]]),
      ritualDaysAhead: 0,
    });
    expect(three.schedule).toHaveLength(2); // ritual + 1 block
    expect(three.schedule.map((s) => s.kind)).toEqual(['block_reminder', 'evening_ritual']);
    const full = planNotifications({
      ...base,
      recommendations: recs,
      tasks: tasks(recs),
      deliveredByDay: new Map([[DAY, NOTIFICATION_DAILY_CAP]]),
      ritualDaysAhead: 0,
    });
    expect(full.schedule).toEqual([]);
    expect(full.dropped.capped).toBe(7); // 6 blocks + the ritual
  });

  it('without the ritual all slots go to blocks; a ritual already past is not a candidate', () => {
    const recs = Array.from({ length: 6 }, (_, i) => rec(i, 10 + i));
    const off = planNotifications({
      ...base,
      recommendations: recs,
      tasks: tasks(recs),
      settings: { ...DEFAULT_NOTIFICATION_SETTINGS, evening_ritual: false },
      ritualDaysAhead: 0,
    });
    expect(off.schedule).toHaveLength(NOTIFICATION_DAILY_CAP);
    expect(off.schedule.every((s) => s.kind === 'block_reminder')).toBe(true);
    const late = planNotifications({
      ...base,
      now: new Date(2026, 8, 7, 21, 0),
      recommendations: [rec(0, 22)],
      tasks: tasks([rec(0, 22)]),
      ritualDaysAhead: 0,
    });
    expect(late.schedule.map((s) => s.id)).toEqual(['block:r0']);
  });

  it('muted categories, closed placements, missing/deleted tasks and past reminders yield nothing', () => {
    const recs = [
      rec(0, 10),
      rec(1, 11, 0, { status: 'completed' }),
      rec(2, 12),
      rec(3, 13),
      rec(4, 9, 5), // 09:05 − 10 min = 08:55 < now
      rec(5, 9, 10, {}), // 09:00 exactly: below MIN_LEAD_MS
    ];
    const t = tasks(recs);
    t.set('t0', { id: 't0', category: 'admin', deletedAt: null });
    t.delete('t2');
    t.set('t3', { id: 't3', category: 'deep', deletedAt: new Date() });
    const r = planNotifications({
      ...base,
      recommendations: recs,
      tasks: t,
      settings: {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        muted_categories: ['admin'],
        evening_ritual: false,
      },
    });
    expect(r.schedule).toEqual([]);
    expect(r.dropped).toEqual({ capped: 0, muted: 1, past: 2, closed: 3 });
    expect(MIN_LEAD_MS).toBe(30_000);
  });

  it('reminders off → only the ritual; permission missing → nothing at all', () => {
    const recs = [rec(0, 10)];
    const off = planNotifications({
      ...base,
      recommendations: recs,
      tasks: tasks(recs),
      settings: { ...DEFAULT_NOTIFICATION_SETTINGS, block_reminders: false },
      ritualDaysAhead: 0,
    });
    expect(off.schedule.map((s) => s.kind)).toEqual(['evening_ritual']);
    const denied = planNotifications({
      ...base,
      recommendations: recs,
      tasks: tasks(recs),
      permissionGranted: false,
    });
    expect(denied).toEqual({
      schedule: [],
      dropped: { capped: 0, muted: 0, past: 0, closed: 0 },
      reason: 'no_permission',
    });
  });

  it('tomorrow has its own budget (an evening plan for tomorrow is reminded tomorrow)', () => {
    const today = Array.from({ length: 6 }, (_, i) => rec(i, 10 + i));
    const tomorrow = Array.from({ length: 6 }, (_, i) => ({
      ...rec(10 + i, 10 + i),
      slotStart: new Date(2026, 8, 8, 10 + i, 0),
    }));
    const all = [...today, ...tomorrow];
    const r = planNotifications({
      ...base,
      recommendations: all,
      tasks: tasks(all),
      deliveredByDay: new Map([[DAY, 4]]),
      ritualDaysAhead: 1,
    });
    const byDay = (d: string) => r.schedule.filter((s) => s.day === d);
    expect(byDay(DAY).map((s) => s.kind)).toEqual(['evening_ritual']); // 1 slot left → the ritual
    expect(byDay('2026-09-08')).toHaveLength(NOTIFICATION_DAILY_CAP);
    expect(byDay('2026-09-08').filter((s) => s.kind === 'block_reminder')).toHaveLength(4);
    expect(r.schedule.every((s, i, a) => i === 0 || a[i - 1]!.day <= s.day)).toBe(true);
  });

  it('Sunday rituals carry the weekly-review variant (UC-08)', () => {
    const sunday = new Date(2026, 8, 6, 9, 0);
    const r = planNotifications({
      ...base,
      now: sunday,
      recommendations: [],
      tasks: new Map(),
      ritualDaysAhead: 1,
    });
    expect(r.schedule.map((s) => [s.id, s.variant])).toEqual([
      ['ritual:2026-09-06', 'sunday'],
      ['ritual:2026-09-07', 'daily'],
    ]);
  });

  it('is deterministic: the same input yields the same schedule', () => {
    const recs = Array.from({ length: 8 }, (_, i) => rec(7 - i, 10 + i));
    const a = planNotifications({ ...base, recommendations: recs, tasks: tasks(recs) });
    const b = planNotifications({
      ...base,
      recommendations: [...recs].reverse(),
      tasks: tasks(recs),
    });
    expect(a).toEqual(b);
  });
});

describe('ADR-0019 — no daily ritual when the day it would plan has no working window', () => {
  const recs = [rec(1, 14)];
  it('Monday-only hours: neither tonight (plans Tuesday) nor tomorrow night is offered; blocks stay', () => {
    const r = planNotifications({
      ...base,
      recommendations: recs,
      tasks: tasks(recs),
      workingHours: { mon: [540, 1080] },
      sleepWindow: [1380, 420],
    });
    expect(r.schedule.map((s) => s.id)).toEqual(['block:r1']);
  });
  it('with a window on the next plan day the ritual is scheduled as before', () => {
    const r = planNotifications({
      ...base,
      recommendations: recs,
      tasks: tasks(recs),
      workingHours: { mon: [540, 1080], tue: [540, 1080], wed: [540, 1080] },
      sleepWindow: [1380, 420],
    });
    expect(r.schedule.map((s) => s.id)).toEqual(['block:r1', `ritual:${DAY}`, 'ritual:2026-09-08']);
  });
  it('the Sunday variant (weekly review) is kept even when Monday has no hours', () => {
    const sunday = new Date(2026, 8, 6, 9, 0);
    const r = planNotifications({
      ...base,
      now: sunday,
      recommendations: [],
      tasks: new Map(),
      workingHours: { sat: [540, 1080] },
      sleepWindow: null,
    });
    expect(r.schedule.map((s) => [s.id, s.variant])).toEqual([['ritual:2026-09-06', 'sunday']]);
  });
  it('without the profile inputs every day is offered (the pre-ADR behaviour, pinned for callers that have no profile)', () => {
    const r = planNotifications({ ...base, recommendations: [], tasks: new Map() });
    expect(r.schedule.map((s) => s.id)).toEqual([`ritual:${DAY}`, 'ritual:2026-09-08']);
  });
});
