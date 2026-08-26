import {
  DEFAULT_SLEEP_WINDOW,
  DEFAULT_WORKING_HOURS,
  formatMinutes,
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
