/**
 * Facts → reward tuples (specs/07 §3.4.1 outcome table, §3.4.2 attribution windows, §3.5 two-phase
 * pipeline; File 05 §1; spec-conflicts H2/H3). Pure: no I/O, no clock — the caller passes `now`.
 *
 * The client logs FACTS (events); this module maps them; the RecSys service applies the math
 * (invariant 1). Three structurally distinct paths (H3): a lapse is a real 0.0 tuple; an
 * ambiguous reward (M-02 `conflict_flag`) is a tuple with `excluded = true`; an external
 * displacement produces NO tuple (displaced rows never reach this module — `attribution_due`
 * filters them and the instant path ignores them).
 *
 * Timing (§3.4.2): rows 1–3 and 6 are INSTANT (as soon as the fact syncs); rows 4–5 belong to
 * the 23:55-local authority (`mode = 'daily'`). A same-day off-slot completion seen by the
 * instant path is therefore NOT rewarded early — the daily job owns it (spec-literal).
 * Overrides (rows 8–9) are instant paired tuples. UC-04 A1 "actually did it" replaces a stored
 * `lapsed` tuple within the 7-day correction window (r = 1.0, `correction = true` → the service
 * rebuilds); after the window the fact is logged but the tuple is frozen.
 *
 * P8's `sync-resolve` reuses this module unchanged after op replay.
 */
import {
  CORRECTION_WINDOW_DAYS,
  DURATION_EWMA_ALPHA,
  DURATION_MIN_SESSIONS,
  DURATION_RATIO_CLIP,
  DURATION_SAMPLE_CLIP,
  PAR_GRACE_MINUTES,
  PAR_MIN_FRACTION,
  REWARD_OFF_SLOT,
  REWARD_OVERRIDE_IN,
  REWARD_OVERRIDE_OUT,
} from './params.ts';
import type { Category } from './types.ts';

/** Reward-bearing fact types (events.type). */
export const REWARD_FACT_TYPES = [
  'focus_end',
  'task_completed',
  'block_skipped',
  'block_moved',
  'lapse_corrected',
] as const;
/** Every P7 client event type (the rest are labels/telemetry, never rewards — §3.4 "ratings are not rewards"). */
export const P7_EVENT_TYPES = [
  ...REWARD_FACT_TYPES,
  'focus_start',
  'focus_pause',
  'focus_resume',
  'lapse_observed',
  'session_rated',
  'skip_diagnostic',
] as const;

export type Kind = 'outcome' | 'override_out' | 'override_in';
export type Reason =
  | 'completed'
  | 'partial'
  | 'off_slot'
  | 'lapsed'
  | 'skipped'
  | 'rejected'
  | 'override_out'
  | 'override_in';
export type Source = 'instant' | 'daily' | 'correction';
export type Mode = 'instant' | 'daily';

/** A row of `events` as the mapping sees it (payload shapes documented per type below). */
export interface Fact {
  type: string;
  task_id: string | null;
  recommendation_id: string | null;
  payload: Record<string, unknown>;
  /** ISO instant. */
  client_ts: string;
  /** YYYY-MM-DD in the user's zone (attribution day). */
  local_day: string;
  /** Client context; `tz` = the device zone when the fact was logged (P7 adversarial #11). */
  context?: Record<string, unknown>;
}
// payload shapes (client → server, categorical/numeric only — NFR-S3):
//   focus_end      { outcome: 'finished'|'abandoned', started_at, ended_at, focused_ms, planned_minutes, est_minutes, session_id }
//   task_completed { done_at, source: 'block'|'inbox'|'focus' }
//   block_skipped  { at }
//   block_moved    { from_start, from_end, to_start, to_end, distance_minutes }
//   lapse_corrected { at }
//   lapse_observed { observed_at }            (not a reward; the 23:55 job is the authority)
//   session_rated  { energy: 1|2|3, difficulty?: 1|2|3, session_id }   (label, never r)
//   skip_diagnostic { answer: 'too_big'|'wrong_time'|'not_important', consecutive_skips }

export interface RewardRec {
  id: string;
  task_id: string;
  category: Category;
  slot_start: string;
  slot_end: string;
  context_bucket: string;
  features: number[];
  status: string;
  conflict_flag: boolean;
  /** YYYY-MM-DD of slot_end in the profile zone. */
  local_day: string;
  attributed_at: string | null;
}

export interface StoredTuple {
  recommendation_id: string;
  kind: Kind;
  reward: number;
  reason: Reason;
  excluded: boolean;
  attributed_at: string;
  corrected_at: string | null;
  source?: Source | string;
}

export interface Tuple {
  recommendation_id: string;
  kind: Kind;
  reward: number;
  reason: Reason;
  category: Category;
  features: number[];
  excluded: boolean;
  excluded_reason: string | null;
  attributed_at: string;
  correction: boolean;
  source: Source;
}

export interface RecPatch {
  id: string;
  status?: 'completed' | 'lapsed' | 'rejected' | 'moved';
  attributed_at?: string;
  slot_start?: string;
  slot_end?: string;
  context_bucket?: string;
  features?: number[];
}

export interface OverrideTarget {
  to_start: string;
  to_end: string;
  context_bucket: string;
  features: number[];
  /** Attribution day of the new slot (profile zone). */
  local_day: string;
}

export interface MappingResult {
  tuples: Tuple[];
  patches: RecPatch[];
}

const MS_PER_MINUTE = 60_000;
const GRACE_MS = PAR_GRACE_MINUTES * MS_PER_MINUTE;

function ms(iso: unknown): number | null {
  if (typeof iso !== 'string') return null;
  const v = Date.parse(iso);
  return Number.isFinite(v) ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** File 06 §1.4 / §3.4.1: a session belongs to its block when started within ±15 min of slot_start. */
export function sessionInWindow(slotStartMs: number, startedMs: number): boolean {
  return Math.abs(startedMs - slotStartMs) <= GRACE_MS;
}

/** [INFERRED] a completion without a session is in-window when done inside the slot ± grace. */
export function completionInWindow(
  slotStartMs: number,
  slotEndMs: number,
  doneMs: number,
): boolean {
  return doneMs >= slotStartMs - GRACE_MS && doneMs <= slotEndMs + GRACE_MS;
}

interface Observed {
  /** A considered fact was logged under a device zone ≠ the profile zone (§3.4.2 ambiguity). */
  tzMismatch: boolean;
  /** Any in-window finished session, or an in-window "marked done" (row 1). */
  completedInWindow: boolean;
  /** Σ focused / planned over in-window sessions (rows 2–3); null without an in-window session. */
  fraction: number | null;
  /** Explicit skip (row 6). */
  skipped: boolean;
  /** Task completed on the same local day (row 4 candidate), in- or out-of-window. */
  completedSameDay: boolean;
}

function factTz(f: Fact): string | null {
  const tz = f.context?.tz;
  return typeof tz === 'string' && tz.length > 0 ? tz : null;
}

function observe(rec: RewardRec, facts: readonly Fact[], timezone: string | null): Observed {
  const slotStart = Date.parse(rec.slot_start);
  const slotEnd = Date.parse(rec.slot_end);
  let completedInWindow = false;
  let skipped = false;
  let completedSameDay = false;
  let focusedMs = 0;
  let plannedMinutes: number | null = null;
  let sawSession = false;
  let tzMismatch = false;
  const consider = (f: Fact) => {
    const tz = factTz(f);
    if (timezone !== null && tz !== null && tz !== timezone) tzMismatch = true;
  };
  for (const f of facts) {
    if (f.type === 'block_skipped' && f.recommendation_id === rec.id) {
      skipped = true;
      consider(f);
    }
    if (f.type === 'focus_end' && f.recommendation_id === rec.id) {
      consider(f);
      const started = ms(f.payload.started_at);
      const focused = num(f.payload.focused_ms) ?? 0;
      const planned = num(f.payload.planned_minutes);
      const finished = f.payload.outcome === 'finished';
      if (finished && f.local_day === rec.local_day) completedSameDay = true;
      if (started !== null && sessionInWindow(slotStart, started)) {
        sawSession = true;
        focusedMs += Math.max(focused, 0);
        if (planned !== null && planned > 0) plannedMinutes = planned;
        if (finished) completedInWindow = true;
      }
    }
    if (f.type === 'task_completed' && f.task_id === rec.task_id) {
      consider(f);
      const done = ms(f.payload.done_at) ?? ms(f.client_ts);
      if (f.local_day === rec.local_day) completedSameDay = true;
      const fromThisBlock = f.recommendation_id === rec.id;
      if (
        done !== null && (fromThisBlock || f.local_day === rec.local_day) &&
        completionInWindow(slotStart, slotEnd, done)
      ) {
        completedInWindow = true;
      }
    }
  }
  const planned = plannedMinutes ?? Math.max((slotEnd - slotStart) / MS_PER_MINUTE, 1);
  const fraction = sawSession ? Math.min(focusedMs / (planned * MS_PER_MINUTE), 1) : null;
  return { tzMismatch, completedInWindow, fraction, skipped, completedSameDay };
}

function tuple(
  rec: RewardRec,
  reward: number,
  reason: Reason,
  nowIso: string,
  source: Source,
  over: Partial<Tuple> = {},
  ambiguity: string | null = null,
): Tuple {
  // M-02: a completion that raced an external displacement is ambiguous → excluded, never guessed;
  // likewise a fact logged under another device zone (§3.4.2 "timezone change moving the day boundary")
  const excludedReason = rec.conflict_flag ? 'concurrent_external_conflict' : ambiguity;
  return {
    recommendation_id: rec.id,
    kind: 'outcome',
    reward,
    reason,
    category: rec.category,
    features: rec.features,
    excluded: excludedReason !== null,
    excluded_reason: excludedReason,
    attributed_at: nowIso,
    correction: false,
    source,
    ...over,
  };
}

/**
 * Instant outcome (rows 1–3, 6) or null when nothing instant applies yet. Precedence: an
 * in-window completion beats everything (facts beat plans — a skip followed by doing it is a
 * completion); then in-window session credit; then an explicit skip.
 */
export function instantOutcome(
  rec: RewardRec,
  facts: readonly Fact[],
  nowIso: string,
  timezone: string | null = null,
  /** true once the slot can no longer be resumed (daily mode, or now > slot_end + grace). */
  final = false,
): { tuple: Tuple; patch: RecPatch } | null {
  const o = observe(rec, facts, timezone);
  const ambiguity = o.tzMismatch ? 'timezone_mismatch' : null;
  if (o.completedInWindow || (o.fraction !== null && o.fraction >= PAR_MIN_FRACTION)) {
    return {
      tuple: tuple(rec, 1.0, 'completed', nowIso, 'instant', {}, ambiguity),
      patch: { id: rec.id, status: 'completed', attributed_at: nowIso },
    };
  }
  const resumable = !final && Date.parse(nowIso) <= Date.parse(rec.slot_end) + GRACE_MS;
  if (o.fraction !== null && !resumable) {
    // row 3: abandoned in-window below 50 % → r = f (linear, UC-06 A1); emitted only once the
    // block can no longer be resumed, so a restart inside the slot still reaches row 1/2
    // (adversarial #2); the block is not done
    return {
      tuple: tuple(rec, o.fraction, 'partial', nowIso, 'instant', {}, ambiguity),
      patch: { id: rec.id, attributed_at: nowIso },
    };
  }
  if (o.skipped) {
    return {
      tuple: tuple(rec, 0.0, 'skipped', nowIso, 'instant', {}, ambiguity),
      patch: { id: rec.id, status: 'rejected', attributed_at: nowIso },
    };
  }
  return null;
}

/** The 23:55 authority (rows 4–5), after re-checking the instant rows for late-synced facts. */
export function dailyOutcome(
  rec: RewardRec,
  facts: readonly Fact[],
  nowIso: string,
  timezone: string | null = null,
): { tuple: Tuple; patch: RecPatch } {
  const instant = instantOutcome(rec, facts, nowIso, timezone, true);
  if (instant !== null) return { ...instant, tuple: { ...instant.tuple, source: 'daily' } };
  const o = observe(rec, facts, timezone);
  const ambiguity = o.tzMismatch ? 'timezone_mismatch' : null;
  if (o.completedSameDay) {
    return {
      tuple: tuple(rec, REWARD_OFF_SLOT, 'off_slot', nowIso, 'daily', {}, ambiguity),
      patch: { id: rec.id, status: 'completed', attributed_at: nowIso },
    };
  }
  return {
    tuple: tuple(rec, 0.0, 'lapsed', nowIso, 'daily', {}, ambiguity),
    patch: { id: rec.id, status: 'lapsed', attributed_at: nowIso },
  };
}

/** UC-07 paired tuples: origin context (0.1) + target context (0.7); the placement moves. */
export function overridePair(
  rec: RewardRec,
  target: OverrideTarget,
  nowIso: string,
): { tuples: [Tuple, Tuple]; patch: RecPatch } {
  const out = tuple(rec, REWARD_OVERRIDE_OUT, 'override_out', nowIso, 'instant', {
    kind: 'override_out',
  });
  const inn = tuple(rec, REWARD_OVERRIDE_IN, 'override_in', nowIso, 'instant', {
    kind: 'override_in',
    features: target.features,
  });
  return {
    tuples: [out, inn],
    patch: {
      id: rec.id,
      status: 'moved',
      slot_start: target.to_start,
      slot_end: target.to_end,
      context_bucket: target.context_bucket,
      features: target.features,
    },
  };
}

/**
 * UC-04 A1 "actually did it". With a stored `lapsed` tuple inside the correction window the
 * tuple is REPLACED (r = 1.0, `correction = true` → full rebuild, invariant 6); the evidence
 * keeps the original `attributed_at` so Beta decay stays as of the block's day. Before the daily
 * job ran (no stored outcome) the assertion is an instant completion. After the window: frozen
 * (null) — the fact stays in `events` for audit.
 */
export function correction(
  rec: RewardRec,
  stored: StoredTuple | undefined,
  nowIso: string,
): { tuple: Tuple; patch: RecPatch } | null {
  if (stored === undefined) {
    return {
      tuple: tuple(rec, 1.0, 'completed', nowIso, 'instant'),
      patch: { id: rec.id, status: 'completed', attributed_at: nowIso },
    };
  }
  if (!UPGRADABLE.has(stored.reason) || stored.excluded) return null;
  if (!insideWindow(stored, nowIso)) return null;
  return {
    tuple: tuple(rec, 1.0, 'completed', stored.attributed_at, 'correction', { correction: true }),
    patch: { id: rec.id, status: 'completed' },
  };
}

/** Stored outcomes that later facts may rewrite in place (adversarial #1/#2/#13). */
const UPGRADABLE: ReadonlySet<Reason> = new Set<Reason>(['lapsed', 'off_slot', 'partial']);

function insideWindow(stored: StoredTuple, nowIso: string): boolean {
  const ageMs = Date.parse(nowIso) - Date.parse(stored.attributed_at);
  return ageMs <= CORRECTION_WINDOW_DAYS * 86_400_000;
}

/**
 * Facts that arrive AFTER the daily job (offline overnight — File 05 §2's common case) or after
 * a row-3 partial: a strictly better instant outcome rewrites the stored tuple through the
 * correction path (r, reason, `correction = true` → rebuild), keeping the original
 * `attributed_at` for decay. Never downgrades; never touches excluded or corrected rows.
 */
export function upgrade(
  rec: RewardRec,
  stored: StoredTuple,
  facts: readonly Fact[],
  nowIso: string,
  timezone: string | null,
): { tuple: Tuple; patch: RecPatch } | null {
  if (stored.excluded || stored.corrected_at !== null || !UPGRADABLE.has(stored.reason)) {
    return null;
  }
  if (!insideWindow(stored, nowIso)) return null;
  const fresh = instantOutcome(rec, facts, nowIso, timezone, true);
  if (fresh === null || fresh.tuple.excluded || fresh.tuple.reward <= stored.reward) return null;
  return {
    tuple: {
      ...fresh.tuple,
      attributed_at: stored.attributed_at,
      correction: true,
      source: 'correction',
    },
    patch: fresh.patch.status ? { id: rec.id, status: fresh.patch.status } : { id: rec.id },
  };
}

/**
 * One user's mapping pass. `recs` are the candidate placements (instant: those referenced by
 * the facts; daily: `attribution_due`), `facts` the user's reward-bearing events in the window,
 * `stored` the tuples already written. Idempotent by construction: an existing (rec, kind) is
 * never re-emitted except as a correction; an existing override pair blocks a second one.
 * `targets` resolves a `block_moved` fact to its target context (computed by the caller with
 * the grid/feature modules — the client never computes features, invariant 1).
 */
export function mapUser(input: {
  mode: Mode;
  recs: readonly RewardRec[];
  facts: readonly Fact[];
  stored: readonly StoredTuple[];
  nowIso: string;
  /** Target context of each rec's LATEST `block_moved` fact (null when the slot has no bucket). */
  targets: ReadonlyMap<string, OverrideTarget | null>;
  /** Profile zone — facts logged under another device zone make the outcome ambiguous. */
  timezone?: string | null;
  /** Attribution day of an instant in the profile zone (for a bucket-less move). */
  localDayOf?: (ms: number) => string;
}): MappingResult {
  const timezone = input.timezone ?? null;
  const tuples: Tuple[] = [];
  const patches: RecPatch[] = [];
  const storedBy = new Map<string, StoredTuple>();
  for (const s of input.stored) storedBy.set(`${s.recommendation_id}|${s.kind}`, s);
  const factsByRec = new Map<string, Fact[]>();
  const factsByTaskDay = new Map<string, Fact[]>();
  for (const f of input.facts) {
    if (f.recommendation_id !== null) {
      factsByRec.set(f.recommendation_id, [...(factsByRec.get(f.recommendation_id) ?? []), f]);
    }
    if (f.task_id !== null) {
      const k = `${f.task_id}|${f.local_day}`;
      factsByTaskDay.set(k, [...(factsByTaskDay.get(k) ?? []), f]);
    }
  }
  for (let rec of input.recs) {
    if (
      rec.status === 'displaced' || rec.status === 'displaced_pending' || rec.status === 'expired'
    ) {
      continue; // no reward, ever (File 05 §1; M-02)
    }
    const own = factsByRec.get(rec.id) ?? [];

    // overrides first: the LATEST move always moves the placement (adversarial #4/#5); the paired
    // tuples are written once per placement; a later outcome attaches to the new context (#3)
    const moves = own
      .filter((f) => f.type === 'block_moved')
      .sort((a, b) => a.client_ts.localeCompare(b.client_ts));
    const move = moves[moves.length - 1];
    if (move !== undefined) {
      const toStartMs = ms(move.payload.to_start);
      const toEndMs = ms(move.payload.to_end);
      if (toStartMs !== null && toEndMs !== null && toEndMs > toStartMs) {
        const toStart = new Date(toStartMs).toISOString();
        const toEnd = new Date(toEndMs).toISOString();
        const target: OverrideTarget | null = input.targets.get(rec.id) ?? null;
        const hasPair = storedBy.has(`${rec.id}|override_out`);
        const alreadyThere = Date.parse(rec.slot_start) === toStartMs &&
          Date.parse(rec.slot_end) === toEndMs;
        if (!hasPair && target !== null) {
          const pair = overridePair(rec, target, input.nowIso);
          tuples.push(...pair.tuples);
          patches.push(pair.patch);
        } else if (!alreadyThere) {
          patches.push({
            id: rec.id,
            status: 'moved',
            slot_start: toStart,
            slot_end: toEnd,
            ...(target === null
              ? {}
              : { context_bucket: target.context_bucket, features: target.features }),
          });
        }
        if (!alreadyThere || (!hasPair && target !== null)) {
          rec = {
            ...rec,
            status: 'moved',
            slot_start: toStart,
            slot_end: toEnd,
            context_bucket: target?.context_bucket ?? rec.context_bucket,
            features: target?.features ?? rec.features,
            local_day: target?.local_day ?? input.localDayOf?.(toEndMs) ?? rec.local_day,
          };
        }
      }
    }

    const sameDay = factsByTaskDay.get(`${rec.task_id}|${rec.local_day}`) ?? [];
    const facts = [...own, ...sameDay.filter((f) => !own.includes(f))];

    const outcome = storedBy.get(`${rec.id}|outcome`);
    if (own.some((f) => f.type === 'lapse_corrected')) {
      if (outcome === undefined || outcome.corrected_at === null) {
        const c = correction(rec, outcome, input.nowIso);
        if (c !== null) {
          tuples.push(c.tuple);
          patches.push(c.patch);
        }
      }
      continue;
    }
    if (outcome !== undefined) {
      // already attributed: late-synced facts may still upgrade a lapse / off-slot / partial (#1, #2)
      const u = upgrade(rec, outcome, facts, input.nowIso, timezone);
      if (u !== null) {
        tuples.push(u.tuple);
        patches.push(u.patch);
      }
      continue;
    }
    const result = input.mode === 'daily'
      ? dailyOutcome(rec, facts, input.nowIso, timezone)
      : instantOutcome(rec, facts, input.nowIso, timezone);
    if (result !== null) {
      tuples.push(result.tuple);
      patches.push(result.patch);
    }
  }
  return { tuples, patches };
}

// --- UC-06 A2 duration estimator (EWMA per (user, category), fixed by ADR-0010) ---------------

export interface DurationEstimate {
  ewma_ratio: number;
  n: number;
}

function clip(v: number, [lo, hi]: readonly [number, number]): number {
  return Math.min(Math.max(v, lo), hi);
}

/** One FINISHED session: ratio = focused / estimated minutes, clipped, into the EWMA. */
export function updateDurationEstimate(
  prev: DurationEstimate | null,
  focusedMinutes: number,
  estMinutes: number,
): DurationEstimate {
  if (!(focusedMinutes > 0) || !(estMinutes > 0)) return prev ?? { ewma_ratio: 1, n: 0 };
  const r = clip(focusedMinutes / estMinutes, DURATION_SAMPLE_CLIP);
  if (prev === null || prev.n === 0) return { ewma_ratio: r, n: 1 };
  return {
    ewma_ratio: (1 - DURATION_EWMA_ALPHA) * prev.ewma_ratio + DURATION_EWMA_ALPHA * r,
    n: prev.n + 1,
  };
}

/** The estimate the planner uses (both engines): scaled once n ≥ 3, else the user's own number. */
export function effectiveEstMinutes(estMinutes: number, est: DurationEstimate | null): number {
  if (est === null || est.n < DURATION_MIN_SESSIONS) return estMinutes;
  return Math.max(Math.round(estMinutes * clip(est.ewma_ratio, DURATION_RATIO_CLIP)), 5);
}
