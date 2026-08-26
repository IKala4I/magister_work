/**
 * UC-03 trigger hook: on mount and on every foreground, ask for today's plan when none exists
 * (src/domain/planTrigger.ts decides; this file only wires AppState and the UI store).
 * Manual re-plan bypasses the dedup. Imports the bridge, so component tests mock this module.
 */
import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';

import type { PlanTrigger } from '../db/plans';
import { decidePlanTrigger, planDayOf } from '../domain/planTrigger';
import { usePlanStore } from '../state/plan';

import { isPlanRequestInFlight, requestPlan } from './planRequest';

export async function runPlanRequest(trigger: PlanTrigger, now: Date = new Date()): Promise<void> {
  const planDate = planDayOf(now);
  usePlanStore.setState({ status: 'planning', lastRequestedDay: planDate });
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

export function usePlanTrigger(latestPlanDate: string | null): { requestManual: () => void } {
  const check = useCallback(() => {
    const decision = decidePlanTrigger({
      now: new Date(),
      latestPlanDate,
      lastRequestedDay: usePlanStore.getState().lastRequestedDay,
      inFlight: isPlanRequestInFlight(),
    });
    if (decision.request) void runPlanRequest(decision.trigger);
  }, [latestPlanDate]);

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
