import {
  decidePlanTrigger,
  nextPlanDayOf,
  planDayOf,
  requestPlanDayOf,
  tomorrowOf,
} from '../planTrigger';

describe('planDayOf — 06:00 local day boundary (Appendix A plan triggers)', () => {
  it('rolls back before 06:00 and not at/after it', () => {
    expect(planDayOf(new Date(2026, 7, 26, 5, 59))).toBe('2026-08-25');
    expect(planDayOf(new Date(2026, 7, 26, 6, 0))).toBe('2026-08-26');
    expect(planDayOf(new Date(2026, 7, 26, 23, 30))).toBe('2026-08-26');
    expect(planDayOf(new Date(2026, 8, 1, 0, 30))).toBe('2026-08-31'); // month boundary
  });
});

describe('decidePlanTrigger — lazy UC-03 (invariant 7: no background dependence)', () => {
  const now = new Date(2026, 7, 26, 9, 0);
  it('requests first_open when nothing was ever planned', () => {
    expect(
      decidePlanTrigger({ now, latestPlanDate: null, lastRequestedDay: null, inFlight: false }),
    ).toEqual({ request: true, trigger: 'first_open' });
  });
  it('requests new_day when the latest plan is stale', () => {
    expect(
      decidePlanTrigger({
        now,
        latestPlanDate: '2026-08-25',
        lastRequestedDay: '2026-08-25',
        inFlight: false,
      }),
    ).toEqual({ request: true, trigger: 'new_day' });
  });
  it('does nothing when today is planned, already requested, or a request is in flight', () => {
    expect(
      decidePlanTrigger({
        now,
        latestPlanDate: '2026-08-26',
        lastRequestedDay: null,
        inFlight: false,
      }),
    ).toEqual({ request: false });
    expect(
      decidePlanTrigger({
        now,
        latestPlanDate: null,
        lastRequestedDay: '2026-08-26',
        inFlight: false,
      }),
    ).toEqual({ request: false });
    expect(
      decidePlanTrigger({ now, latestPlanDate: null, lastRequestedDay: null, inFlight: true }),
    ).toEqual({ request: false });
  });
  it('a 02:00 open never auto-requests; a manual request plans the current calendar day', () => {
    const night = new Date(2026, 7, 27, 2, 0);
    expect(
      decidePlanTrigger({
        now: night,
        latestPlanDate: '2026-08-26',
        lastRequestedDay: null,
        inFlight: false,
      }),
    ).toEqual({ request: false });
    expect(
      decidePlanTrigger({
        now: night,
        latestPlanDate: null,
        lastRequestedDay: null,
        inFlight: false,
      }),
    ).toEqual({ request: false });
    expect(requestPlanDayOf(night)).toBe('2026-08-27');
    expect(planDayOf(night)).toBe('2026-08-26');
  });
});

describe('decidePlanTrigger — an evening plan for tomorrow (FR-26, ADR-0014 §3)', () => {
  it('a plan for tomorrow made tonight never re-plans today', () => {
    const tonight = new Date(2026, 7, 26, 21, 0);
    expect(
      decidePlanTrigger({
        now: tonight,
        latestPlanDate: '2026-08-27',
        hasPlanForToday: true,
        lastRequestedDay: null,
        inFlight: false,
      }),
    ).toEqual({ request: false });
  });
  it('tomorrow morning the evening plan stands (no new_day request)', () => {
    expect(
      decidePlanTrigger({
        now: new Date(2026, 7, 27, 8, 0),
        latestPlanDate: '2026-08-27',
        hasPlanForToday: true,
        lastRequestedDay: null,
        inFlight: false,
      }),
    ).toEqual({ request: false });
  });
  it('without a plan for today the latest-date fallback still names the trigger', () => {
    expect(
      decidePlanTrigger({
        now: new Date(2026, 7, 27, 8, 0),
        latestPlanDate: '2026-08-26',
        hasPlanForToday: false,
        lastRequestedDay: null,
        inFlight: false,
      }),
    ).toEqual({ request: true, trigger: 'new_day' });
  });
  it('tomorrowOf crosses month boundaries', () => {
    expect(tomorrowOf(new Date(2026, 7, 31, 20, 0))).toBe('2026-09-01');
  });
  it('nextPlanDayOf follows the 06:00 anchor: a ritual tapped at 00:30 still plans the coming day', () => {
    expect(nextPlanDayOf(new Date(2026, 7, 26, 22, 0))).toBe('2026-08-27');
    expect(nextPlanDayOf(new Date(2026, 7, 27, 0, 30))).toBe('2026-08-27'); // still the 26th's plan day
    expect(nextPlanDayOf(new Date(2026, 7, 27, 6, 0))).toBe('2026-08-28');
  });
});
