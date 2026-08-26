import { decidePlanTrigger, planDayOf } from '../planTrigger';

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
  it('a 02:00 open still belongs to yesterday’s plan', () => {
    const night = new Date(2026, 7, 27, 2, 0);
    expect(
      decidePlanTrigger({
        now: night,
        latestPlanDate: '2026-08-26',
        lastRequestedDay: null,
        inFlight: false,
      }),
    ).toEqual({ request: false });
  });
});
