/**
 * UC-03 plan triggers — Appendix A "06:00 local + first open", implemented LAZILY (invariant 7:
 * no correctness may depend on background execution): the app asks for today's plan when it is
 * foregrounded/opened on a local day that has no plan yet. The 06:00 anchor is the day boundary
 * for "today" (a 02:00 late-night open still belongs to yesterday's plan); the notification that
 * nudges at 06:00 is P10's job. Pure so the decision is unit-testable.
 */
import { PLAN_GENERATION_LOCAL_TIME } from '@hourwell/shared';

import { localDayOf } from './localDay';

const [PLAN_HOUR, PLAN_MINUTE] = PLAN_GENERATION_LOCAL_TIME.split(':').map(Number) as [
  number,
  number,
];

/** The plan day an instant belongs to: the local date, rolled back before 06:00. */
export function planDayOf(now: Date): string {
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < PLAN_HOUR * 60 + PLAN_MINUTE) {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    return localDayOf(yesterday);
  }
  return localDayOf(now);
}

/**
 * The date a REQUEST plans for: always the current calendar day — before 06:00 the previous
 * plan day is entirely in the past, so planning it would place nothing (and churn task status).
 */
export function requestPlanDayOf(now: Date): string {
  return localDayOf(now);
}

export type TriggerDecision =
  { request: true; trigger: 'first_open' | 'new_day' } | { request: false };

export function decidePlanTrigger(input: {
  now: Date;
  /** plan_date of the user's most recent plan of ANY date, if any. */
  latestPlanDate: string | null;
  /** Plan day of the last request this session made (dedup across foregrounds). */
  lastRequestedDay: string | null;
  inFlight: boolean;
}): TriggerDecision {
  if (input.inFlight) return { request: false };
  const today = localDayOf(input.now);
  // before 06:00 yesterday's plan still stands; the new day is planned on the first open after it
  if (planDayOf(input.now) !== today) return { request: false };
  if (input.latestPlanDate === today) return { request: false };
  if (input.lastRequestedDay === today) return { request: false };
  return { request: true, trigger: input.latestPlanDate === null ? 'first_open' : 'new_day' };
}
