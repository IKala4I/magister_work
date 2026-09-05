/**
 * UC-03 trigger hook: on mount and on every foreground, ask for today's plan when none exists
 * (src/domain/planTrigger.ts decides; this file only wires AppState, the UI store and the
 * durable per-plan-day dedup key). It decides nothing until the plan reads have resolved —
 * the first render of a live read is empty, not "no plan" (hardware pass 2026-09-02 #15).
 * Manual re-plan bypasses the dedup. Imports the bridge, so component tests mock this module.
 */
import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';

import { currentUserId } from '../auth/identity';
import { db } from '../db/client';
import type { PlanTrigger } from '../db/plans';
import { getProfile } from '../db/profile';
import type { LocalDb } from '../db/writes';
import { decidePlanTrigger, requestPlanDayOf } from '../domain/planTrigger';
import { hasWorkingWindowOn, type MinuteRange, type WorkingHours } from '../domain/workingHours';
import { track } from '../observability/analytics';
import { usePlanStore } from '../state/plan';

import { isPlanRequestInFlight, type PlanRequestOutcome, requestPlan } from './planRequest';
import { lastRequestedPlanDay, rememberRequestedPlanDay } from './planRequestDay';

/** Outcomes in which the server answered the day's request — the only ones that dedup it. */
const ANSWERED_OUTCOMES: ReadonlySet<PlanRequestOutcome['kind']> = new Set([
  'planned',
  'empty_inbox',
  'no_working_window',
  'rate_limited',
]);

/**
 * ADR-0019, client half: a plan day without a working window is answered from the local profile
 * — no session, no sync, no round trip — and counts as answered (the dedup key is written). The
 * function refuses the same day for a stale client; the ritual's `notification_response` fact
 * is logged before this runs (src/notifications/respond.ts), so FR-32 is untouched. A MANUAL
 * re-plan skips the local check: it runs the pre-plan sync first, so a working window added on
 * the server (the hardware-pass helper today; an hours editor later) is planned on the very tap
 * instead of after an unrelated pull — the function's answer is cheap and unpersisted.
 */
function localDayWithoutWindow(planDate: string): boolean {
  const profile = getProfile(db as unknown as LocalDb, currentUserId());
  if (profile === undefined) return false; // no profile yet → the server answers (404 / plan)
  return !hasWorkingWindowOn(
    planDate,
    profile.workingHours as WorkingHours,
    profile.sleepWindow as MinuteRange | null,
  );
}

export async function runPlanRequest(
  trigger: PlanTrigger,
  now: Date = new Date(),
  /** P10 (FR-26): the evening ritual plans TOMORROW; every other trigger plans the current day. */
  planDate: string = requestPlanDayOf(now),
): Promise<void> {
  let outcome: PlanRequestOutcome;
  if (trigger !== 'manual' && localDayWithoutWindow(planDate)) {
    track('plan_requested', {
      trigger,
      outcome: 'no_working_window',
      duration_ms: 0,
      engine: null,
      model_version: null,
    });
    outcome = { kind: 'no_working_window', planDate, durationMs: 0 };
  } else {
    usePlanStore.setState({ status: 'planning' });
    outcome = await requestPlan({ planDate, trigger, now });
  }
  // The dedup key is written only once the server has actually ANSWERED today's request
  // (planned / empty inbox / rate-limited). Offline, no session, a missing profile or a failure
  // leave it unwritten so the next foreground retries (the in-flight guard prevents a double
  // fire; a process death mid-request costs at most one duplicate request). The evening ritual
  // is FR-26's request, not UC-03's, and never writes it — not even at 00:30, when the coming
  // plan day IS the current calendar day (06:00 anchor); every other trigger plans today.
  if (
    trigger !== 'evening_ritual' &&
    planDate === requestPlanDayOf(now) &&
    ANSWERED_OUTCOMES.has(outcome.kind)
  ) {
    rememberRequestedPlanDay(planDate);
  }
  switch (outcome.kind) {
    case 'planned':
      usePlanStore.setState({ status: 'idle', emptyInbox: false });
      break;
    case 'empty_inbox':
      usePlanStore.setState({ status: 'idle', emptyInbox: true });
      break;
    case 'no_working_window':
      // Today derives its copy from the profile (the day is a fact, not a request state)
      usePlanStore.setState({ status: 'idle', emptyInbox: false });
      break;
    case 'no-session':
      usePlanStore.setState({ status: 'no_session' });
      break;
    case 'offline':
      usePlanStore.setState({ status: 'offline' });
      break;
    case 'rate_limited':
      usePlanStore.setState({ status: 'rate_limited' });
      break;
    case 'profile_missing':
      usePlanStore.setState({ status: 'idle' });
      break;
    case 'failed':
      usePlanStore.setState({ status: 'error' });
      break;
  }
}

export interface PlanTriggerInput {
  /** plan_date of the latest plan of any date; null = never planned (names the trigger). */
  latestPlanDate: string | null;
  /** plan_date of today's plan if one exists (ADR-0014 §3); omitted = derive from the latest. */
  todayPlanDate?: string | null;
  /** Both plan reads have resolved — until then the trigger waits (no decision on `[]`). */
  ready: boolean;
  /**
   * The session store's `refreshedAt` (src/auth/session.ts): a session re-established AFTER a
   * check gave up on a stale token re-runs the check — an offline start, then the radios back
   * inside auth-js's 60 s refresh-failure cache, left the day unplanned until the next
   * foreground (hardware pass 2026-09-04 F1). The dedup key is written only once the server
   * answered, and the in-flight guard holds, so nothing double-fires.
   */
  sessionRefreshedAt?: number;
}

export function usePlanTrigger({
  latestPlanDate,
  todayPlanDate,
  ready,
  sessionRefreshedAt,
}: PlanTriggerInput): {
  requestManual: () => void;
} {
  const check = useCallback(() => {
    const now = new Date();
    const decision = decidePlanTrigger({
      now,
      ready,
      latestPlanDate,
      ...(todayPlanDate !== undefined
        ? { hasPlanForToday: todayPlanDate === requestPlanDayOf(now) }
        : {}),
      lastRequestedDay: lastRequestedPlanDay(),
      inFlight: isPlanRequestInFlight(),
    });
    if (decision.request) void runPlanRequest(decision.trigger);
  }, [latestPlanDate, todayPlanDate, ready]);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, [check, sessionRefreshedAt]);

  const requestManual = useCallback(() => {
    if (isPlanRequestInFlight()) return;
    void runPlanRequest('manual');
  }, []);

  return { requestManual };
}
