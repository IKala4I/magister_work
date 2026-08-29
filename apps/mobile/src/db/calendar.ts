/**
 * Calendar mirror reads (FR-03/UC-09): the busy intervals imported from the user's Google
 * Calendar, rendered as neutral rows on the Today timeline. Pull-only rows — no write helper
 * exists here by construction (the client never edits the external calendar's mirror).
 */
import { and, eq, gt, isNull, lt } from 'drizzle-orm';

import { calendarEvents } from './schema';
import type { LocalDb } from './writes';

export type CalendarEventRow = typeof calendarEvents.$inferSelect;

/** Live, busy events overlapping [from, to) in start order — fed to useLiveRows. */
export function busyEventsQuery(db: LocalDb, userId: string, from: Date, to: Date) {
  return db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.userId, userId),
        eq(calendarEvents.busy, true),
        isNull(calendarEvents.deletedAt),
        lt(calendarEvents.startAt, to),
        gt(calendarEvents.endAt, from),
      ),
    )
    .orderBy(calendarEvents.startAt);
}
