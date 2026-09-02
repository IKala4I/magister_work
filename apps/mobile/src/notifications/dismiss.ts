/**
 * FR-50: stale block reminders leave the shade. A reminder is for a placement still ahead of
 * the user (ADR-0014 §1); delivered ones were never dismissed, so on the Pixel 7a the shade
 * kept "email replies · Starts at 12:45 PM" at 14:28 plus two more after their blocks had
 * started or lapsed (owner observation, hardware pass day 2). The scheduler calls this on
 * every run — mount, foreground, after every plan apply / re-plan — with the open placements
 * it just read (open status AND a live task, the planner's own notion of "open"): every
 * presented `block_reminder` whose slot start is ≤ now, whose recommendation is no longer an
 * open placement of the current plan, or whose payload names a different start than the plan
 * (the block was moved), is dismissed. Rituals are left alone. The delivered ledger and the
 * daily cap are not consulted and not freed: a dismissed reminder was still delivered and
 * still counts (ADR-0014 §2).
 */
import * as Notifications from 'expo-notifications';

import type { NotificationData } from './scheduler';

export interface PresentedNotification {
  identifier: string;
  /** The request's `content.data` as the OS hands it back — untrusted shape. */
  data: unknown;
}

/**
 * Pure: which presented notifications to dismiss. `openSlotStarts` maps every recommendation
 * id that is still an open placement (now ≤ slot start < horizon) to its slot start (epoch ms).
 * A payload without `slot_start` (a build before this fix) falls back to the plan's value.
 */
export function staleReminderIds(
  presented: readonly PresentedNotification[],
  openSlotStarts: ReadonlyMap<string, number>,
  now: Date,
): string[] {
  const nowMs = now.getTime();
  const stale: string[] = [];
  for (const notification of presented) {
    const data = notification.data as Partial<NotificationData> | null | undefined;
    if (data === null || data === undefined || typeof data !== 'object') continue;
    if (data.kind !== 'block_reminder') continue;
    const recommendationId =
      typeof data.recommendation_id === 'string' ? data.recommendation_id : null;
    const planned = recommendationId === null ? undefined : openSlotStarts.get(recommendationId);
    if (planned === undefined) {
      // done / skipped / lapsed / expired by a re-plan, or already behind `now`
      stale.push(notification.identifier);
      continue;
    }
    const payloadStart = typeof data.slot_start === 'number' ? data.slot_start : null;
    if (payloadStart !== null && payloadStart !== planned) {
      // a moved block (UC-07) keeps its recommendation id and rewrites the slot start in place:
      // a reminder naming another start than the plan's shows the wrong time — stale; the
      // scheduler re-schedules the new time in the same pass
      stale.push(notification.identifier);
      continue;
    }
    if ((payloadStart ?? planned) <= nowMs) stale.push(notification.identifier);
  }
  return stale;
}

/** Reads the shade and dismisses the stale reminders; returns what was dismissed. Never throws. */
export async function dismissStaleReminders(input: {
  now: Date;
  openSlotStarts: ReadonlyMap<string, number>;
}): Promise<string[]> {
  let presented: Notifications.Notification[];
  try {
    presented = await Notifications.getPresentedNotificationsAsync();
  } catch {
    return []; // no native module (web / tests) — nothing is presented either
  }
  const stale = staleReminderIds(
    presented.map((n) => ({ identifier: n.request.identifier, data: n.request.content.data })),
    input.openSlotStarts,
    input.now,
  );
  const dismissed: string[] = [];
  for (const id of stale) {
    try {
      await Notifications.dismissNotificationAsync(id);
      dismissed.push(id);
    } catch (err) {
      console.warn('notifications: dismiss failed', id, err); // one failure never blocks the rest
    }
  }
  return dismissed;
}
