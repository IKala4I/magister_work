/**
 * NL-parse mapping suite (FR-11, UC-02 acceptance): durations, deadlines, "by Fri",
 * ambiguity. Reference instant is fixed — Monday 2026-08-24 10:00 local — so weekday
 * arithmetic is deterministic in any timezone (all expectations are local-time).
 */
import { parseQuickAdd } from '../quickAdd';

const MONDAY_10AM = new Date(2026, 7, 24, 10, 0, 0, 0);

function localDate(y: number, m1: number, d: number, hh = 0, mm = 0): Date {
  return new Date(y, m1 - 1, d, hh, mm, 0, 0);
}

describe('reference sanity', () => {
  it('2026-08-24 is a Monday', () => {
    expect(MONDAY_10AM.getDay()).toBe(1);
  });
});

describe('durations', () => {
  it.each([
    ['report draft 2h', 120],
    ['deep work 1.5h', 90],
    ['finish thesis intro 90m', 90],
    ['plan sprint 45 min', 45],
    ['write review 1h 30m', 90],
    ['write review 1h30m', 90],
    ['sync notes 2 hours', 120],
    ['inbox zero 10 mins', 10],
  ])('"%s" → %d minutes', (input, minutes) => {
    const parsed = parseQuickAdd(input, MONDAY_10AM);
    expect(parsed.estMinutes).toBe(minutes);
    expect(parsed.parsed).toBe(true);
  });

  it('does not read a duration out of a deadline phrase ("in 2 hours")', () => {
    const parsed = parseQuickAdd('reply to emails in 2 hours', MONDAY_10AM);
    expect(parsed.estMinutes).toBeNull();
    expect(parsed.deadline).toEqual(localDate(2026, 8, 24, 12, 0));
    expect(parsed.title).toBe('reply to emails');
  });
});

describe('deadlines', () => {
  it('"by Fri" → end of the upcoming Friday', () => {
    const parsed = parseQuickAdd('report draft 2h by Fri', MONDAY_10AM);
    expect(parsed.deadline).toEqual(localDate(2026, 8, 28, 23, 59));
    expect(parsed.estMinutes).toBe(120);
    expect(parsed.title).toBe('report draft');
    expect(parsed.ambiguities).toEqual([]);
  });

  it('UC-02 canonical: "finish thesis intro 90m by tue"', () => {
    const parsed = parseQuickAdd('finish thesis intro 90m by tue', MONDAY_10AM);
    expect(parsed.title).toBe('finish thesis intro');
    expect(parsed.estMinutes).toBe(90);
    expect(parsed.deadline).toEqual(localDate(2026, 8, 25, 23, 59));
    expect(parsed.ambiguities).toEqual([]);
  });

  it('"tomorrow" without connector still becomes the deadline', () => {
    const parsed = parseQuickAdd('call mom tomorrow', MONDAY_10AM);
    expect(parsed.deadline).toEqual(localDate(2026, 8, 25, 23, 59));
    expect(parsed.title).toBe('call mom');
  });

  it('an explicit clock time is kept, not pushed to end of day', () => {
    const parsed = parseQuickAdd('submit report by 3pm', MONDAY_10AM);
    expect(parsed.deadline).toEqual(localDate(2026, 8, 24, 15, 0));
    expect(parsed.title).toBe('submit report');
  });

  it('no date expression → no deadline', () => {
    const parsed = parseQuickAdd('groceries', MONDAY_10AM);
    expect(parsed.deadline).toBeNull();
    expect(parsed.estMinutes).toBeNull();
    expect(parsed.parsed).toBe(false);
    expect(parsed.title).toBe('groceries');
  });
});

describe('ambiguity (UC-02 A1 — flagged, never guessed silently)', () => {
  it('bare weekday naming today → today-or-next-week ambiguity', () => {
    const parsed = parseQuickAdd('gym mon', MONDAY_10AM);
    const ambiguity = parsed.ambiguities.find((a) => a.kind === 'weekday_today_or_next');
    expect(ambiguity).toBeDefined();
    if (ambiguity?.kind === 'weekday_today_or_next') {
      expect(ambiguity.today).toEqual(localDate(2026, 8, 24, 23, 59));
      expect(ambiguity.nextWeek).toEqual(localDate(2026, 8, 31, 23, 59));
    }
    expect(parsed.deadline).toEqual(localDate(2026, 8, 24, 23, 59));
  });

  it('a dated weekday ("by fri" on Monday) is NOT ambiguous', () => {
    const parsed = parseQuickAdd('report by fri', MONDAY_10AM);
    expect(parsed.ambiguities).toEqual([]);
  });

  it('two date expressions → multiple_dates ambiguity, first one used', () => {
    const parsed = parseQuickAdd('meet tue review fri', MONDAY_10AM);
    const ambiguity = parsed.ambiguities.find((a) => a.kind === 'multiple_dates');
    expect(ambiguity).toBeDefined();
    if (ambiguity?.kind === 'multiple_dates') {
      expect(ambiguity.candidates).toHaveLength(2);
    }
  });

  it('two durations → multiple_durations ambiguity, first one used', () => {
    const parsed = parseQuickAdd('draft 1h edit 30m', MONDAY_10AM);
    expect(parsed.estMinutes).toBe(60);
    const ambiguity = parsed.ambiguities.find((a) => a.kind === 'multiple_durations');
    expect(ambiguity).toBeDefined();
    if (ambiguity?.kind === 'multiple_durations') {
      expect(ambiguity.candidatesMinutes).toEqual([60, 30]);
    }
  });
});

describe('title extraction', () => {
  it('strips connector + date + duration and tidies whitespace/punctuation', () => {
    const parsed = parseQuickAdd('  write   report draft 2h by Fri ', MONDAY_10AM);
    expect(parsed.title).toBe('write report draft');
  });

  it('a structure-only input leaves an empty title (confirm stays disabled)', () => {
    const parsed = parseQuickAdd('2h by fri', MONDAY_10AM);
    expect(parsed.title).toBe('');
    expect(parsed.parsed).toBe(true);
  });
});
