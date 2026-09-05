import {
  DEFAULT_SLEEP_WINDOW,
  DEFAULT_WORKING_HOURS,
  dayKeyOf,
  formatMinutes,
  hasWorkingWindowOn,
  isValidSleepWindow,
  isValidWorkingHours,
  isValidWorkingRange,
} from '../workingHours';

describe('working hours validation (ADR-0005/0006; specs/07 §5 shape)', () => {
  it('default template is Mon–Fri 09:00–18:00 and valid', () => {
    expect(DEFAULT_WORKING_HOURS).toEqual({
      mon: [540, 1080],
      tue: [540, 1080],
      wed: [540, 1080],
      thu: [540, 1080],
      fri: [540, 1080],
    });
    expect(isValidWorkingHours(DEFAULT_WORKING_HOURS)).toBe(true);
  });

  it.each([
    [[0, 1440], true], // full day is allowed
    [[540, 540], false], // degenerate
    [[600, 540], false], // reversed — overnight working hours are v1-invalid
    [[-30, 540], false],
    [[540, 1441], false],
    [[540.5, 1080], false], // whole minutes only
  ] as const)('range %p valid=%p', (range, expected) => {
    expect(isValidWorkingRange(range as [number, number])).toBe(expected);
  });

  it('at least one working day is required', () => {
    expect(isValidWorkingHours({})).toBe(false);
  });

  it('sleep window may wrap midnight (specs/07 §5 example [1380, 420])', () => {
    expect(isValidSleepWindow(DEFAULT_SLEEP_WINDOW)).toBe(true);
    expect(isValidSleepWindow([1380, 420])).toBe(true);
    expect(isValidSleepWindow([420, 420])).toBe(false);
  });

  it('formats minutes for steppers', () => {
    expect(formatMinutes(540)).toBe('9:00');
    expect(formatMinutes(1080)).toBe('18:00');
    expect(formatMinutes(0)).toBe('0:00');
    expect(formatMinutes(1439)).toBe('23:59');
  });
});

describe('hasWorkingWindowOn — ADR-0019 client mirror of the function predicate', () => {
  it('dayKeyOf follows the device calendar with Monday = mon', () => {
    expect(dayKeyOf('2026-09-07')).toBe('mon');
    expect(dayKeyOf('2026-09-05')).toBe('sat');
    expect(dayKeyOf('2026-09-06')).toBe('sun');
  });
  it('a declared weekday has a window; a day without hours has none', () => {
    expect(hasWorkingWindowOn('2026-09-09', DEFAULT_WORKING_HOURS, DEFAULT_SLEEP_WINDOW)).toBe(
      true,
    );
    expect(hasWorkingWindowOn('2026-09-05', DEFAULT_WORKING_HOURS, DEFAULT_SLEEP_WINDOW)).toBe(
      false,
    );
    expect(hasWorkingWindowOn('2026-09-09', {}, null)).toBe(false);
  });
  it('hours removed entirely by the 00–06 rule or the sleep window count as no window', () => {
    expect(hasWorkingWindowOn('2026-09-09', { wed: [60, 300] }, null)).toBe(false);
    // 22:00–24:00 declared, asleep 21:00–07:00
    expect(hasWorkingWindowOn('2026-09-09', { wed: [1320, 1440] }, [1260, 420])).toBe(false);
    // one surviving tick (21:45–22:00 before a 22:00 sleep window) is a window
    expect(hasWorkingWindowOn('2026-09-09', { wed: [1305, 1440] }, [1320, 420])).toBe(true);
  });
  it('ticks start at local midnight: a range narrower than one aligned tick has no window', () => {
    expect(hasWorkingWindowOn('2026-09-09', { wed: [1430, 1440] }, null)).toBe(false);
    expect(hasWorkingWindowOn('2026-09-09', { wed: [1420, 1440] }, null)).toBe(true);
    expect(hasWorkingWindowOn('2026-09-09', { wed: [355, 375] }, null)).toBe(true); // 06:00 tick
  });
  it('a malformed range is a non-working day (the server treats it the same way)', () => {
    expect(hasWorkingWindowOn('2026-09-09', { wed: [600, 540] }, null)).toBe(false);
  });
});
