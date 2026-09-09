/**
 * Ukrainian NL-parse mapping suite (FR-11, UC-02; ADR-0023). The English suite's mirror: the
 * same reference instant — Monday 2026-08-24 10:00 local — and the same four questions, asked of
 * Ukrainian input.
 *
 * The hardware pass on 2026-09-01 recorded «документ до 12 годин в п'ятницю» keeping the whole
 * string as the title, with the note "chrono-node is English-only". The library is not; our
 * configuration was. This suite is what stops that being true again.
 */
import { parseQuickAdd } from '../quickAdd';

const MONDAY_10AM = new Date(2026, 7, 24, 10, 0, 0, 0);
const uk = (input: string, now: Date = MONDAY_10AM) => parseQuickAdd(input, now, 'uk');

function localDate(y: number, m1: number, d: number, hh = 0, mm = 0): Date {
  return new Date(y, m1 - 1, d, hh, mm, 0, 0);
}

describe('durations', () => {
  it.each([
    ['чернетка звіту 2 год', 120],
    ['чернетка звіту 2год', 120],
    ['глибока робота 1,5 год', 90],
    ['дописати вступ 90 хв', 90],
    ['спланувати спринт 45 хв', 45],
    ['огляд 1 год 30 хв', 90],
    ['синхронізувати нотатки 2 години', 120],
  ])('«%s» → %d хв', (input, minutes) => {
    const parsed = uk(input);
    expect(parsed.estMinutes).toBe(minutes);
    expect(parsed.parsed).toBe(true);
  });

  it('reads «через 2 години» as a deadline, not an estimate', () => {
    const parsed = uk('відповісти на пошту через 2 години');
    expect(parsed.estMinutes).toBeNull();
    expect(parsed.deadline).toEqual(localDate(2026, 8, 24, 12, 0));
    expect(parsed.title).toBe('відповісти на пошту');
  });

  it('leaves a bare metre alone — «м» is not a minute', () => {
    const parsed = uk('купити 2 м кабелю');
    expect(parsed.estMinutes).toBeNull();
    expect(parsed.title).toBe('купити 2 м кабелю');
  });
});

describe('deadlines', () => {
  it('«до п’ятниці» is the end of Friday', () => {
    const parsed = uk('чернетка звіту 2 год до п’ятниці');
    expect(parsed.estMinutes).toBe(120);
    expect(parsed.deadline).toEqual(localDate(2026, 8, 28, 23, 59));
    expect(parsed.title).toBe('чернетка звіту');
  });

  it.each([
    ['ʼ', 'U+02BC — what a Ukrainian keyboard produces'],
    ['’', 'U+2019 — what autocorrect produces'],
    ["'", 'U+0027 — the ASCII apostrophe'],
    ['‘', 'U+2018 — a stray opening quote'],
  ])('parses Friday written with %s (%s)', (apostrophe) => {
    const parsed = uk(`здати звіт до п${apostrophe}ятниці`);
    expect(parsed.deadline).toEqual(localDate(2026, 8, 28, 23, 59));
    expect(parsed.title).toBe('здати звіт');
  });

  it.each([
    ['до завтра', localDate(2026, 8, 25, 23, 59)],
    ['до середи', localDate(2026, 8, 26, 23, 59)],
    ['до 20 вересня', localDate(2026, 9, 20, 23, 59)],
    ['до післязавтра', localDate(2026, 8, 26, 23, 59)],
  ])('«%s»', (phrase, expected) => {
    expect(uk(`здати звіт ${phrase}`).deadline).toEqual(expected);
  });

  it('keeps a clock time as stated', () => {
    const parsed = uk('дзвінок о 14:00');
    expect(parsed.deadline).toEqual(localDate(2026, 8, 24, 14, 0));
    expect(parsed.title).toBe('дзвінок');
  });

  it('strips the connector from the title, not the words around it', () => {
    expect(uk('підготувати презентацію до четверга').title).toBe('підготувати презентацію');
  });
});

describe('ambiguity is surfaced, never guessed (UC-02 A1)', () => {
  it('a clock hour with no part of day offers both readings', () => {
    const parsed = uk('зустріч о 2');
    const ambiguity = parsed.ambiguities.find((a) => a.kind === 'am_or_pm');
    expect(ambiguity).toBeDefined();
    if (ambiguity?.kind !== 'am_or_pm') throw new Error('unreachable');
    expect(ambiguity.am.getHours()).toBe(2);
    expect(ambiguity.pm.getHours()).toBe(14);
  });

  it('a weekday naming today asks today or next week', () => {
    // The reference instant is a Monday.
    const parsed = uk('огляд у понеділок');
    const ambiguity = parsed.ambiguities.find((a) => a.kind === 'weekday_today_or_next');
    expect(ambiguity).toBeDefined();
    if (ambiguity?.kind !== 'weekday_today_or_next') throw new Error('unreachable');
    expect(ambiguity.today).toEqual(localDate(2026, 8, 24, 23, 59));
    expect(ambiguity.nextWeek).toEqual(localDate(2026, 8, 31, 23, 59));
  });
});

describe('nothing to parse', () => {
  it.each(['купити молоко', 'подзвонити мамі', 'прибрати в кімнаті'])(
    '«%s» stays a plain title',
    (input) => {
      const parsed = uk(input);
      expect(parsed.parsed).toBe(false);
      expect(parsed.estMinutes).toBeNull();
      expect(parsed.deadline).toBeNull();
      expect(parsed.title).toBe(input);
    },
  );
});

describe('the example the app shows is an example the app can parse', () => {
  it('«чернетка звіту 2 год до п’ятниці» — the caption under the Ukrainian input', () => {
    // src/i18n/uk.ts 'inbox.quickAdd.example'. A caption promising a parse that does not happen
    // is worse than no caption.
    const parsed = uk('чернетка звіту 2 год до п’ятниці');
    expect(parsed.estMinutes).toBe(120);
    expect(parsed.deadline).toEqual(localDate(2026, 8, 28, 23, 59));
    expect(parsed.title).toBe('чернетка звіту');
  });

  it('the recorded hardware input now parses (device-pass 2026-09-01 item 9)', () => {
    const parsed = uk("документ 12 годин до п'ятниці");
    expect(parsed.estMinutes).toBe(720);
    expect(parsed.deadline).toEqual(localDate(2026, 8, 28, 23, 59));
    expect(parsed.title).toBe('документ');
  });
});

describe('the two languages do not read each other', () => {
  it('English input under the Ukrainian grammar keeps its whole self as the title', () => {
    const parsed = uk('report draft 2h by Fri');
    expect(parsed.parsed).toBe(false);
    expect(parsed.title).toBe('report draft 2h by Fri');
  });

  it('Ukrainian input under the English grammar keeps its whole self as the title', () => {
    const parsed = parseQuickAdd('чернетка звіту 2 год до п’ятниці', MONDAY_10AM, 'en');
    expect(parsed.parsed).toBe(false);
    expect(parsed.title).toBe('чернетка звіту 2 год до п’ятниці');
  });
});
