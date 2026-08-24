/**
 * NL quick-add parser (FR-11, UC-02): "report draft 2h by Fri" → structured draft fields,
 * entirely on-device (File 03 §2.1 — task text never leaves the phone for parsing).
 * chrono-node 2.x owns date expressions; a small explicit grammar owns durations.
 * Ambiguity is surfaced, never guessed (UC-02 A1): the UI renders disambiguation chips
 * from the `ambiguities` list, and confirm applies whatever the preview shows.
 *
 * Order matters: chrono treats bare durations ("90m", "2h") as *relative time* expressions
 * and would consume them, so the duration grammar runs FIRST and its spans are masked out
 * of the text chrono sees. The exception is "in 2 hours"/"within 45 min" — an in/within
 * prefix marks a relative deadline, so those stay unmasked for chrono.
 */
import * as chrono from 'chrono-node';

export type QuickAddAmbiguity =
  | {
      /** Bare weekday naming today ("fri" said on Friday): today or next week? */
      kind: 'weekday_today_or_next';
      today: Date;
      nextWeek: Date;
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

const CONNECTORS = ['by', 'due by', 'due', 'before', 'until', 'till'];

/** h/min forms: "2h", "2 hrs", "1.5 hours", "90m", "45 min", "1h30m", "1h 30m". */
const DURATION_RE =
  /(?:(\d+(?:[.,]\d+)?)\s*(?:hours?|hrs?|h)(?![a-z]))?\s*(?:(\d+)\s*(?:minutes?|mins?|m)(?![a-z]))?/gi;

const DAY_END = { hour: 23, minute: 59 };

const WEEKDAY_RE = /^(?:on\s+)?(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:[a-z]*day)?$/i;

function minutesFrom(hoursText: string | undefined, minutesText: string | undefined): number {
  const hours = hoursText ? Number.parseFloat(hoursText.replace(',', '.')) : 0;
  const minutes = minutesText ? Number.parseInt(minutesText, 10) : 0;
  return Math.round(hours * 60 + minutes);
}

function connectorBefore(text: string, index: number): Span | null {
  const head = text.slice(0, index);
  for (const connector of CONNECTORS) {
    const match = new RegExp(`\\b${connector}\\s*$`, 'i').exec(head);
    if (match) return { start: match.index, end: index };
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

const RELATIVE_PREFIX_RE = /\b(?:in|within)\s*$/i;

export function parseQuickAdd(input: string, now: Date = new Date()): ParsedQuickAdd {
  const text = input.trim();
  const consumed: Span[] = [];
  const ambiguities: QuickAddAmbiguity[] = [];

  // --- durations first (chrono would swallow bare "90m"/"2h" as relative times) ---
  const durations: Array<{ span: Span; minutes: number }> = [];
  for (const match of text.matchAll(DURATION_RE)) {
    if (match[0].trim() === '' || (match[1] === undefined && match[2] === undefined)) continue;
    if (RELATIVE_PREFIX_RE.test(text.slice(0, match.index))) continue; // "in 2 hours" → deadline
    const span: Span = { start: match.index, end: match.index + match[0].length };
    const minutes = minutesFrom(match[1], match[2]);
    if (minutes > 0) durations.push({ span, minutes });
  }
  let estMinutes: number | null = null;
  const firstDuration = durations[0];
  if (firstDuration !== undefined) {
    estMinutes = firstDuration.minutes;
    for (const duration of durations) consumed.push(duration.span);
    if (durations.length > 1) {
      ambiguities.push({
        kind: 'multiple_durations',
        candidatesMinutes: durations.map((d) => d.minutes),
      });
    }
  }

  // Mask duration spans with spaces so chrono indices still line up with `text`.
  let masked = text;
  for (const { span } of durations) {
    masked =
      masked.slice(0, span.start) + ' '.repeat(span.end - span.start) + masked.slice(span.end);
  }

  // --- dates (forwardDate so "fri" is the upcoming Friday) ---
  const dateResults = chrono.parse(masked, now, { forwardDate: true });
  let deadline: Date | null = null;
  // Prefer the result introduced by a deadline connector ("by fri"), else the first.
  const preferred =
    dateResults.find((r) => connectorBefore(masked, r.index) !== null) ?? dateResults[0];
  if (preferred !== undefined) {
    const span: Span = { start: preferred.index, end: preferred.index + preferred.text.length };
    consumed.push(span);
    const connector = connectorBefore(masked, preferred.index);
    if (connector) consumed.push(connector);

    const parsedDate = preferred.start.date();
    if (preferred.start.isCertain('hour')) {
      deadline = parsedDate;
    } else {
      // "by Friday" means end of Friday, not midnight at its start.
      deadline = new Date(parsedDate);
      deadline.setHours(DAY_END.hour, DAY_END.minute, 0, 0);
    }

    if (dateResults.length > 1) {
      ambiguities.push({
        kind: 'multiple_dates',
        candidates: dateResults.map((r) => r.start.date()),
      });
    }

    // Bare weekday resolving to today: "fri" said on Friday — today or next week?
    if (WEEKDAY_RE.test(preferred.text.trim()) && sameLocalDay(parsedDate, now)) {
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

  return {
    title,
    estMinutes,
    deadline,
    ambiguities,
    parsed: estMinutes !== null || deadline !== null,
  };
}
