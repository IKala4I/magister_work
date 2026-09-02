/**
 * FR-50 stale-reminder dismissal (hardware pass, owner observation 14:18/14:28): the pure
 * decision over what the shade shows, and the OS wrapper against the shared expo-notifications
 * mock (src/test/setup.ts) — never throws, dismisses one by one, touches no ledger.
 */
import * as Notifications from 'expo-notifications';

import { appStorage, StorageKeys } from '../../storage/mmkv';
import { dismissStaleReminders, type PresentedNotification, staleReminderIds } from '../dismiss';

const NOW = new Date(2026, 8, 2, 14, 28); // the owner's screenshot moment
const at = (h: number, m = 0) => new Date(2026, 8, 2, h, m).getTime();

function reminder(
  recId: string,
  over: Record<string, unknown> = {},
  identifier = `block:${recId}`,
): PresentedNotification {
  return {
    identifier,
    data: { kind: 'block_reminder', recommendation_id: recId, scheduled_for: at(12, 35), ...over },
  };
}

describe('staleReminderIds (pure)', () => {
  const open = new Map<string, number>([
    ['r-1245', at(12, 45)],
    ['r-1500', at(15, 0)],
    ['r-1600', at(16, 0)],
  ]);

  it('a reminder whose block started (slot_start ≤ now) is stale; one still ahead is not', () => {
    expect(
      staleReminderIds(
        [
          reminder('r-1245', { slot_start: at(12, 45) }),
          reminder('r-1500', { slot_start: at(15) }),
        ],
        open,
        NOW,
      ),
    ).toEqual(['block:r-1245']);
  });

  it('slot_start exactly at now counts as started', () => {
    expect(staleReminderIds([reminder('r-x', { slot_start: NOW.getTime() })], open, NOW)).toEqual([
      'block:r-x',
    ]);
  });

  it('a reminder whose recommendation is no longer an open placement is stale even if its time is ahead', () => {
    expect(staleReminderIds([reminder('r-gone', { slot_start: at(17) })], open, NOW)).toEqual([
      'block:r-gone',
    ]);
  });

  it('a payload without slot_start (older build) falls back to the plan: past → stale, ahead → kept', () => {
    const closed = new Map(open);
    closed.set('r-past', at(13));
    expect(staleReminderIds([reminder('r-past'), reminder('r-1600')], closed, NOW)).toEqual([
      'block:r-past',
    ]);
  });

  it('rituals, foreign notifications and malformed payloads are never dismissed', () => {
    expect(
      staleReminderIds(
        [
          {
            identifier: 'ritual:2026-09-02',
            data: { kind: 'evening_ritual', scheduled_for: at(20) },
          },
          { identifier: 'other-app', data: { foo: 'bar' } },
          { identifier: 'null-data', data: null },
          { identifier: 'string-data', data: 'x' },
          { identifier: 'no-id', data: { kind: 'block_reminder', scheduled_for: 1 } },
        ],
        open,
        NOW,
      ),
    ).toEqual(['no-id']); // a block reminder without a recommendation belongs to no plan
  });

  it('is deterministic and keeps the presented order', () => {
    const list = [
      reminder('r-1245', { slot_start: at(12, 45) }),
      reminder('r-gone', { slot_start: at(17) }),
      reminder('r-1500', { slot_start: at(15) }),
    ];
    expect(staleReminderIds(list, open, NOW)).toEqual(['block:r-1245', 'block:r-gone']);
    expect(staleReminderIds(list, open, NOW)).toEqual(staleReminderIds(list, open, NOW));
  });
});

describe('dismissStaleReminders (OS wrapper)', () => {
  const getPresented = Notifications.getPresentedNotificationsAsync as jest.Mock;
  const dismiss = Notifications.dismissNotificationAsync as jest.Mock;
  const presented = (n: PresentedNotification) => ({
    date: at(12, 35),
    request: { identifier: n.identifier, content: { data: n.data }, trigger: null },
  });

  beforeEach(() => {
    getPresented.mockReset();
    dismiss.mockReset();
    dismiss.mockResolvedValue(undefined);
    appStorage.set(
      StorageKeys.notificationLedger,
      '{"delivered":{"2026-09-02":["block:r-1245"]},"scheduled":[]}',
    );
  });

  it('dismisses exactly the stale ids and leaves the ledger alone', async () => {
    getPresented.mockResolvedValue([
      presented(reminder('r-1245', { slot_start: at(12, 45) })),
      presented(reminder('r-1500', { slot_start: at(15) })),
    ]);
    const result = await dismissStaleReminders({
      now: NOW,
      openSlotStarts: new Map([
        ['r-1245', at(12, 45)],
        ['r-1500', at(15)],
      ]),
    });
    expect(result).toEqual(['block:r-1245']);
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledWith('block:r-1245');
    expect(appStorage.getString(StorageKeys.notificationLedger)).toBe(
      '{"delivered":{"2026-09-02":["block:r-1245"]},"scheduled":[]}',
    );
  });

  it('a shade read failure (no native module) dismisses nothing and never throws', async () => {
    getPresented.mockRejectedValue(new Error('UnavailabilityError'));
    await expect(dismissStaleReminders({ now: NOW, openSlotStarts: new Map() })).resolves.toEqual(
      [],
    );
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('one failed dismissal never blocks the rest', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    getPresented.mockResolvedValue([
      presented(reminder('r-a', { slot_start: at(10) })),
      presented(reminder('r-b', { slot_start: at(11) })),
    ]);
    dismiss.mockImplementation((id: string) =>
      id === 'block:r-a' ? Promise.reject(new Error('gone')) : Promise.resolve(),
    );
    const result = await dismissStaleReminders({ now: NOW, openSlotStarts: new Map() });
    expect(result).toEqual(['block:r-b']);
    expect(dismiss).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
