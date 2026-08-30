import { NOTIFICATION_DAILY_CAP } from '@hourwell/shared';

import { localDayOf } from '../../domain/localDay';
import { DEFAULT_NOTIFICATION_SETTINGS } from '../../domain/notificationSettings';
import { StorageKeys } from '../../storage/mmkv';
import {
  commitScheduled,
  type LedgerStore,
  readLedger,
  resetLedger,
  settleLedger,
} from '../ledger';
import { type NotificationSpec, planNotifications } from '../plan';

function memStore(): LedgerStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getString: (k) => map.get(k),
    set: (k, v) => void map.set(k, v),
    delete: (k) => void map.delete(k),
  };
}

const spec = (
  id: string,
  fireAt: Date,
  day: string,
  kind: NotificationSpec['kind'] = 'block_reminder',
): NotificationSpec => ({
  id,
  kind,
  fireAt: fireAt.getTime(),
  day,
});

describe('ledger — conservative delivered counting (ADR-0014 §2)', () => {
  it('empty / corrupt storage reads as empty', () => {
    const s = memStore();
    expect(readLedger(s)).toEqual({ delivered: {}, scheduled: [] });
    s.set(StorageKeys.notificationLedger, '{not json');
    expect(readLedger(s)).toEqual({ delivered: {}, scheduled: [] });
    s.set(StorageKeys.notificationLedger, JSON.stringify({ delivered: 'x' }));
    expect(readLedger(s)).toEqual({ delivered: {}, scheduled: [] });
  });

  it('settle: past requests become delivered (deduplicated), future ones stay pending', () => {
    const s = memStore();
    const day = '2026-09-07';
    commitScheduled(
      [
        spec('block:a', new Date(2026, 8, 7, 9, 50), day),
        spec('block:b', new Date(2026, 8, 7, 11, 50), day),
        spec('ritual:2026-09-07', new Date(2026, 8, 7, 20, 0), day, 'evening_ritual'),
      ],
      s,
    );
    const first = settleLedger(new Date(2026, 8, 7, 10, 0), s);
    expect(first.deliveredByDay.get(day)).toBe(1);
    expect(first.pending.map((p) => p.id)).toEqual(['block:b', 'ritual:2026-09-07']);
    // re-committing the same id later and settling again never double counts
    commitScheduled(
      [
        spec('block:a', new Date(2026, 8, 7, 9, 50), day),
        spec('block:b', new Date(2026, 8, 7, 11, 50), day),
      ],
      s,
    );
    const second = settleLedger(new Date(2026, 8, 7, 12, 0), s);
    expect(second.deliveredByDay.get(day)).toBe(2);
    expect(second.pending).toEqual([]);
  });

  it('day rollover: only today and yesterday are kept', () => {
    const s = memStore();
    commitScheduled(
      [
        spec('block:old', new Date(2026, 8, 5, 10, 0), '2026-09-05'),
        spec('block:y', new Date(2026, 8, 6, 10, 0), '2026-09-06'),
        spec('block:t', new Date(2026, 8, 7, 8, 0), '2026-09-07'),
      ],
      s,
    );
    const r = settleLedger(new Date(2026, 8, 7, 9, 0), s);
    expect([...r.deliveredByDay.entries()]).toEqual([
      ['2026-09-06', 1],
      ['2026-09-07', 1],
    ]);
  });

  it('reset forgets everything', () => {
    const s = memStore();
    commitScheduled([spec('block:a', new Date(2026, 8, 7, 9, 50), '2026-09-07')], s);
    resetLedger(s);
    expect(readLedger(s)).toEqual({ delivered: {}, scheduled: [] });
  });

  it('STORM: three re-plans, a settings change and a restart in one day never exceed the cap', () => {
    const s = memStore();
    const tasks = new Map(
      Array.from({ length: 20 }, (_, i) => [
        `t${i}`,
        { id: `t${i}`, category: 'deep' as const, deletedAt: null },
      ]),
    );
    const recsAt = (offsetMin: number) =>
      Array.from({ length: 20 }, (_, i) => ({
        id: `r${offsetMin}-${i}`,
        taskId: `t${i}`,
        slotStart: new Date(2026, 8, 7, 10, offsetMin + i * 15),
        status: 'shown',
      }));
    const run = (now: Date, offset: number, settings = DEFAULT_NOTIFICATION_SETTINGS) => {
      const settled = settleLedger(now, s);
      const plan = planNotifications({
        now,
        recommendations: recsAt(offset),
        tasks,
        settings,
        permissionGranted: true,
        deliveredByDay: settled.deliveredByDay,
        ritualDaysAhead: 0,
      });
      commitScheduled(plan.schedule, s);
      const delivered = settled.deliveredByDay.get(localDayOf(now)) ?? 0;
      return {
        delivered,
        scheduled: plan.schedule.length,
        total: delivered + plan.schedule.length,
      };
    };
    // 09:00 first plan → cap scheduled
    expect(run(new Date(2026, 8, 7, 9, 0), 0).total).toBe(NOTIFICATION_DAILY_CAP);
    // 10:20 re-plan: 09:50 and 10:05 fired, and the 10:20 one is counted too (fireAt ≤ now is
    // delivered — conservative) → 3 delivered + 2 scheduled
    const second = run(new Date(2026, 8, 7, 10, 20), 5);
    expect(second.delivered).toBe(3);
    expect(second.total).toBe(NOTIFICATION_DAILY_CAP);
    // 12:00 settings change (mute nothing, ritual off) after more fired → still ≤ cap
    const third = run(new Date(2026, 8, 7, 12, 0), 10, {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      evening_ritual: false,
    });
    expect(third.total).toBeLessThanOrEqual(NOTIFICATION_DAILY_CAP);
    // 18:00 "restart": a fresh settle on the same store keeps the delivered count
    const fourth = run(new Date(2026, 8, 7, 18, 0), 0);
    expect(fourth.delivered).toBe(NOTIFICATION_DAILY_CAP);
    expect(fourth.scheduled).toBe(0);
    // next morning: the budget is fresh
    const next = run(new Date(2026, 8, 8, 9, 0), 0);
    expect(next.delivered).toBe(0);
  });
});
