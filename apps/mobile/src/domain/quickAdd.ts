/**
 * NL quick-add parser (FR-11, UC-02): "report draft 2h by Fri" / «чернетка звіту 2 год до
 * п'ятниці» → structured draft fields, entirely on-device (File 03 §2.1 — task text never leaves
 * the phone for parsing). chrono-node owns date expressions; a small explicit grammar owns
 * durations and deadline connectors. Ambiguity is surfaced, never guessed (UC-02 A1): the UI
 * renders disambiguation chips from the `ambiguities` list, and confirm applies whatever the
 * preview shows.
 *
 * Order matters: chrono treats bare durations ("90m", «2 год») as *relative time* expressions
 * and would consume them, so the duration grammar runs FIRST and its spans are masked out
 * of the text chrono sees. The exception is "in 2 hours" / «через 2 години» — a relative prefix
 * marks a deadline, so those stay unmasked for chrono.
 *
 * Both languages are parsed (ADR-0023). chrono-node 2.10.1 ships `chrono.uk` in its full-support
 * tier; what it does not ship is our own grammar, so durations, connectors and weekday forms are
 * declared per language below. Word boundaries use `\P{L}` rather than `\b`: JavaScript's `\w`
 * is ASCII, so `\bдо\b` matches nothing at all.
 */
import * as chrono from 'chrono-node';

import { getActiveLocale, type CatalogLocale } from '../i18n';

export type QuickAddAmbiguity =
  | {
      /** Bare weekday naming today ("fri" said on Friday): today or next week? */
      kind: 'weekday_today_or_next';
      today: Date;
      nextWeek: Date;
    }
  | {
      /** Clock time with no am/pm ("at 2"): morning or afternoon? */
      kind: 'am_or_pm';
      am: Date;
      pm: Date;
    }
  | {
      /** More than one date expression; the first is used, the rest offered. */
      kind: 'multiple_dates';
      candidates: Date[];
    }
  | {
      /** More than one duration; the first is used, the rest offered. */
      kind: 'multiple_durations';
      candidatesMinutes: number[];
    };

export type ParsedQuickAdd = {
  /** Input with consumed date/duration/connector spans removed. May be ''. */
  title: string;
  estMinutes: number | null;
  deadline: Date | null;
  ambiguities: QuickAddAmbiguity[];
  /** True when any structure (duration or deadline) was extracted. */
  parsed: boolean;
};

type Span = { start: number; end: number };

/** End-of-day convention for day-granular deadlines; the UI treats 23:59 as "no clock time". */
export const DAY_END = { hour: 23, minute: 59 };

interface Grammar {
  /** The chrono instance for this language (casual parsing). */
  parser: chrono.Chrono;
  /** Words that introduce a deadline, longest first. */
  connectors: readonly string[];
  /** Duration forms; capture group 1 = hours, group 2 = minutes. Must be global + sticky-free. */
  duration: RegExp;
  /** A prefix meaning "from now", which makes the number a deadline rather than an estimate. */
  relativePrefix: RegExp;
  /** A bare weekday, for the "today or next week?" question. */
  weekday: RegExp;
  /** A connector left dangling once its date span was consumed ("lunch at" → "lunch"). */
  dangling: RegExp;
  /**
   * Applied before parsing, never to the title. Same length in, same length out, so spans
   * computed on the normalised text still address the user's original words.
   */
  normalize: (text: string) => string;
}

/**
 * Ukrainian keyboards produce U+02BC (ʼ) and autocorrect often gives U+2019 (’), but chrono.uk
 * 2.10.1 recognises «п'ятниця» only with an ASCII apostrophe — so the phone's own apostrophe
 * would silently fail to parse. Every variant is folded to U+0027 for the parser's eyes only.
 */
const APOSTROPHES = /[\u02BC\u2019\u2018\u02B9\u00B4`]/g;
const identity = (text: string): string => text;

const GRAMMARS: Record<CatalogLocale, Grammar> = {
  en: {
    parser: chrono.casual,
    connectors: ['due by', 'by', 'due', 'before', 'until', 'till'],
    // "2h", "2 hrs", "1.5 hours", "90m", "45 min", "1h30m", "1h 30m"
    duration:
      /(?:(\d+(?:[.,]\d+)?)\s*(?:hours?|hrs?|h)(?![a-z]))?\s*(?:(\d+)\s*(?:minutes?|mins?|m)(?![a-z]))?/gi,
    relativePrefix: /(?:^|\P{L})(?:in|within)\s*$/iu,
    weekday: /^(?:on\s+)?(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:[a-z]*day)?$/i,
    dangling: /(?:^|\s)(?:at|on|by|due|before|until|till)$/i,
    normalize: identity,
  },
  uk: {
    parser: chrono.uk.casual,
    connectors: ['дедлайн', 'аж до', 'до', 'перед'],
    // «2 год», «2год», «1,5 години», «90 хв», «1 год 30 хв». No bare «м» for minutes: it would
    // swallow the metre in «2 м» and, with a following apostrophe, ordinary words too.
    duration:
      /(?:(\d+(?:[.,]\d+)?)\s*(?:годин[аиуою]?|год|г)(?![\p{L}]))?\s*(?:(\d+)\s*(?:хвилин[аиуою]?|хв)(?![\p{L}]))?/giu,
    relativePrefix: /(?:^|\P{L})через\s*$/iu,
    // Stems, so every case form counts: «п'ятниця», «у п'ятницю», «до п'ятниці».
    weekday: /^(?:[ву]\s+)?(понеділ|вівтор|серед|четвер|п'ятниц|субот|неділ)[\p{L}]*$/iu,
    dangling: /(?:^|\s)(?:до|перед|дедлайн|о|об|у|в|на)$/iu,
    normalize: (text) => text.replace(APOSTROPHES, "'"),
  },
};

function minutesFrom(hoursText: string | undefined, minutesText: string | undefined): number {
  const hours = hoursText ? Number.parseFloat(hoursText.replace(',', '.')) : 0;
  const minutes = minutesText ? Number.parseInt(minutesText, 10) : 0;
  return Math.round(hours * 60 + minutes);
}

function connectorBefore(text: string, index: number, grammar: Grammar): Span | null {
  const head = text.slice(0, index);
  for (const connector of grammar.connectors) {
    // `\P{L}` rather than `\b`: JavaScript word boundaries are ASCII-only, so a Cyrillic
    // connector would never match one.
    const match = new RegExp(`(^|\\P{L})(${connector})\\s*$`, 'iu').exec(head);
    if (match) return { start: match.index + (match[1]?.length ?? 0), end: index };
  }
  return null;
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function parseQuickAdd(
  input: string,
  now: Date = new Date(),
  locale: CatalogLocale = getActiveLocale(),
): ParsedQuickAdd {
  const text = input.trim();
  const grammar = GRAMMARS[locale];
  // Parsed against the normalised text, titled from the original: same length, same indices.
  const source = grammar.normalize(text);
  const consumed: Span[] = [];
  const ambiguities: QuickAddAmbiguity[] = [];

  // --- durations first (chrono would swallow bare "90m"/"2h" as relative times) ---
  const durationSpans: Span[] = [];
  const durations: Array<{ span: Span; minutes: number }> = [];
  for (const match of source.matchAll(grammar.duration)) {
    if (match[0].trim() === '' || (match[1] === undefined && match[2] === undefined)) continue;
    // «через 2 години» / "in 2 hours" is a deadline, not an estimate: leave it for chrono.
    if (grammar.relativePrefix.test(source.slice(0, match.index))) continue;
    const span: Span = { start: match.index, end: match.index + match[0].length };
    const minutes = minutesFrom(match[1], match[2]);
    // A zero duration ("0m") yields no estimate but is still duration-shaped text: mask and
    // consume it anyway, or chrono would read the dangling "0m" as a relative "now".
    durationSpans.push(span);
    consumed.push(span);
    if (minutes > 0) durations.push({ span, minutes });
  }
  let estMinutes: number | null = null;
  const firstDuration = durations[0];
  if (firstDuration !== undefined) {
    estMinutes = firstDuration.minutes;
    if (durations.length > 1) {
      ambiguities.push({
        kind: 'multiple_durations',
        candidatesMinutes: durations.map((d) => d.minutes),
      });
    }
  }

  // Mask duration spans with spaces so chrono indices still line up with `text`.
  let masked = source;
  for (const span of durationSpans) {
    masked =
      masked.slice(0, span.start) + ' '.repeat(span.end - span.start) + masked.slice(span.end);
  }

  // --- dates (forwardDate so "fri" is the upcoming Friday) ---
  const dateResults = grammar.parser.parse(masked, now, { forwardDate: true });
  let deadline: Date | null = null;
  // Prefer the result introduced by a deadline connector ("by fri"), else the first.
  const preferred =
    dateResults.find((r) => connectorBefore(masked, r.index, grammar) !== null) ?? dateResults[0];
  if (preferred !== undefined) {
    const span: Span = { start: preferred.index, end: preferred.index + preferred.text.length };
    consumed.push(span);
    const connector = connectorBefore(masked, preferred.index, grammar);
    if (connector) consumed.push(connector);

    const parsedDate = preferred.start.date();
    if (preferred.start.isCertain('hour')) {
      deadline = parsedDate;
      // "at 2" carries no am/pm: chrono implies one, but implying is guessing (UC-02 A1).
      // Hour 0 and hours 12–23 are unambiguous 24-hour statements; 1–11 get both readings.
      const hour = parsedDate.getHours();
      if (!preferred.start.isCertain('meridiem') && hour >= 1 && hour <= 11) {
        const dayCertain =
          preferred.start.isCertain('day') ||
          preferred.start.isCertain('weekday') ||
          preferred.start.isCertain('month');
        const minute = parsedDate.getMinutes();
        // An explicit day fixes the date; an implied one means "the nearest future h:mm".
        const candidateAt = (hour24: number): Date => {
          const candidate = dayCertain ? new Date(parsedDate) : new Date(now);
          candidate.setHours(hour24, minute, 0, 0);
          if (!dayCertain && candidate.getTime() <= now.getTime()) {
            candidate.setDate(candidate.getDate() + 1);
          }
          return candidate;
        };
        ambiguities.push({ kind: 'am_or_pm', am: candidateAt(hour), pm: candidateAt(hour + 12) });
      }
    } else {
      // "by Friday" means end of Friday, not midnight at its start.
      deadline = new Date(parsedDate);
      deadline.setHours(DAY_END.hour, DAY_END.minute, 0, 0);
    }

    if (dateResults.length > 1) {
      // Candidates get the same normalization as the chosen result (end of day when no time).
      ambiguities.push({
        kind: 'multiple_dates',
        candidates: dateResults.map((r) => {
          const candidate = r.start.date();
          if (!r.start.isCertain('hour')) candidate.setHours(DAY_END.hour, DAY_END.minute, 0, 0);
          return candidate;
        }),
      });
    }

    // Bare weekday resolving to today: "fri" said on Friday — today or next week?
    if (grammar.weekday.test(preferred.text.trim()) && sameLocalDay(parsedDate, now)) {
      const nextWeek = new Date(deadline);
      nextWeek.setDate(nextWeek.getDate() + 7);
      ambiguities.push({ kind: 'weekday_today_or_next', today: deadline, nextWeek });
    }
  }

  // --- title = what remains ---
  let title = '';
  let cursor = 0;
  for (const span of [...consumed].sort((a, b) => a.start - b.start)) {
    if (span.start > cursor) title += text.slice(cursor, span.start);
    cursor = Math.max(cursor, span.end);
  }
  title += text.slice(cursor);
  title = title
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
  title = title.replace(/[,.;:\s]+$/g, '').trim();
  // A connector left dangling by a consumed date span ("lunch at noon" → "lunch at").
  title = title
    .replace(grammar.dangling, '')
    .replace(/[,.;:\s]+$/g, '')
    .trim();

  return {
    title,
    estMinutes,
    deadline,
    ambiguities,
    parsed: estMinutes !== null || deadline !== null,
  };
}
