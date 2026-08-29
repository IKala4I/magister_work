/**
 * Plan Adherence Rate — the study's primary outcome (File 06 §1.4), as pre-registered code
 * (spec-conflicts H2): computed from FACTS (`events`) and PLACEMENTS (`recommendations`) only,
 * never from `feedback_rewards`. Per block PAR ∈ {0, 1}: a focus session started within
 * ±PAR_GRACE_MINUTES of the slot start AND finished — or ≥ PAR_MIN_FRACTION of the planned
 * minutes focused across in-window sessions. Blocks displaced by an external calendar conflict
 * are excluded from the denominator (File 06 §1.4 confound rule; M-02 statuses), as are rows a
 * later plan superseded before their slot (`expired` — never shown as a live commitment).
 *
 * The two constants are the ONLY thing this module shares with the reward mapping
 * (`rewards.ts`): `par_test.ts` asserts the source touches no reward column. P9 renders the
 * weekly series in the Insights tab (FR-33 "adherence stats"); P11's analysis reuses the same
 * per-block rule.
 */
import { wallClock } from './grid.ts';
import { PAR_GRACE_MINUTES, PAR_MIN_FRACTION } from './params.ts';

export interface ParBlock {
  id: string;
  /** ISO instants. */
  slot_start: string;
  slot_end: string;
  status: string;
}

export interface ParFact {
  type: string;
  recommendation_id: string | null;
  payload: Record<string, unknown>;
}

export interface AdherenceWeek {
  /** ISO-8601 week of the slot start in the user's zone, e.g. `2026-W35`. */
  week: string;
  par: number;
  /** Blocks in the denominator. */
  n: number;
}

/** M-02 displaced rows (no reward, no adherence) and superseded rows never count. */
export const PAR_SKIPPED_STATUSES = ['displaced', 'displaced_pending', 'expired'] as const;

const MS_PER_MINUTE = 60_000;
const GRACE_MS = PAR_GRACE_MINUTES * MS_PER_MINUTE;

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** File 06 §1.4 per-block rule over the block's own `focus_end` facts. */
export function parOfBlock(block: ParBlock, facts: readonly ParFact[]): 0 | 1 {
  const slotStart = Date.parse(block.slot_start);
  const slotEnd = Date.parse(block.slot_end);
  const planned = Math.max((slotEnd - slotStart) / MS_PER_MINUTE, 1);
  let focusedMs = 0;
  let plannedMinutes: number | null = null;
  for (const f of facts) {
    if (f.type !== 'focus_end' || f.recommendation_id !== block.id) continue;
    const started = typeof f.payload.started_at === 'string'
      ? Date.parse(f.payload.started_at)
      : NaN;
    if (!Number.isFinite(started) || Math.abs(started - slotStart) > GRACE_MS) continue;
    if (f.payload.outcome === 'finished') return 1;
    focusedMs += Math.max(num(f.payload.focused_ms) ?? 0, 0);
    const p = num(f.payload.planned_minutes);
    if (p !== null && p > 0) plannedMinutes = p;
  }
  return focusedMs / ((plannedMinutes ?? planned) * MS_PER_MINUTE) >= PAR_MIN_FRACTION ? 1 : 0;
}

/** ISO-8601 week label of an instant's LOCAL date (weeks start Monday; week 1 holds Jan 4). */
export function isoWeek(ms: number, timezone: string): string {
  const wc = wallClock(ms, timezone);
  const d = new Date(Date.UTC(wc.year, wc.month - 1, wc.day));
  const dayNum = d.getUTCDay() || 7; // Mon = 1 … Sun = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // the Thursday of this ISO week
  const isoYear = d.getUTCFullYear();
  const yearStart = Date.UTC(isoYear, 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/**
 * Weekly PAR over the blocks whose slot has ended by `nowMs` (a block still open is not yet an
 * adherence outcome), most recent `weeks` weeks with at least one block, oldest first.
 */
export function weeklyPar(
  blocks: readonly ParBlock[],
  facts: readonly ParFact[],
  timezone: string,
  nowMs: number,
  weeks = 8,
): AdherenceWeek[] {
  const acc = new Map<string, { hit: number; n: number }>();
  for (const b of blocks) {
    if ((PAR_SKIPPED_STATUSES as readonly string[]).includes(b.status)) continue;
    const end = Date.parse(b.slot_end);
    if (!Number.isFinite(end) || end > nowMs) continue;
    const week = isoWeek(Date.parse(b.slot_start), timezone);
    const cur = acc.get(week) ?? { hit: 0, n: 0 };
    cur.hit += parOfBlock(b, facts);
    cur.n += 1;
    acc.set(week, cur);
  }
  const sorted = [...acc.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return sorted
    .slice(Math.max(sorted.length - weeks, 0)) // not slice(-weeks): slice(-0) keeps everything
    .map(([week, { hit, n }]) => ({ week, par: Math.round((hit / n) * 1000) / 1000, n }));
}
