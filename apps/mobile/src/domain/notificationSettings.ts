/**
 * FR-50 / FR-26 notification preferences (ADR-0014 §5) — the typed view of
 * `profiles.settings.notifications` (specs/07 §4.1 "notification prefs incl. per-category
 * mute"). Pure: parsing is total (anything malformed falls back to the default for that field),
 * so a settings blob written by an older or newer build never breaks the scheduler.
 */
import { NOTIFICATION_LEAD_MINUTES } from '@hourwell/shared';

import { TASK_CATEGORIES } from '../db/schema';
import type { TaskCategory } from '../db/tasks';

export interface NotificationSettings {
  /** Block-start reminders (FR-50). Effective only once the OS permission is granted. */
  block_reminders: boolean;
  /** Minutes before the slot start (Appendix A "notification lead", v1 static). */
  lead_minutes: number;
  /** Categories whose block reminders are silenced (FR-50 "per-category mute"). */
  muted_categories: TaskCategory[];
  /** The "plan tomorrow" evening ritual (FR-26). */
  evening_ritual: boolean;
  /** Local wall-clock time of the ritual, `HH:MM`. */
  evening_ritual_time: string;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  block_reminders: true,
  lead_minutes: NOTIFICATION_LEAD_MINUTES,
  muted_categories: [],
  evening_ritual: true,
  evening_ritual_time: '20:00',
};

/** Ritual times offered in Settings (the stored value may be any valid HH:MM). */
export const RITUAL_TIME_PRESETS = ['19:00', '20:00', '21:00', '22:00'] as const;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value);
}

function isCategory(value: unknown): value is TaskCategory {
  return typeof value === 'string' && (TASK_CATEGORIES as readonly string[]).includes(value);
}

/** Parse the `settings` JSON of a profile row (null/garbage → defaults). */
export function notificationSettingsOf(settings: unknown): NotificationSettings {
  const root =
    settings !== null && typeof settings === 'object' ? (settings as Record<string, unknown>) : {};
  const n =
    root.notifications !== null && typeof root.notifications === 'object'
      ? (root.notifications as Record<string, unknown>)
      : {};
  const d = DEFAULT_NOTIFICATION_SETTINGS;
  const muted = Array.isArray(n.muted_categories)
    ? Array.from(new Set(n.muted_categories.filter(isCategory)))
    : d.muted_categories;
  return {
    block_reminders: typeof n.block_reminders === 'boolean' ? n.block_reminders : d.block_reminders,
    // the lead is spec-owned (Appendix A): a stored value never overrides the constant in v1
    lead_minutes: d.lead_minutes,
    muted_categories: muted,
    evening_ritual: typeof n.evening_ritual === 'boolean' ? n.evening_ritual : d.evening_ritual,
    evening_ritual_time: isValidTime(n.evening_ritual_time)
      ? n.evening_ritual_time
      : d.evening_ritual_time,
  };
}

/** Merge a patch into the settings blob, keeping unrelated keys of `settings` intact. */
export function withNotificationSettings(
  settings: unknown,
  patch: Partial<NotificationSettings>,
): Record<string, unknown> {
  const root =
    settings !== null && typeof settings === 'object' ? (settings as Record<string, unknown>) : {};
  const next: NotificationSettings = { ...notificationSettingsOf(settings), ...patch };
  if (!isValidTime(next.evening_ritual_time)) {
    next.evening_ritual_time = DEFAULT_NOTIFICATION_SETTINGS.evening_ritual_time;
  }
  next.muted_categories = Array.from(new Set(next.muted_categories.filter(isCategory)));
  return { ...root, notifications: { ...next } };
}

/** The instant of `HH:MM` on a local calendar day (`YYYY-MM-DD`), device zone. */
export function timeOnDay(day: string, time: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0);
}
