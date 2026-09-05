/**
 * The scheduler against real SQLite and a faked OS: today's plan → at most the cap handed to
 * the OS with stable ids and the user's copy; a re-run cancels and re-plans; permission
 * denied → nothing scheduled; sign-out clears everything.
 */
jest.mock('expo-crypto', () => {
  let n = 0;
  return {
    randomUUID: jest.fn(() => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`),
  };
});
const os = {
  scheduled: [] as Array<{
    identifier?: string;
    content: Record<string, unknown>;
    trigger: Record<string, unknown>;
  }>,
  cancelAll: 0,
  dismissAll: 0,
  permission: 'granted' as 'granted' | 'denied' | 'undetermined',
  /** What the shade currently shows (FR-50 stale-dismissal input). */
  presented: [] as Array<{
    date: number;
    request: { identifier: string; content: { data: Record<string, unknown> }; trigger: null };
  }>,
  dismissed: [] as string[],
};
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationCategoryAsync: jest.fn(() => Promise.resolve()),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve(null)),
  getPermissionsAsync: jest.fn(() =>
    Promise.resolve({
      granted: os.permission === 'granted',
      canAskAgain: os.permission !== 'denied',
      status: os.permission,
    }),
  ),
  scheduleNotificationAsync: jest.fn((req: (typeof os.scheduled)[number]) => {
    os.scheduled.push(req);
    return Promise.resolve(req.identifier ?? 'x');
  }),
  cancelAllScheduledNotificationsAsync: jest.fn(() => {
    os.cancelAll += 1;
    os.scheduled = [];
    return Promise.resolve();
  }),
  dismissAllNotificationsAsync: jest.fn(() => {
    os.dismissAll += 1;
    return Promise.resolve();
  }),
  getPresentedNotificationsAsync: jest.fn(() => Promise.resolve([...os.presented])),
  dismissNotificationAsync: jest.fn((id: string) => {
    os.dismissed.push(id);
    os.presented = os.presented.filter((n) => n.request.identifier !== id);
    return Promise.resolve();
  }),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { DEFAULT: 3 },
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
}));
const mockTrack = jest.fn();
jest.mock('../../observability/analytics', () => ({ track: (...a: unknown[]) => mockTrack(...a) }));
jest.mock('../../auth/identity', () => ({ currentUserId: () => 'local:test-user' }));

// the device database handle is replaced by an in-memory SQLite with the real migrations
// (built inside the factory: jest hoists mocks above the imports that need them)
jest.mock('../../db/client', () => {
  const path = jest.requireActual('node:path') as typeof import('node:path');
  const Database = jest.requireActual('better-sqlite3') as typeof import('better-sqlite3');
  const { drizzle } = jest.requireActual(
    'drizzle-orm/better-sqlite3',
  ) as typeof import('drizzle-orm/better-sqlite3');
  const { migrate } = jest.requireActual(
    'drizzle-orm/better-sqlite3/migrator',
  ) as typeof import('drizzle-orm/better-sqlite3/migrator');
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: path.join(__dirname, '..', '..', '..', 'drizzle') });
  return { db, sqlite };
});

import { NOTIFICATION_DAILY_CAP } from '@hourwell/shared';
import { eq } from 'drizzle-orm';

import { db as testDb, sqlite } from '../../db/client';
import { moveBlock } from '../../db/feedback';
import { plans, recommendations } from '../../db/schema';
import { saveProfile } from '../../db/profile';
import { createTask, softDeleteTask } from '../../db/tasks';
import type { LocalDb } from '../../db/writes';
import { StorageKeys, appStorage } from '../../storage/mmkv';
import { readLedger } from '../ledger';
import { clearAllNotifications, runNotificationScheduler } from '../scheduler';

const db = testDb as unknown as LocalDb;
const USER = 'local:test-user';
const NOW = new Date(2026, 8, 7, 9, 0); // Monday

function seed(
  nBlocks: number,
  day = new Date(2026, 8, 7),
  // ADR-0019: the daily ritual needs a window on the day it plans — Mon–Fri by default
  workingHours: Record<string, [number, number]> = {
    mon: [540, 1080],
    tue: [540, 1080],
    wed: [540, 1080],
    thu: [540, 1080],
    fri: [540, 1080],
  },
): void {
  saveProfile(db, {
    userId: USER,
    draft: {
      timezone: 'Europe/Kyiv',
      locale: 'en',
      workingHours,
      sleepWindow: [1380, 420],
      rmeqScore: null,
      chronotypeClass: 'INT',
      surveySkipped: true,
      topCategories: ['deep'],
      onboardingCompletedAt: NOW,
      settings: { notifications: { muted_categories: ['admin'] } },
    },
    now: NOW,
  });
  const planId = `plan-${day.getDate()}`;
  db.insert(plans)
    .values({
      id: planId,
      userId: USER,
      planDate: `2026-09-${String(day.getDate()).padStart(2, '0')}`,
      horizon: 'day',
      engine: 'learned',
      modelVersion: 'x',
      telemetry: {},
      generatedAt: NOW,
    })
    .run();
  for (let i = 0; i < nBlocks; i += 1) {
    const task = createTask(db, {
      userId: USER,
      draft: {
        title: `Task ${i}`,
        category: i === 1 ? 'admin' : 'deep',
        estMinutes: 60,
        value: 2,
        deadline: null,
        splittable: false,
        earliestStart: null,
      },
      meta: { source: 'form', nlParseUsed: false },
      now: NOW,
    });
    const start = new Date(day);
    start.setHours(10 + i, 0, 0, 0);
    const end = new Date(start);
    end.setHours(start.getHours() + 1);
    db.insert(recommendations)
      .values({
        id: `rec-${day.getDate()}-${i}`,
        userId: USER,
        planId,
        taskId: task.id,
        chunkIndex: 0,
        slotStart: start,
        slotEnd: end,
        contextBucket: 'MO.wd',
        status: 'shown',
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();
  }
}

beforeEach(() => {
  os.scheduled = [];
  os.cancelAll = 0;
  os.dismissAll = 0;
  os.presented = [];
  os.dismissed = [];
  os.permission = 'granted';
  mockTrack.mockClear();
  appStorage.delete(StorageKeys.notificationLedger);
  (sqlite as unknown as import('better-sqlite3').Database).exec(
    'delete from recommendations; delete from plans; delete from tasks; delete from profiles; delete from op_outbox; delete from events;',
  );
});

describe('runNotificationScheduler', () => {
  it('hands the OS at most the cap for today: 4 blocks (admin muted, earliest first) + the ritual', async () => {
    seed(8);
    await runNotificationScheduler(NOW);
    expect(os.cancelAll).toBe(1);
    const today = os.scheduled.filter(
      (r) =>
        String(r.identifier).endsWith('2026-09-07') || String(r.identifier).startsWith('block:'),
    );
    expect(today).toHaveLength(NOTIFICATION_DAILY_CAP);
    const ids = os.scheduled.map((r) => r.identifier);
    expect(ids).toContain('ritual:2026-09-07');
    expect(ids).toContain('ritual:2026-09-08'); // tomorrow's ritual pre-scheduled
    expect(ids.filter((i) => String(i).startsWith('block:'))).toEqual([
      'block:rec-7-0',
      'block:rec-7-2',
      'block:rec-7-3',
      'block:rec-7-4',
    ]);
    const first = os.scheduled.find((r) => r.identifier === 'block:rec-7-0')!;
    expect(first.content.title).toBe('Task 0');
    expect(first.content.categoryIdentifier).toBeUndefined(); // no actions → no category (FR-26, 2026-09-04)
    expect((first.content.data as { kind: string }).kind).toBe('block_reminder');
    expect(first.trigger).toEqual({ type: 'date', date: new Date(2026, 8, 7, 9, 50).getTime() });
    const ritual = os.scheduled.find((r) => r.identifier === 'ritual:2026-09-07')!;
    expect(ritual.content.categoryIdentifier).toBe('plan_tomorrow');
    expect(ritual.content.body).toBe('8 tasks are waiting — one tap plans your day.');
    expect(mockTrack).toHaveBeenCalledWith('notifications_planned', {
      scheduled: 6,
      capped: 3,
      muted: 1,
      past: 0,
      reason: 'ok',
      exact: 'not_applicable', // jest runs as iOS: no exact-alarm switch there
    });
    expect(readLedger().scheduled.map((s) => s.id)).toEqual(ids);
  });

  it('ADR-0019: hours on Monday only → the blocks are scheduled, no daily ritual is (Tuesday has no window)', async () => {
    seed(3, new Date(2026, 8, 7), { mon: [540, 1080] });
    await runNotificationScheduler(NOW);
    const ids = os.scheduled.map((r) => String(r.identifier));
    expect(ids.filter((i) => i.startsWith('block:'))).toHaveLength(2); // admin muted
    expect(ids.some((i) => i.startsWith('ritual:'))).toBe(false);
    expect(readLedger().scheduled.map((s) => s.id)).toEqual(ids);
  });
  it('a later run settles, cancels and re-plans under the remaining budget', async () => {
    seed(8);
    await runNotificationScheduler(NOW);
    // 11:30: 09:50, 11:50? no — 09:50 (block 0), 11:50 is ahead; blocks 2 (11:50) still ahead
    await runNotificationScheduler(new Date(2026, 8, 7, 11, 30));
    expect(os.cancelAll).toBe(2);
    const todays = os.scheduled.filter((r) => !String(r.identifier).endsWith('2026-09-08'));
    // delivered so far: block 0 (09:50) → 4 left: blocks 2,3,4 + ritual
    expect(todays.map((r) => r.identifier)).toEqual([
      'block:rec-7-2',
      'block:rec-7-3',
      'block:rec-7-4',
      'ritual:2026-09-07',
    ]);
    expect(readLedger().delivered['2026-09-07']).toEqual(['block:rec-7-0']);
  });

  it('permission denied → cancels what exists and schedules nothing (the ledger stays honest)', async () => {
    seed(3);
    os.permission = 'denied';
    await runNotificationScheduler(NOW);
    expect(os.cancelAll).toBe(1);
    expect(os.scheduled).toEqual([]);
    expect(mockTrack).toHaveBeenCalledWith(
      'notifications_planned',
      expect.objectContaining({ scheduled: 0, reason: 'no_permission' }),
    );
  });

  it('clearAllNotifications cancels, dismisses and forgets the ledger', async () => {
    seed(3);
    await runNotificationScheduler(NOW);
    await clearAllNotifications();
    expect(os.cancelAll).toBe(2);
    expect(os.dismissAll).toBe(1);
    expect(readLedger()).toEqual({ delivered: {}, scheduled: [] });
  });

  it('no profile row (erased account / pre-onboarding identity) → cancels and schedules nothing, not even the ritual', async () => {
    seed(2);
    (sqlite as unknown as import('better-sqlite3').Database).exec('delete from profiles;');
    await runNotificationScheduler(NOW);
    expect(os.cancelAll).toBe(1);
    expect(os.scheduled).toEqual([]);
    expect(readLedger().scheduled).toEqual([]);
  });

  it('a block reminder carries its slot start (the stale-dismissal key) in the payload', async () => {
    seed(2);
    await runNotificationScheduler(NOW);
    const first = os.scheduled.find((r) => r.identifier === 'block:rec-7-0')!;
    expect((first.content.data as { slot_start: number }).slot_start).toBe(
      new Date(2026, 8, 7, 10, 0).getTime(),
    );
  });

  it('dismisses presented reminders whose block started or is no longer open; the ledger and the cap are untouched (FR-50, hardware pass)', async () => {
    seed(5); // blocks 10:00 … 14:00 (task 1 admin → muted, no reminder of its own)
    await runNotificationScheduler(NOW); // 09:00: schedules block 0 (09:50) + the rest under the cap
    const at = (h: number, m = 0) => new Date(2026, 8, 7, h, m).getTime();
    const reminder = (recId: string, slotStart: number | null) => ({
      date: at(9, 50),
      request: {
        identifier: `block:${recId}`,
        content: {
          data: {
            kind: 'block_reminder',
            recommendation_id: recId,
            scheduled_for: at(9, 50),
            ...(slotStart === null ? {} : { slot_start: slotStart }),
          },
        },
        trigger: null,
      },
    });
    // rec-7-3 (13:00) was skipped before its start (status `rejected`): no longer open
    db.update(recommendations)
      .set({ status: 'rejected' })
      .where(eq(recommendations.id, 'rec-7-3'))
      .run();
    os.presented = [
      reminder('rec-7-0', at(10)), // started at 10:00 → stale
      reminder('rec-7-2', at(12)), // 12:00 is ahead and open → stays
      reminder('rec-7-3', null), // skipped, older payload without slot_start → stale
      reminder('rec-gone', at(15)), // re-planned away: not in the plan → stale
      {
        date: at(9),
        request: {
          identifier: 'ritual:2026-09-07',
          content: { data: { kind: 'evening_ritual', scheduled_for: at(20) } },
          trigger: null,
        },
      },
    ];
    await runNotificationScheduler(new Date(2026, 8, 7, 11, 30));
    expect(os.dismissed.sort()).toEqual(['block:rec-7-0', 'block:rec-7-3', 'block:rec-gone']);
    expect(os.presented.map((n) => n.request.identifier)).toEqual([
      'block:rec-7-2',
      'ritual:2026-09-07',
    ]);
    // the delivered ledger still counts block 0 (fired 09:50) — dismissing frees no budget
    expect(readLedger().delivered['2026-09-07']).toEqual(['block:rec-7-0']);
    expect(os.dismissAll).toBe(0);
    expect(os.scheduled.map((r) => r.identifier)).toContain('block:rec-7-2');
    expect(os.scheduled.map((r) => r.identifier)).not.toContain('block:rec-7-3');
  });

  it('a moved block (UC-07) loses the reminder that names its old time and gets one for the new time', async () => {
    // three blocks (10:00, 11:00 admin → muted, 12:00) so the day's budget still has room for
    // the moved block's new reminder — a dismissal frees NO budget (ADR-0014 §2), so on a full
    // day the cap can legitimately leave a moved block without one
    seed(3);
    await runNotificationScheduler(NOW);
    const at = (h: number, m = 0) => new Date(2026, 8, 7, h, m).getTime();
    // the 12:00 block's reminder fired at 11:50; at 11:52 the user moves the block to 15:00
    os.presented = [
      {
        date: at(11, 50),
        request: {
          identifier: 'block:rec-7-2',
          content: {
            data: {
              kind: 'block_reminder',
              recommendation_id: 'rec-7-2',
              scheduled_for: at(11, 50),
              slot_start: at(12),
            },
          },
          trigger: null,
        },
      },
    ];
    const moveAt = new Date(2026, 8, 7, 11, 52);
    moveBlock(db, {
      recommendationId: 'rec-7-2',
      toStart: new Date(2026, 8, 7, 15, 0),
      now: moveAt,
    });
    await runNotificationScheduler(moveAt);
    expect(os.dismissed).toEqual(['block:rec-7-2']);
    expect(os.presented).toEqual([]);
    const rescheduled = os.scheduled.find((r) => r.identifier === 'block:rec-7-2')!;
    expect(rescheduled.trigger).toEqual({ type: 'date', date: at(14, 50) });
    expect((rescheduled.content.data as { slot_start: number }).slot_start).toBe(at(15));
  });

  it("a soft-deleted task's presented reminder is dismissed (the planner's own task filter)", async () => {
    seed(5);
    await runNotificationScheduler(NOW);
    const at = (h: number, m = 0) => new Date(2026, 8, 7, h, m).getTime();
    const rec = db.select().from(recommendations).where(eq(recommendations.id, 'rec-7-2')).get()!;
    os.presented = [
      {
        date: at(11, 50),
        request: {
          identifier: 'block:rec-7-2',
          content: {
            data: {
              kind: 'block_reminder',
              recommendation_id: 'rec-7-2',
              scheduled_for: at(11, 50),
              slot_start: at(12),
            },
          },
          trigger: null,
        },
      },
    ];
    // deleted past the undo window: the placement still reads `shown`, its task is gone
    softDeleteTask(db, { id: rec.taskId, now: new Date(2026, 8, 7, 11, 51) });
    await runNotificationScheduler(new Date(2026, 8, 7, 11, 52));
    expect(os.dismissed).toEqual(['block:rec-7-2']);
    expect(os.scheduled.map((r) => r.identifier)).not.toContain('block:rec-7-2');
  });

  it('concurrent runs coalesce into one follow-up pass', async () => {
    seed(2);
    const a = runNotificationScheduler(NOW);
    const b = runNotificationScheduler(NOW);
    expect(b).toBe(a);
    await a;
    await new Promise((r) => setTimeout(r, 0));
    expect(os.cancelAll).toBeGreaterThanOrEqual(1);
  });
});
