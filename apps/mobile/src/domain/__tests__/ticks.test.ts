import { TICK_MINUTES, minutesToTicks, ticksToMinutes } from '../ticks';

describe('tick arithmetic (specs/04 §1.2, Δ = 15 min)', () => {
  it('uses the spec tick length', () => {
    expect(TICK_MINUTES).toBe(15);
  });

  it('rounds partial ticks up so a task never gets less time than estimated', () => {
    expect(minutesToTicks(0)).toBe(0);
    expect(minutesToTicks(15)).toBe(1);
    expect(minutesToTicks(16)).toBe(2);
    expect(minutesToTicks(90)).toBe(6);
  });

  it('covers a day in ≤96 ticks and a week in ≤672 ticks', () => {
    expect(minutesToTicks(24 * 60)).toBe(96);
    expect(minutesToTicks(7 * 24 * 60)).toBe(672);
  });

  it('round-trips whole ticks', () => {
    expect(ticksToMinutes(minutesToTicks(120))).toBe(120);
  });

  it('rejects invalid input', () => {
    expect(() => minutesToTicks(-1)).toThrow(RangeError);
    expect(() => minutesToTicks(Number.NaN)).toThrow(RangeError);
    expect(() => ticksToMinutes(1.5)).toThrow(RangeError);
  });
});
