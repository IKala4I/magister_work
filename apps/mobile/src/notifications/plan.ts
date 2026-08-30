/**
 * FR-50 reminder planning, pure (ADR-0014 §1–§2). Given the open placements ahead, their tasks,
 * the user's preferences, the delivered ledger and `now`, decide exactly which local
 * notifications to ask the OS for. The daily cap (NOTIFICATION_DAILY_CAP, spec-fixed) is a
 * ceiling per local day over EVERYTHING Hourwell sends: block reminders and the evening ritual.
 * Deterministic: earliest fire time first; the ritual, when enabled and still ahead, reserves one
 * slot of its day. Nothing here touches the OS — the scheduler does (scheduler.ts).
 */
import { NOTIFICATION_DAILY_CAP } from '@hourwell/shared';

import type { NotificationSettings } from '../domain/notificationSettings';
import { timeOnDay } from '../domain/notificationSettings';
import { localDayOf } from '../domain/localDay';
import type { TaskCategory } from '../db/tasks';

export type NotificationKind = 'block_reminder' | 'evening_ritual';
export type RitualVariant = 'daily' | 'sunday';

export interface NotificationSpec {
  /** Stable OS identifier: `block:<recommendation_id>` or `ritual:<day>`. */
  id: string;
  kind: NotificationKind;
  /** Epoch ms of the trigger. */
  fireAt: number;
  /** Local day the notification belongs to (its cap bucket). */
  day: string;
  recommendationId?: string;
  taskId?: string;
  category?: TaskCategory;
  /** Slot start (block reminders) — for the copy and the response fact. */
  slotStart?: number;
  variant?: RitualVariant;
}

export interface PlanRecommendation {
  id: string;
  taskId: string;
  slotStart: Date;
  status: string;
}

export interface PlanTask {
  id: string;
  category: TaskCategory;
  deletedAt: Date | null;
}

export interface PlanInput {
  now: Date;
  recommendations: readonly PlanRecommendation[];
  tasks: ReadonlyMap<string, PlanTask>;
  settings: NotificationSettings;
  permissionGranted: boolean;
  /** Notifications already delivered (or counted as delivered) per local day. */
  deliveredByDay: ReadonlyMap<string, number>;
  /** How many days ahead rituals are pre-scheduled (today + N). */
  ritualDaysAhead?: number;
  cap?: number;
}

export interface PlanResult {
  schedule: NotificationSpec[];
  dropped: {
    /** Candidates beyond the day's remaining budget. */
    capped: number;
    muted: number;
    /** Reminder time already passed (or too close to now). */
    past: number;
    /** Placement no longer open, or its task gone. */
    closed: number;
  };
  reason: 'ok' | 'no_permission';
}

/** Placements still ahead of the user (File 05 §2 open set). */
export const OPEN_STATUSES: ReadonlySet<string> = new Set(['shown', 'accepted', 'pinned', 'moved']);
/** A trigger closer than this to `now` is not worth asking the OS for. */
export const MIN_LEAD_MS = 30_000;
export const DEFAULT_RITUAL_DAYS_AHEAD = 1;

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return localDayOf(new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + n));
}

export function ritualVariantOf(fireAt: Date): RitualVariant {
  return fireAt.getDay() === 0 ? 'sunday' : 'daily';
}

export function planNotifications(input: PlanInput): PlanResult {
  const cap = input.cap ?? NOTIFICATION_DAILY_CAP;
  const dropped = { capped: 0, muted: 0, past: 0, closed: 0 };
  if (!input.permissionGranted) return { schedule: [], dropped, reason: 'no_permission' };
  const nowMs = input.now.getTime();
  const today = localDayOf(input.now);
  const leadMs = input.settings.lead_minutes * 60_000;

  // candidates per local day
  const blocks = new Map<string, NotificationSpec[]>();
  if (input.settings.block_reminders) {
    for (const rec of input.recommendations) {
      if (!OPEN_STATUSES.has(rec.status)) {
        dropped.closed += 1;
        continue;
      }
      const task = input.tasks.get(rec.taskId);
      if (task === undefined || task.deletedAt !== null) {
        dropped.closed += 1;
        continue;
      }
      const fireAt = rec.slotStart.getTime() - leadMs;
      if (fireAt < nowMs + MIN_LEAD_MS) {
        dropped.past += 1;
        continue;
      }
      if (input.settings.muted_categories.includes(task.category)) {
        dropped.muted += 1;
        continue;
      }
      const day = localDayOf(new Date(fireAt));
      const list = blocks.get(day) ?? [];
      list.push({
        id: `block:${rec.id}`,
        kind: 'block_reminder',
        fireAt,
        day,
        recommendationId: rec.id,
        taskId: task.id,
        category: task.category,
        slotStart: rec.slotStart.getTime(),
      });
      blocks.set(day, list);
    }
  }
  const rituals = new Map<string, NotificationSpec>();
  if (input.settings.evening_ritual) {
    const ahead = input.ritualDaysAhead ?? DEFAULT_RITUAL_DAYS_AHEAD;
    for (let i = 0; i <= ahead; i += 1) {
      const day = addDays(today, i);
      const at = timeOnDay(day, input.settings.evening_ritual_time);
      if (at.getTime() < nowMs + MIN_LEAD_MS) continue;
      rituals.set(day, {
        id: `ritual:${day}`,
        kind: 'evening_ritual',
        fireAt: at.getTime(),
        day,
        variant: ritualVariantOf(at),
      });
    }
  }

  const days = Array.from(new Set([...blocks.keys(), ...rituals.keys()])).sort();
  const schedule: NotificationSpec[] = [];
  for (const day of days) {
    let budget = Math.max(0, cap - (input.deliveredByDay.get(day) ?? 0));
    const ritual = rituals.get(day);
    const dayBlocks = (blocks.get(day) ?? []).sort(
      (a, b) => a.fireAt - b.fireAt || a.id.localeCompare(b.id),
    );
    const chosen: NotificationSpec[] = [];
    if (ritual !== undefined) {
      if (budget > 0) {
        chosen.push(ritual);
        budget -= 1;
      } else {
        dropped.capped += 1;
      }
    }
    chosen.push(...dayBlocks.slice(0, budget));
    dropped.capped += Math.max(0, dayBlocks.length - budget);
    schedule.push(...chosen.sort((a, b) => a.fireAt - b.fireAt || a.id.localeCompare(b.id)));
  }
  return { schedule, dropped, reason: 'ok' };
}
