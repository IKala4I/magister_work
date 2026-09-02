/**
 * usePlanTrigger wiring (UC-03 "exactly one plan request per plan day"), pinned after the
 * hardware pass (Pixel 7a, 2026-09-02 #15): the hook must (1) decide nothing while the plan
 * reads are unresolved — a live read's first render is `[]`, which used to pass for "never
 * planned" and re-fired `first_open` on every cold start; (2) dedup per plan day DURABLY — the
 * key lives in MMKV, so a cold start (every JS store re-created) on a day that already
 * requested does not request again, even when the read is slow or the plan had zero blocks;
 * (3) let a manual re-plan bypass the dedup; (4) keep the evening ritual (plans tomorrow) from
 * touching today's key. The bridge is mocked; MMKV is the in-memory test double.
 */
const mockRequestPlan = jest.fn();
let mockInFlight = false;
jest.mock('../planRequest', () => ({
  requestPlan: (...a: unknown[]) => mockRequestPlan(...a),
  isPlanRequestInFlight: () => mockInFlight,
}));

import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { localDayOf } from '../../domain/localDay';
import { requestPlanDayOf, tomorrowOf } from '../../domain/planTrigger';
import { usePlanStore } from '../../state/plan';
import { appStorage, StorageKeys } from '../../storage/mmkv';
import { lastRequestedPlanDay } from '../planRequestDay';
import { runPlanRequest, usePlanTrigger, type PlanTriggerInput } from '../usePlanTrigger';

// The clock is pinned to 09:00 local of the real calendar day (modern fake timers): a suite
// run before the 06:00 plan-day anchor would otherwise sit where no auto-request is ever made.
const NOW = (() => {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  return d;
})();
const today = requestPlanDayOf(NOW);

function mount(input: PlanTriggerInput) {
  return renderHook((props: PlanTriggerInput) => usePlanTrigger(props), {
    initialProps: input,
  });
}

/** Everything a cold start throws away — the UI store; MMKV (the file) survives. */
function simulateColdStart() {
  usePlanStore.setState({ status: 'idle', emptyInbox: false });
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  jest.clearAllMocks();
  mockInFlight = false;
  appStorage.clearAll();
  usePlanStore.setState({ status: 'idle', emptyInbox: false });
  mockRequestPlan.mockResolvedValue({ kind: 'planned', plan: {}, durationMs: 1 });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('usePlanTrigger — waits for the plan reads', () => {
  it('requests nothing while the reads are unresolved, then first_open once they are', async () => {
    const { rerender } = await mount({ latestPlanDate: null, todayPlanDate: null, ready: false });
    expect(mockRequestPlan).not.toHaveBeenCalled();
    await act(async () => {
      await rerender({ latestPlanDate: null, todayPlanDate: null, ready: true });
    });
    expect(mockRequestPlan).toHaveBeenCalledTimes(1);
    expect(mockRequestPlan.mock.calls[0]?.[0]).toMatchObject({
      planDate: today,
      trigger: 'first_open',
    });
  });

  it('a persisted plan for today → no request on mount (the cold start that used to re-plan)', async () => {
    await mount({ latestPlanDate: today, todayPlanDate: today, ready: true });
    expect(mockRequestPlan).not.toHaveBeenCalled();
  });

  it('a read that resolves to today’s plan after an unready render never requests', async () => {
    const { rerender } = await mount({ latestPlanDate: null, todayPlanDate: null, ready: false });
    await act(async () => {
      await rerender({ latestPlanDate: today, todayPlanDate: today, ready: true });
    });
    expect(mockRequestPlan).not.toHaveBeenCalled();
  });
});

describe('usePlanTrigger — durable per-plan-day dedup (MMKV)', () => {
  it('writes the plan day to MMKV when a request starts', async () => {
    await mount({ latestPlanDate: null, todayPlanDate: null, ready: true });
    expect(mockRequestPlan).toHaveBeenCalledTimes(1);
    expect(appStorage.getString(StorageKeys.lastPlanRequestDay)).toBe(today);
    expect(lastRequestedPlanDay()).toBe(today);
  });

  it('survives a cold start: a second mount on the same day does not request again, even with no plan rows', async () => {
    const first = await mount({ latestPlanDate: null, todayPlanDate: null, ready: true });
    expect(mockRequestPlan).toHaveBeenCalledTimes(1);
    await first.unmount();
    simulateColdStart();
    // the request produced no plan row (evening-empty / fallback / still syncing): reads say "no plan"
    await mount({ latestPlanDate: null, todayPlanDate: null, ready: true });
    expect(mockRequestPlan).toHaveBeenCalledTimes(1);
  });

  it('a foreground on the same day after a cold start is deduped too', async () => {
    appStorage.set(StorageKeys.lastPlanRequestDay, today);
    await mount({ latestPlanDate: null, todayPlanDate: null, ready: true });
    // react-native's jest preset mocks AppState.addEventListener as a jest.fn — replay the
    // handler the hook registered, as the OS would on foreground
    const registered = (AppState.addEventListener as unknown as jest.Mock).mock.calls as Array<
      [string, (state: string) => void]
    >;
    expect(registered.map(([type]) => type)).toContain('change');
    await act(async () => {
      for (const [type, handler] of registered) if (type === 'change') handler('active');
    });
    expect(mockRequestPlan).not.toHaveBeenCalled();
  });

  it('a key from yesterday does not block today (new_day fires once)', async () => {
    const yesterday = localDayOf(new Date(Date.now() - 86_400_000));
    appStorage.set(StorageKeys.lastPlanRequestDay, yesterday);
    await mount({ latestPlanDate: yesterday, todayPlanDate: null, ready: true });
    expect(mockRequestPlan).toHaveBeenCalledTimes(1);
    expect(mockRequestPlan.mock.calls[0]?.[0]).toMatchObject({ trigger: 'new_day' });
    expect(lastRequestedPlanDay()).toBe(today);
  });

  it('manual re-plan bypasses the dedup', async () => {
    appStorage.set(StorageKeys.lastPlanRequestDay, today);
    const { result } = await mount({ latestPlanDate: today, todayPlanDate: today, ready: true });
    expect(mockRequestPlan).not.toHaveBeenCalled();
    await act(async () => {
      result.current.requestManual();
    });
    expect(mockRequestPlan).toHaveBeenCalledTimes(1);
    expect(mockRequestPlan.mock.calls[0]?.[0]).toMatchObject({
      trigger: 'manual',
      planDate: today,
    });
  });

  it('manual is a no-op while a request is in flight', async () => {
    mockInFlight = true;
    const { result } = await mount({ latestPlanDate: today, todayPlanDate: today, ready: true });
    await act(async () => {
      result.current.requestManual();
    });
    expect(mockRequestPlan).not.toHaveBeenCalled();
  });
});

describe('runPlanRequest — the evening ritual plans tomorrow and leaves today’s key alone (FR-26)', () => {
  it('does not write the dedup key for a tomorrow request', async () => {
    const now = new Date();
    await runPlanRequest('evening_ritual', now, tomorrowOf(now));
    expect(mockRequestPlan).toHaveBeenCalledTimes(1);
    expect(mockRequestPlan.mock.calls[0]?.[0]).toMatchObject({
      trigger: 'evening_ritual',
      planDate: tomorrowOf(now),
    });
    expect(lastRequestedPlanDay()).toBeNull();
    expect(usePlanStore.getState().status).toBe('idle');
  });

  it('a request for today writes the key and drives the UI status', async () => {
    mockRequestPlan.mockResolvedValue({ kind: 'rate_limited' });
    await runPlanRequest('manual');
    expect(lastRequestedPlanDay()).toBe(today);
    expect(usePlanStore.getState().status).toBe('rate_limited');
  });
});
