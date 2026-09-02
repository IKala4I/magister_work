/**
 * The FR-50 scheduler (ADR-0014 §1–§3): on open, on foreground and after any change to plans,
 * placements, tasks or the profile, settle the ledger, cancel what the OS still holds, recompute
 * the plan (pure, plan.ts) from the device database and hand the OS the new requests. Runs only
 * in the foreground — invariant 7: a missed run costs a reminder, never correctness. Imports the
 * device database and the native module, so screens/tests mock this module.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { currentUserId } from '../auth/identity';
import { db } from '../db/client';
import { upcomingRecommendationsQuery } from '../db/plans';
import { getProfile } from '../db/profile';
import { activeTasksQuery, inboxTasksQuery } from '../db/tasks';
import type { LocalDb } from '../db/writes';
import { notificationSettingsOf } from '../domain/notificationSettings';
import { t } from '../i18n';
import { track } from '../observability/analytics';

import { dismissStaleReminders } from './dismiss';
import { commitScheduled, settleLedger } from './ledger';
import { type NotificationSpec, OPEN_STATUSES, planNotifications } from './plan';
import {
  CATEGORY_BLOCK,
  CATEGORY_RITUAL,
  CHANNEL_REMINDERS,
  CHANNEL_RITUAL,
  getPermissionState,
} from './setup';

const localDb = db as unknown as LocalDb;
/** Placements this far ahead are read (today + tomorrow's evening plan). */
export const HORIZON_MS = 48 * 3_600_000;

/** What the notification carries back on a tap (the response fact, ADR-0014 §4). Categorical. */
export interface NotificationData {
  kind: NotificationSpec['kind'];
  recommendation_id?: string;
  task_id?: string;
  scheduled_for: number;
  /** Block reminders: the block's slot start (epoch ms) — the stale-dismissal key (dismiss.ts). */
  slot_start?: number;
  variant?: NotificationSpec['variant'];
  [key: string]: unknown;
}

function timeLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function contentOf(
  spec: NotificationSpec,
  titles: ReadonlyMap<string, string>,
  inboxCount: number,
): Notifications.NotificationContentInput {
  const data: NotificationData = {
    kind: spec.kind,
    recommendation_id: spec.recommendationId,
    task_id: spec.taskId,
    scheduled_for: spec.fireAt,
    slot_start: spec.slotStart,
    variant: spec.variant,
  };
  if (spec.kind === 'block_reminder') {
    return {
      // the task title is the user's own text on the user's own device (NFR-S3 is the ML boundary)
      title: titles.get(spec.taskId ?? '') ?? t('notify.block.fallbackTitle'),
      body: t('notify.block.body', { time: timeLabel(spec.slotStart ?? spec.fireAt) }),
      categoryIdentifier: CATEGORY_BLOCK,
      data,
    };
  }
  const sunday = spec.variant === 'sunday';
  return {
    title: sunday ? t('notify.ritual.sunday.title') : t('notify.ritual.title'),
    body: sunday
      ? t('notify.ritual.sunday.body')
      : inboxCount === 0
        ? t('notify.ritual.body.empty')
        : inboxCount === 1
          ? t('notify.ritual.body.one')
          : t('notify.ritual.body', { count: inboxCount }),
    categoryIdentifier: CATEGORY_RITUAL,
    data,
  };
}

let inFlight: Promise<void> | null = null;
let rerun = false;

/** One settle → cancel → plan → schedule pass; concurrent calls coalesce into one follow-up. */
export function runNotificationScheduler(now: Date = new Date()): Promise<void> {
  if (inFlight !== null) {
    rerun = true;
    return inFlight;
  }
  inFlight = pass(now).finally(() => {
    inFlight = null;
    if (rerun) {
      rerun = false;
      void runNotificationScheduler();
    }
  });
  return inFlight;
}

async function pass(now: Date): Promise<void> {
  const permission = await getPermissionState();
  // cancel FIRST, then settle: a request firing between settle and cancel would be delivered
  // but uncounted (P10 adversarial #4); after the cancel nothing can fire in the gap
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // no native module — nothing was scheduled either
  }
  const settled = settleLedger(now);
  const userId = currentUserId();
  const profile = getProfile(localDb, userId);
  if (profile === undefined) {
    // no profile (erased account, pre-onboarding identity): nothing to remind, no ritual from
    // defaults (P10 adversarial #5)
    commitScheduled([]);
    return;
  }
  const settings = notificationSettingsOf(profile.settings ?? null);
  const recs = upcomingRecommendationsQuery(
    localDb,
    userId,
    now,
    new Date(now.getTime() + HORIZON_MS),
  ).all();
  // stale block reminders leave the shade (FR-50; hardware pass: "Starts at 12:45 PM" still
  // posted at 14:28) — decided against the open placements just read, never against the ledger
  await dismissStaleReminders({
    now,
    openSlotStarts: new Map(
      recs.filter((r) => OPEN_STATUSES.has(r.status)).map((r) => [r.id, r.slotStart.getTime()]),
    ),
  });
  const taskRows = activeTasksQuery(localDb, userId).all();
  const tasks = new Map(
    taskRows.map((r) => [r.id, { id: r.id, category: r.category, deletedAt: r.deletedAt }]),
  );
  const titles = new Map(taskRows.map((r) => [r.id, r.title]));
  const inboxCount = inboxTasksQuery(localDb)
    .all()
    .filter((r) => r.userId === userId).length;
  const plan = planNotifications({
    now,
    recommendations: recs.map((r) => ({
      id: r.id,
      taskId: r.taskId,
      slotStart: r.slotStart,
      status: r.status,
    })),
    tasks,
    settings,
    permissionGranted: permission === 'granted',
    deliveredByDay: settled.deliveredByDay,
  });
  const scheduled: NotificationSpec[] = [];
  for (const spec of plan.schedule) {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: spec.id,
        content: contentOf(spec, titles, inboxCount),
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: spec.fireAt,
          ...(Platform.OS === 'android'
            ? { channelId: spec.kind === 'block_reminder' ? CHANNEL_REMINDERS : CHANNEL_RITUAL }
            : {}),
        },
      });
      scheduled.push(spec);
    } catch (err) {
      console.warn('notifications: schedule failed', spec.id, err); // one failure never blocks the rest
    }
  }
  commitScheduled(scheduled);
  track('notifications_planned', {
    scheduled: scheduled.length,
    capped: plan.dropped.capped,
    muted: plan.dropped.muted,
    past: plan.dropped.past,
    reason: plan.reason,
  });
}

export { clearAllNotifications } from './setup';
