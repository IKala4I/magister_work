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
  /** plan_date of the user's most recent plan of ANY date, if any (names the trigger). */
  latestPlanDate: string | null;
  /**
   * Whether a plan for TODAY exists (P10, ADR-0014 §3): an evening plan for tomorrow makes the
   * latest plan date ≠ today without today being unplanned — this flag, not the latest date,
   * decides. Defaults to `latestPlanDate === today` for callers that have no separate read.
   */
  hasPlanForToday?: boolean;
  /** Plan day of the last request this session made (dedup across foregrounds). */
  lastRequestedDay: string | null;
  inFlight: boolean;
}): TriggerDecision {
  if (input.inFlight) return { request: false };
  const today = localDayOf(input.now);
  // before 06:00 yesterday's plan still stands; the new day is planned on the first open after it
  if (planDayOf(input.now) !== today) return { request: false };
  const planned = input.hasPlanForToday ?? input.latestPlanDate === today;
  if (planned) return { request: false };
  if (input.lastRequestedDay === today) return { request: false };
  return { request: true, trigger: input.latestPlanDate === null ? 'first_open' : 'new_day' };
}

/** The local calendar day after `now`. */
export function tomorrowOf(now: Date): string {
  const d = new Date(now);
  d.setDate(now.getDate() + 1);
  return localDayOf(d);
}

/**
 * The plan day after the plan day `at` belongs to — what the evening ritual plans (FR-26).
 * A 22:00 ritual tapped at 00:30 still plans the coming day, not the one after (the 06:00
 * anchor: 00:30 is the previous plan day). Callers pass the ritual's own fire time.
 */
export function nextPlanDayOf(at: Date): string {
  const [y, m, d] = planDayOf(at).split('-').map(Number);
  return localDayOf(new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + 1));
}
