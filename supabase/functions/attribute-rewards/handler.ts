/**
 * `attribute-rewards` — the two-phase feedback pipeline's server half (specs/07 §3.5; File 05 §1):
 *
 *   mode = 'instant'  (user JWT, or backend key + user_id)   rows 1–3, 6, 8–9, corrections, the
 *                      UC-06 A2 duration estimator — run right after the client pushed its facts;
 *   mode = 'daily'    (backend key; pg_cron every 15 min)     the 23:55-local authority for rows
 *                      4–5 over `attribution_due()`, plus re-delivery of undelivered tuples.
 *
 * Facts → tuples is the pure `_shared/rewards.ts`; this file orchestrates reads, writes, the
 * /feedback delivery and the override-target computation. Dependency-injected so
 * `handler_test.ts` covers every branch without a database or a network. P8's `sync-resolve`
 * calls `processUser` after op replay instead of the client calling this function.
 */
import type { BetaCell } from '../_shared/energy.ts';
import type { BusyInterval, WorkingHours } from '../_shared/grid.ts';
import { wallClock } from '../_shared/grid.ts';
import {
  type DurationEstimate,
  type Fact,
  type Kind,
  mapUser,
  type Mode,
  type OverrideTarget,
  type RecPatch,
  REWARD_FACT_TYPES,
  type RewardRec,
  type StoredTuple,
  type Tuple,
  updateDurationEstimate,
} from '../_shared/rewards.ts';
import type { Category } from '../_shared/types.ts';
import type { FeedbackCall, WireTuple } from './feedback.ts';
import { targetContext } from './override.ts';

export interface Profile {
  timezone: string;
  working_hours: WorkingHours;
  sleep_window: readonly [number, number] | null;
}

/** A `recommendations` row as read (category joined from tasks); `local_day` is derived here. */
export interface RecRow {
  id: string;
  user_id: string;
  task_id: string;
  category: Category;
  slot_start: string;
  slot_end: string;
  context_bucket: string;
  features: number[];
  status: string;
  conflict_flag: boolean;
  attributed_at: string | null;
}

export interface TaskAttrs {
  category: Category;
  value: number;
  est_minutes: number;
  splittable: boolean;
  deadline: string | null;
  postpone_count: number;
}

export interface StoredDuration extends DurationEstimate {
  last_session_at: string | null;
}

export type TupleKey = readonly [recommendationId: string, kind: Kind];

export interface Deps {
  now(): number;
  verifyUser(token: string): Promise<string | null>;
  /** The shared backend key (HOURWELL_SERVICE_KEY); null = backend calls are refused. */
  serviceKey: string | null;
  loadProfile(userId: string): Promise<Profile | null>;
  loadFacts(userId: string, sinceIso: string): Promise<Fact[]>;
  loadRecs(userId: string, ids: readonly string[]): Promise<RecRow[]>;
  /** Recommendations of the given tasks overlapping [fromIso, toIso]. */
  loadRecsForTasks(
    userId: string,
    taskIds: readonly string[],
    fromIso: string,
    toIso: string,
  ): Promise<RecRow[]>;
  /** Every non-expired recommendation overlapping [fromIso, toIso] (override-target occupancy). */
  loadRecsInRange(userId: string, fromIso: string, toIso: string): Promise<RecRow[]>;
  /** P8: the user's `displaced_pending` rows — instant-mode candidates even without facts. */
  loadDisplacedPending(userId: string): Promise<RecRow[]>;
  loadDue(nowIso: string, limit: number): Promise<Array<RecRow & { timezone: string }>>;
  loadStored(userId: string, recIds: readonly string[]): Promise<StoredTuple[]>;
  loadUndelivered(userId: string): Promise<Array<WireTuple & { source: string }>>;
  loadUndeliveredUsers(limit: number): Promise<string[]>;
  loadCells(userId: string): Promise<BetaCell[]>;
  loadTask(userId: string, taskId: string): Promise<TaskAttrs | null>;
  loadBusy(userId: string, fromIso: string, toIso: string): Promise<BusyInterval[]>;
  writeTuples(userId: string, tuples: readonly Tuple[]): Promise<void>;
  patchRecs(userId: string, patches: readonly RecPatch[]): Promise<RecRow[]>;
  postFeedback(userId: string, tuples: readonly WireTuple[]): Promise<FeedbackCall>;
  markDelivered(userId: string, keys: readonly TupleKey[], atIso: string): Promise<void>;
  loadDurationEstimates(userId: string): Promise<Partial<Record<Category, StoredDuration>>>;
  saveDurationEstimate(
    userId: string,
    category: Category,
    estimate: DurationEstimate,
    lastSessionAtIso: string,
  ): Promise<void>;
}

export interface UserReport {
  user_id: string;
  facts: number;
  tuples_written: number;
  patches: number;
  delivered: number;
  delivery: FeedbackCall['kind'] | 'nothing_pending';
  duration_updates: number;
  recommendations: RecRow[];
}

const JSON_HEADERS = { 'content-type': 'application/json' };
const FACT_WINDOW_DAYS = 8; // correction window (7 d) + one day of clock slack
const DAY_MS = 86_400_000;
const DUE_LIMIT = 500;
const UNDELIVERED_USERS_LIMIT = 100;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Attribution day of an instant in the profile zone (wall clock, like the client's localDayOf). */
export function localDayOf(ms: number, timezone: string): string {
  const wc = wallClock(ms, timezone);
  return `${wc.year}-${pad(wc.month)}-${pad(wc.day)}`;
}

function toRewardRec(row: RecRow, timezone: string): RewardRec {
  return { ...row, local_day: localDayOf(Date.parse(row.slot_end), timezone) };
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function overrideTargets(
  deps: Deps,
  userId: string,
  profile: Profile,
  recs: readonly RewardRec[],
  facts: readonly Fact[],
  stored: readonly StoredTuple[],
  nowMs: number,
): Promise<Map<string, OverrideTarget | null>> {
  const targets = new Map<string, OverrideTarget | null>();
  const hasPair = new Set(
    stored.filter((s) => s.kind === 'override_out').map((s) => s.recommendation_id),
  );
  // the LATEST move per rec decides the placement (adversarial #5); facts arrive sorted by client_ts
  const latest = new Map<string, Fact>();
  for (const f of facts) {
    if (f.type === 'block_moved' && f.recommendation_id !== null) {
      latest.set(f.recommendation_id, f);
    }
  }
  if (latest.size === 0) return targets;
  const cells = await deps.loadCells(userId);
  for (const move of latest.values()) {
    const rec = recs.find((r) => r.id === move.recommendation_id);
    if (rec === undefined) continue;
    const toStart = Date.parse(String(move.payload.to_start));
    const toEnd = Date.parse(String(move.payload.to_end));
    if (!Number.isFinite(toStart) || !Number.isFinite(toEnd) || toEnd <= toStart) continue;
    const alreadyThere = Date.parse(rec.slot_start) === toStart &&
      Date.parse(rec.slot_end) === toEnd;
    if (alreadyThere && hasPair.has(rec.id)) continue; // nothing left to do for this move
    const task = await deps.loadTask(userId, rec.task_id);
    if (task === null) continue;
    const from = new Date(toStart - DAY_MS).toISOString();
    const to = new Date(toEnd + DAY_MS).toISOString();
    const [busy, dayRecs] = await Promise.all([
      deps.loadBusy(userId, from, to),
      deps.loadRecsInRange(userId, from, to),
    ]);
    const target = targetContext({
      timezone: profile.timezone,
      workingHours: profile.working_hours,
      sleepWindow: profile.sleep_window,
      busy,
      // committed blocks only (ADR-0010 §6): open placements and completed ones; not lapsed,
      // rejected, displaced or expired rows (adversarial #19)
      otherBlocks: dayRecs
        .filter((r) =>
          r.id !== rec.id &&
          ['shown', 'accepted', 'pinned', 'moved', 'completed'].includes(r.status)
        )
        .map((r) => ({ startMs: Date.parse(r.slot_start), endMs: Date.parse(r.slot_end) })),
      task,
      cells,
      toStartMs: toStart,
      toEndMs: toEnd,
      nowMs,
    });
    targets.set(rec.id, target); // null = no bucket at the target (before 06:00): move only
  }
  return targets;
}

async function updateDurations(
  deps: Deps,
  userId: string,
  recs: readonly RewardRec[],
  facts: readonly Fact[],
): Promise<number> {
  const sessions = facts
    .filter((f) => f.type === 'focus_end' && f.payload.outcome === 'finished')
    .sort((a, b) => a.client_ts.localeCompare(b.client_ts));
  if (sessions.length === 0) return 0;
  const current = await deps.loadDurationEstimates(userId);
  const next = new Map<Category, { est: DurationEstimate; last: string }>();
  for (const s of sessions) {
    const rec = recs.find((r) => r.id === s.recommendation_id);
    if (rec === undefined) continue;
    const prev = next.get(rec.category) ??
      (current[rec.category]
        ? { est: current[rec.category]!, last: current[rec.category]!.last_session_at ?? '' }
        : { est: { ewma_ratio: 1, n: 0 }, last: '' });
    if (s.client_ts <= prev.last) continue; // already folded in (monotone marker)
    const focusedMinutes = Number(s.payload.focused_ms ?? 0) / 60_000;
    const estMinutes = Number(s.payload.est_minutes ?? 0);
    const est = updateDurationEstimate(
      prev.est.n === 0 ? null : prev.est,
      focusedMinutes,
      estMinutes,
    );
    next.set(rec.category, { est, last: s.client_ts });
  }
  let n = 0;
  for (const [category, v] of next) {
    const before = current[category];
    if (before && before.n === v.est.n && before.last_session_at === v.last) continue;
    await deps.saveDurationEstimate(userId, category, v.est, v.last);
    n++;
  }
  return n;
}

async function deliverPending(deps: Deps, userId: string, nowIso: string): Promise<
  { delivered: number; delivery: UserReport['delivery'] }
> {
  const pending = await deps.loadUndelivered(userId);
  if (pending.length === 0) return { delivered: 0, delivery: 'nothing_pending' };
  const wire = pending.map(({ source: _s, ...t }) => t);
  const call = await deps.postFeedback(userId, wire);
  if (call.kind !== 'ok') return { delivered: 0, delivery: call.kind };
  await deps.markDelivered(userId, wire.map((t) => [t.recommendation_id, t.kind] as const), nowIso);
  return { delivered: wire.length, delivery: 'ok' };
}

async function gatePatches(
  deps: Deps,
  userId: string,
  result: { tuples: Tuple[]; patches: RecPatch[] },
): Promise<RecPatch[]> {
  if (result.patches.length === 0) return [];
  const withTuples = new Set(result.tuples.map((t) => t.recommendation_id));
  const needCheck = result.patches.filter((p) => withTuples.has(p.id));
  if (needCheck.length === 0) return result.patches; // move-only patches carry no tuple
  const stored = await deps.loadStored(userId, [...withTuples]);
  const ok = new Set<string>();
  for (const t of result.tuples) {
    const row = stored.find((s) =>
      s.recommendation_id === t.recommendation_id && s.kind === t.kind
    );
    if (row === undefined) continue;
    const same = row.reason === t.reason && Math.abs(row.reward - t.reward) < 1e-9;
    const corrected = !t.correction || row.corrected_at !== null;
    if (same && corrected) ok.add(t.recommendation_id);
  }
  return result.patches.filter((p) => !withTuples.has(p.id) || ok.has(p.id));
}

/** One user's pass. `dueRecs` is set in daily mode (the `attribution_due` slice for the user). */
export async function processUser(
  deps: Deps,
  userId: string,
  mode: Mode,
  dueRecs: readonly RecRow[] | null,
): Promise<UserReport | null> {
  const nowMs = deps.now();
  const nowIso = new Date(nowMs).toISOString();
  const profile = await deps.loadProfile(userId);
  if (profile === null) return null;
  const tz = profile.timezone;

  const sinceMs = dueRecs !== null && dueRecs.length > 0
    ? Math.min(...dueRecs.map((r) => Date.parse(r.slot_end))) - DAY_MS
    : nowMs - FACT_WINDOW_DAYS * DAY_MS;
  const facts = (await deps.loadFacts(userId, new Date(sinceMs).toISOString()))
    .filter((f) => (REWARD_FACT_TYPES as readonly string[]).includes(f.type));

  // candidate placements: the due slice (daily) ∪ everything the facts point at (both modes)
  const byId = new Map<string, RecRow>();
  for (const r of dueRecs ?? []) byId.set(r.id, r);
  const recIds = [
    ...new Set(facts.map((f) => f.recommendation_id).filter((v): v is string => v !== null)),
  ]
    .filter((id) => !byId.has(id));
  if (recIds.length > 0) { for (const r of await deps.loadRecs(userId, recIds)) byId.set(r.id, r); }
  if (mode === 'instant') {
    // P8 (File 05 §2): pending displacements resolve at sync time — facts beat plans, or, once
    // the slot is past, `displaced` with no reward (ADR-0012 §9); daily mode gets them via
    // attribution_due
    for (const r of await deps.loadDisplacedPending(userId)) {
      if (!byId.has(r.id)) byId.set(r.id, r);
    }
  }
  const completions = facts.filter((f) => f.type === 'task_completed' && f.task_id !== null);
  if (completions.length > 0) {
    const taskIds = [...new Set(completions.map((f) => f.task_id as string))];
    const from = new Date(Math.min(...completions.map((f) => Date.parse(f.client_ts))) - 2 * DAY_MS)
      .toISOString();
    const to = new Date(nowMs + DAY_MS).toISOString();
    for (const r of await deps.loadRecsForTasks(userId, taskIds, from, to)) {
      if (!byId.has(r.id)) byId.set(r.id, r);
    }
  }
  const recs = [...byId.values()].map((r) => toRewardRec(r, tz));
  if (recs.length === 0 && facts.length === 0) {
    const d = await deliverPending(deps, userId, nowIso);
    return {
      user_id: userId,
      facts: 0,
      tuples_written: 0,
      patches: 0,
      ...d,
      duration_updates: 0,
      recommendations: [],
    };
  }
  const stored = await deps.loadStored(userId, recs.map((r) => r.id));
  const targets = await overrideTargets(deps, userId, profile, recs, facts, stored, nowMs);
  // in daily mode only the due slice is finalised; facts-referenced rows still get instant rows
  const dueIds = new Set((dueRecs ?? []).map((r) => r.id));
  const common = {
    facts,
    stored,
    nowIso,
    targets,
    timezone: tz,
    localDayOf: (ms: number) => localDayOf(ms, tz),
  };
  const result = mode === 'daily'
    ? (() => {
      const due = mapUser({ mode: 'daily', recs: recs.filter((r) => dueIds.has(r.id)), ...common });
      const rest = mapUser({
        mode: 'instant',
        recs: recs.filter((r) => !dueIds.has(r.id)),
        ...common,
      });
      return {
        tuples: [...due.tuples, ...rest.tuples],
        patches: [...due.patches, ...rest.patches],
      };
    })()
    : mapUser({ mode, recs, ...common });

  if (result.tuples.length > 0) await deps.writeTuples(userId, result.tuples);
  // A concurrent pass (the daily sweep vs an instant call) may have won the (rec, kind) insert:
  // patch a row only when the tuple now stored is the one THIS pass computed (adversarial #6).
  const allowed = await gatePatches(deps, userId, result);
  const updatedRows = allowed.length > 0 ? await deps.patchRecs(userId, allowed) : [];
  const durationUpdates = mode === 'instant' ? await updateDurations(deps, userId, recs, facts) : 0;
  const d = await deliverPending(deps, userId, nowIso);
  return {
    user_id: userId,
    facts: facts.length,
    tuples_written: result.tuples.length,
    patches: result.patches.length,
    ...d,
    duration_updates: durationUpdates,
    recommendations: updatedRows,
  };
}

function bearer(req: Request): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '');
  return m === null ? null : m[1].trim();
}

export async function handleAttributeRewards(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  let body: Record<string, unknown>;
  try {
    const raw = await req.json();
    if (typeof raw !== 'object' || raw === null) return json(400, { error: 'bad_request' });
    body = raw as Record<string, unknown>;
  } catch {
    return json(400, { error: 'bad_request', detail: 'invalid JSON' });
  }
  const mode = body.mode === 'daily' ? 'daily' : body.mode === 'instant' ? 'instant' : null;
  if (mode === null) {
    return json(400, { error: 'bad_request', detail: 'mode must be instant or daily' });
  }

  const key = req.headers.get('x-service-key');
  const backend = key !== null && deps.serviceKey !== null &&
    constantTimeEqual(key, deps.serviceKey);

  if (mode === 'daily') {
    if (!backend) return json(401, { error: 'unauthorized' });
    const nowIso = new Date(deps.now()).toISOString();
    const due = await deps.loadDue(nowIso, DUE_LIMIT);
    const byUser = new Map<string, RecRow[]>();
    for (const r of due) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);
    for (const u of await deps.loadUndeliveredUsers(UNDELIVERED_USERS_LIMIT)) {
      if (!byUser.has(u)) byUser.set(u, []);
    }
    const reports: UserReport[] = [];
    for (const [userId, recs] of byUser) {
      const r = await processUser(deps, userId, 'daily', recs);
      if (r !== null) reports.push(r);
    }
    return json(200, {
      mode,
      due: due.length,
      users: reports.length,
      tuples_written: reports.reduce((s, r) => s + r.tuples_written, 0),
      delivered: reports.reduce((s, r) => s + r.delivered, 0),
      reports: reports.map(({ recommendations: _r, ...rest }) => rest),
    });
  }

  let userId: string | null = null;
  if (backend) {
    if (typeof body.user_id !== 'string' || body.user_id.length === 0) {
      return json(400, { error: 'bad_request', detail: 'user_id required with the backend key' });
    }
    userId = body.user_id;
  } else {
    const token = bearer(req);
    if (token === null) return json(401, { error: 'unauthorized' });
    userId = await deps.verifyUser(token);
    if (userId === null) return json(401, { error: 'unauthorized' });
  }
  const report = await processUser(deps, userId, 'instant', null);
  if (report === null) return json(404, { error: 'profile_not_found' });
  return json(200, { mode, ...report });
}
