/**
 * UC-03 trigger hook: on mount and on every foreground, ask for today's plan when none exists
 * (src/domain/planTrigger.ts decides; this file only wires AppState and the UI store).
 * Manual re-plan bypasses the dedup. Imports the bridge, so component tests mock this module.
 */
import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';

import type { PlanTrigger } from '../db/plans';
import { decidePlanTrigger, requestPlanDayOf } from '../domain/planTrigger';
import { usePlanStore } from '../state/plan';

import { isPlanRequestInFlight, requestPlan } from './planRequest';

export async function runPlanRequest(
  trigger: PlanTrigger,
  now: Date = new Date(),
  /** P10 (FR-26): the evening ritual plans TOMORROW; every other trigger plans the current day. */
  planDate: string = requestPlanDayOf(now),
): Promise<void> {
  // the dedup key is only ever today's request — a plan for tomorrow must not block today's
  usePlanStore.setState(
    planDate === requestPlanDayOf(now)
      ? { status: 'planning', lastRequestedDay: planDate }
      : { status: 'planning' },
  );
  const outcome = await requestPlan({ planDate, trigger, now });
  switch (outcome.kind) {
    case 'planned':
      usePlanStore.setState({ status: 'idle', emptyInbox: false });
      break;
    case 'empty_inbox':
      usePlanStore.setState({ status: 'idle', emptyInbox: true });
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

export function usePlanTrigger(
  latestPlanDate: string | null,
  /** plan_date of today's plan if one exists (ADR-0014 §3); omitted = derive from the latest. */
  todayPlanDate?: string | null,
): { requestManual: () => void } {
  const check = useCallback(() => {
    const now = new Date();
    const decision = decidePlanTrigger({
      now,
      latestPlanDate,
      ...(todayPlanDate !== undefined
        ? { hasPlanForToday: todayPlanDate === requestPlanDayOf(now) }
        : {}),
      lastRequestedDay: usePlanStore.getState().lastRequestedDay,
      inFlight: isPlanRequestInFlight(),
    });
    if (decision.request) void runPlanRequest(decision.trigger);
  }, [latestPlanDate, todayPlanDate]);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  const requestManual = useCallback(() => {
    if (isPlanRequestInFlight()) return;
    void runPlanRequest('manual');
  }, []);

  return { requestManual };
}
