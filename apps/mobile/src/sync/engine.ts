/**
 * The sync engine (File 05 §2; NFR-R1; ADR-0012 §1/§3/§4/§6) — the ONLY network writer on the
 * client from P8 on (the P4/P6/P7 bridges are gone):
 *
 *   push   unacked ops in `seq` order (≤ 200 per batch, the signed-in identity only) →
 *          `sync-resolve` (replay → instant rewards → pull in one round trip, EU region pinned);
 *   acks   applied/duplicate/superseded → acked; conflict → field-level merge (src/sync/merge.ts),
 *          the entity's queued ops collapse into ONE rewritten op (full row, base_version =
 *          server version) and replay next round; rejected → dead-lettered at once; error →
 *          retried, dead-lettered after 5 attempts (Sentry gets the op id);
 *   pull   applied in one transaction (src/sync/pull.ts), cursor = max server_seq (MMKV).
 *
 * Single-flight with one coalesced follow-up; triggers (wireSync): foreground, 2 s after any
 * local write, network reconnect, a 60 s poll while active, and before every plan request.
 * Offline is simply "nothing pushed" — the outbox waits (NFR-R1).
 *
 * Hardening from the P8 adversarial pass: a `busy` lease (409) schedules ONE debounced retry
 * (#5); a backlog larger than one batch drains within the same sync, bounded by MAX_ROUNDS (#6);
 * `run()` has an error boundary — the store never sticks in `syncing` (#7); a dead-lettered
 * entity is re-read from the server so the device is not left stale (#8); `applied` acks adopt
 * the server's `version`/`server_seq` locally when no later op owns the entity (#13).
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';
import * as Network from 'expo-network';
import { AppState } from 'react-native';

import { supabase } from '../auth/client';
import { readSession } from '../auth/readSession';
import { db } from '../db/client';
import { events, opOutbox, profiles, tasks } from '../db/schema';
import type { TaskRow } from '../db/tasks';
import type { LocalDb } from '../db/writes';
import { track } from '../observability/analytics';
import { Sentry } from '../observability/sentry';
import { useSyncStore } from '../state/sync';
import { appStorage, StorageKeys } from '../storage/mmkv';

import { advanceSyncCursor, getSyncCursor } from './cursor';
import { invokeFunction } from './invoke';
import {
  mergeProfile,
  mergeTask,
  type LocalTaskPayload,
  type ServerProfile,
  type ServerTask,
} from './merge';
import { getDeviceId } from './opId';
import { applyPull, type PullReport } from './pull';
import type { OpAck, PullRow, SyncOp, SyncReason, SyncRequestBody, SyncResponse } from './types';

export const MAX_OPS_PER_BATCH = 200;
export const MAX_ROUNDS = 3;
export const MAX_ATTEMPTS = 5;
export const WRITE_DEBOUNCE_MS = 2_000;
export const POLL_INTERVAL_MS = 60_000;
/** A pre-plan sync is skipped when nothing is pending and the last pull is this fresh. */
export const PRE_PLAN_FRESH_MS = 30_000;

export type SyncOutcome =
  | { kind: 'synced'; pushed: number; pulled: number; conflicts: number; rounds: number }
  | { kind: 'skipped' }
  | { kind: 'no-session' }
  | { kind: 'offline' }
  | { kind: 'busy' }
  | { kind: 'failed'; detail: string };

type OutboxRow = typeof opOutbox.$inferSelect;
type OpType = OutboxRow['opType'];

let inFlight: Promise<SyncOutcome> | null = null;
let followUp: SyncReason | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
/** The current run is the one debounced retry after a `busy` lease (adversarial #5). */
let retryingBusy = false;

export function isSyncInFlight(): boolean {
  return inFlight !== null;
}

export function lastSyncAt(): number | null {
  return appStorage.getNumber(StorageKeys.lastSyncAt) ?? null;
}

/** Unacked ops of one identity (payloads without a user_id — status ops — belong to the caller). */
export function pendingOpsFor(
  localDb: LocalDb,
  userId: string,
  limit = MAX_OPS_PER_BATCH,
): OutboxRow[] {
  const rows = localDb
    .select()
    .from(opOutbox)
    .where(isNull(opOutbox.ackedAt))
    .orderBy(opOutbox.seq)
    .all() as OutboxRow[];
  return rows
    .filter((op) => {
      const uid = (op.payload as { user_id?: unknown } | null)?.user_id;
      return typeof uid !== 'string' || uid === userId;
    })
    .slice(0, limit);
}

export function pendingOpCount(localDb: LocalDb, userId: string): number {
  return pendingOpsFor(localDb, userId, Number.MAX_SAFE_INTEGER).length;
}

function toWire(op: OutboxRow): SyncOp {
  return {
    op_id: op.opId,
    op_type: op.opType,
    entity_id: op.entityId,
    base_version: op.baseVersion,
    payload: op.payload as Record<string, unknown>,
  };
}

/** Sync now (single-flight; a second caller while running gets one coalesced follow-up). */
export function syncNow(reason: SyncReason): Promise<SyncOutcome> {
  if (inFlight) {
    if (reason !== 'poll') followUp = reason;
    return inFlight;
  }
  inFlight = run(reason).finally(() => {
    inFlight = null;
    const next = followUp;
    followUp = null;
    if (next !== null) void syncNow(next);
  });
  return inFlight;
}

/** Debounced sync after a local write — many taps, one round trip. */
export function scheduleSync(reason: SyncReason = 'write'): void {
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void syncNow(reason);
  }, WRITE_DEBOUNCE_MS);
}

/** Before a plan request: push what the device knows unless everything is already fresh. */
export async function syncBeforePlan(): Promise<SyncOutcome> {
  const session = await readSession();
  if (session.kind === 'offline') return { kind: 'offline' };
  if (session.kind === 'none') return { kind: 'no-session' };
  const uid = session.userId;
  const last = lastSyncAt();
  const fresh = last !== null && Date.now() - last < PRE_PLAN_FRESH_MS;
  if (fresh && pendingOpCount(db as unknown as LocalDb, uid) === 0) return { kind: 'skipped' };
  return syncNow('pre_plan');
}

async function run(reason: SyncReason): Promise<SyncOutcome> {
  const session = await readSession();
  if (session.kind !== 'session') {
    // a refresh that failed on the network is "offline", not "sign in" (src/auth/readSession.ts)
    useSyncStore.setState({ status: session.kind === 'offline' ? 'offline' : 'no_session' });
    return session.kind === 'offline' ? { kind: 'offline' } : { kind: 'no-session' };
  }
  const uid = session.userId;
  const localDb = db as unknown as LocalDb;
  useSyncStore.setState({ status: 'syncing' });
  const started = Date.now();
  let pushed = 0;
  let pulled = 0;
  let conflicts = 0;
  let rounds = 0;
  let outcome: SyncOutcome | null = null;
  const sent = new Set<string>(); // op ids pushed in this sync (adversarial #6)
  try {
    for (;;) {
      rounds++;
      const ops = pendingOpsFor(localDb, uid);
      for (const op of ops) sent.add(op.opId);
      const body: SyncRequestBody = {
        ops: ops.map(toWire),
        cursor: getSyncCursor(),
        reason,
        device_id: getDeviceId(),
        now: new Date().toISOString(),
      };
      const res = await invokeFunction<SyncResponse>('sync-resolve', body);
      if (res.kind !== 'ok') {
        if (res.kind === 'no-session') outcome = { kind: 'no-session' };
        else if (res.kind === 'offline') outcome = { kind: 'offline' };
        else if (res.kind === 'http' && res.status === 409) outcome = { kind: 'busy' };
        else if (res.kind === 'http') {
          outcome = { kind: 'failed', detail: `${res.status} ${res.message}` };
        } else outcome = { kind: 'failed', detail: res.message };
        break;
      }
      const acked = applyAcks(localDb, uid, ops, res.data.acks);
      pushed += acked.acked;
      conflicts += acked.conflicts;
      const pull = applyPullPage(localDb, uid, res.data);
      pulled += pull.applied;
      advanceSyncCursor(res.data.cursor);
      if (acked.deadLetteredOps.length > 0) {
        pulled += await refetchDeadLettered(localDb, uid, acked.deadLetteredOps);
      }
      // another round for a full page, a merged conflict to replay, or a backlog beyond one
      // batch that has not been sent yet (bounded — ADR-0012 §4)
      const backlog = pendingOpsFor(localDb, uid).some((op) => !sent.has(op.opId));
      if (!(res.data.has_more || acked.conflicts > 0 || backlog) || rounds >= MAX_ROUNDS) break;
    }
  } catch (err) {
    // adversarial #7: never leave the store in `syncing` or the rejection unhandled
    Sentry.captureException(err);
    outcome = { kind: 'failed', detail: err instanceof Error ? err.message : String(err) };
  }

  const pending = pendingOpCount(localDb, uid);
  if (outcome === null) {
    const now = Date.now();
    appStorage.set(StorageKeys.lastSyncAt, now);
    useSyncStore.setState({ status: 'idle', lastSyncAt: now, pendingOps: pending });
    outcome = { kind: 'synced', pushed, pulled, conflicts, rounds };
  } else {
    useSyncStore.setState({
      status:
        outcome.kind === 'offline'
          ? 'offline'
          : outcome.kind === 'no-session'
            ? 'no_session'
            : outcome.kind === 'busy'
              ? 'idle'
              : 'error',
      pendingOps: pending,
    });
  }
  track('sync_completed', {
    reason,
    outcome: outcome.kind,
    pushed,
    pulled,
    conflicts,
    duration_ms: Date.now() - started,
  });
  // adversarial #5: the lease is held by another device / the sweep — one debounced retry, then
  // wait for the next trigger (the 2 s debounce is the backoff; never a tight loop)
  if (outcome.kind === 'busy' && !retryingBusy) {
    retryingBusy = true;
    scheduleSync(reason);
  } else {
    retryingBusy = false;
  }
  return outcome;
}

/**
 * Adversarial #8: a dead-lettered op is acked with its reason, but the device's row may now
 * differ from the server's for good. Re-read the entity through the user client (RLS) and
 * apply it as a one-row pull page — unless a later unacked op still owns the entity (the pull
 * applier would skip it anyway; the check avoids the round trip).
 */
async function refetchDeadLettered(
  localDb: LocalDb,
  uid: string,
  ops: readonly OutboxRow[],
): Promise<number> {
  if (!supabase) return 0;
  const rows: PullRow[] = [];
  const seen = new Set<string>();
  for (const op of ops) {
    if (op.opType === 'task_upsert' || op.opType === 'task_delete') {
      const id = entityIdOf(op);
      if (id === null || seen.has(`tasks:${id}`)) continue;
      seen.add(`tasks:${id}`);
      if (unackedOpsOf(localDb, ['task_upsert', 'task_delete'], id).length > 0) continue;
      const { data, error } = await supabase.from('tasks').select('*').eq('id', id).maybeSingle();
      if (error || data === null) {
        Sentry.addBreadcrumb({
          category: 'sync',
          level: 'warning',
          message: `dead-letter refetch (tasks): ${error?.message ?? 'no server row'}`,
        });
        continue;
      }
      rows.push({
        server_seq: data.server_seq ?? 0,
        tbl: 'tasks',
        row: data as unknown as Record<string, unknown>,
      });
    } else if (op.opType === 'profile_update') {
      if (seen.has('profiles')) continue;
      seen.add('profiles');
      if (unackedOpsOf(localDb, ['profile_update'], uid).length > 0) continue;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', uid)
        .maybeSingle();
      if (error || data === null) {
        Sentry.addBreadcrumb({
          category: 'sync',
          level: 'warning',
          message: `dead-letter refetch (profiles): ${error?.message ?? 'no server row'}`,
        });
        continue;
      }
      rows.push({
        server_seq: data.server_seq ?? 0,
        tbl: 'profiles',
        row: data as unknown as Record<string, unknown>,
      });
    }
  }
  if (rows.length === 0) return 0;
  return applyPull(localDb, { userId: uid, rows }).applied;
}

function applyPullPage(localDb: LocalDb, uid: string, res: SyncResponse): PullReport {
  const report = applyPull(localDb, { userId: uid, rows: res.pull });
  if (report.meetingsKept > 0) {
    useSyncStore.setState({ notice: { kind: 'meeting_kept', at: Date.now() } });
  } else if (report.displaced > 0) {
    useSyncStore.setState({
      notice: { kind: 'displaced', count: report.displaced, at: Date.now() },
    });
  }
  return report;
}

interface AckReport {
  acked: number;
  conflicts: number;
  deadLettered: number;
  /** The dead-lettered ops of this pass — their entities are re-read afterwards (#8). */
  deadLetteredOps: OutboxRow[];
}

/** Ack handling (ADR-0012 §2/§3/§4/§6); conflicts rewrite ops in place for the next round. */
export function applyAcks(
  localDb: LocalDb,
  uid: string,
  ops: readonly OutboxRow[],
  acks: readonly OpAck[],
  now = new Date(),
): AckReport {
  const report: AckReport = { acked: 0, conflicts: 0, deadLettered: 0, deadLetteredOps: [] };
  const byId = new Map(ops.map((op) => [op.opId, op] as const));
  localDb.transaction((tx) => {
    for (const ack of acks) {
      const op = byId.get(ack.op_id);
      if (op === undefined) continue;
      // an earlier conflict in this pass may have collapsed this op into the merged one
      const current = tx
        .select({ ackedAt: opOutbox.ackedAt })
        .from(opOutbox)
        .where(eq(opOutbox.seq, op.seq))
        .get() as { ackedAt: Date | null } | undefined;
      if (current === undefined || current.ackedAt !== null) continue;
      switch (ack.outcome) {
        case 'applied':
        case 'duplicate':
        case 'superseded':
          tx.update(opOutbox)
            .set({ sentAt: now, ackedAt: now, lastError: ack.detail ?? null })
            .where(eq(opOutbox.seq, op.seq))
            .run();
          report.acked++;
          if (op.opType === 'event_append') {
            // the fact is on the server: `server_ts` is what "pending" reads (P9 adversarial #1)
            tx.update(events)
              .set({ serverTs: now, serverSeq: ack.server_seq ?? null })
              .where(eq(events.opId, op.opId))
              .run();
          }
          if (ack.outcome === 'applied' && typeof ack.version === 'number') {
            adoptServerVersion(tx, uid, op, ack.version, ack.server_seq ?? null);
          }
          break;
        case 'conflict':
          if (ack.row !== undefined && resolveConflict(tx, uid, op, ack.row, now)) {
            report.conflicts++;
          } else {
            deadLetter(tx, op, 'conflict without a server row', now);
            report.deadLettered++;
            report.deadLetteredOps.push(op);
          }
          break;
        case 'rejected':
          deadLetter(tx, op, ack.detail ?? 'rejected', now);
          report.deadLettered++;
          report.deadLetteredOps.push(op);
          break;
        case 'error':
        default: {
          const attempts = op.attempts + 1;
          if (attempts >= MAX_ATTEMPTS) {
            deadLetter(tx, op, ack.detail ?? 'error', now);
            report.deadLettered++;
            report.deadLetteredOps.push(op);
          } else {
            tx.update(opOutbox)
              .set({ sentAt: now, attempts, lastError: ack.detail ?? 'error' })
              .where(eq(opOutbox.seq, op.seq))
              .run();
          }
        }
      }
    }
  });
  return report;
}

/**
 * Adversarial #13 (ADR-0012 §2 "applied ops converge without a pull"): the server's row version
 * after an `applied` class-2 op becomes the device's, so the next edit carries the right
 * `base_version` — only when no later unacked op still owns the entity (its ack will).
 */
function adoptServerVersion(
  tx: LocalDb,
  uid: string,
  op: OutboxRow,
  version: number,
  serverSeq: number | null,
): void {
  const seqPatch = serverSeq === null ? {} : { serverSeq };
  if (op.opType === 'task_upsert' || op.opType === 'task_delete') {
    const id = entityIdOf(op);
    if (id === null || unackedOpsOf(tx, ['task_upsert', 'task_delete'], id).length > 0) return;
    tx.update(tasks)
      .set({ version, ...seqPatch })
      .where(eq(tasks.id, id))
      .run();
  } else if (op.opType === 'profile_update') {
    if (unackedOpsOf(tx, ['profile_update'], uid).length > 0) return;
    tx.update(profiles)
      .set({ version, ...seqPatch })
      .where(eq(profiles.userId, uid))
      .run();
  }
}

function entityIdOf(op: OutboxRow): string | null {
  if (op.entityId !== null) return op.entityId;
  const id = (op.payload as { id?: unknown } | null)?.id;
  return typeof id === 'string' ? id : null;
}

/** Unacked ops of the given types for one entity (the entity's "owner" until they are acked). */
function unackedOpsOf(
  tx: LocalDb,
  opTypes: readonly OpType[],
  entityId: string,
): Array<{ seq: number }> {
  return tx
    .select({ seq: opOutbox.seq })
    .from(opOutbox)
    .where(
      and(
        inArray(opOutbox.opType, [...opTypes]),
        eq(opOutbox.entityId, entityId),
        isNull(opOutbox.ackedAt),
      ),
    )
    .all() as Array<{ seq: number }>;
}

/** A poison op must not block the queue: acked with the reason, reported, never retried. */
function deadLetter(tx: LocalDb, op: OutboxRow, reason: string, now: Date): void {
  tx.update(opOutbox)
    .set({
      sentAt: now,
      ackedAt: now,
      attempts: op.attempts + 1,
      lastError: `dead-letter: ${reason}`,
    })
    .where(eq(opOutbox.seq, op.seq))
    .run();
  Sentry.addBreadcrumb({
    category: 'sync',
    level: 'warning',
    message: `op dead-lettered (${op.opType}): ${reason}`,
  });
}

/**
 * Class-2 conflict: merge the device's row with the server's, write the merged row locally
 * (no new op), and collapse every unacked op of the entity into the conflicting one — rewritten
 * as a full-row op against the server's version (ADR-0012 §4).
 */
function resolveConflict(
  tx: LocalDb,
  uid: string,
  op: OutboxRow,
  serverRow: Record<string, unknown>,
  now: Date,
): boolean {
  if (op.opType === 'task_upsert' || op.opType === 'task_delete') {
    const id = (op.payload as { id?: unknown }).id;
    if (typeof id !== 'string') return false;
    const local = tx.select().from(tasks).where(eq(tasks.id, id)).get() as TaskRow | undefined;
    const server = serverRow as unknown as ServerTask;
    if (local === undefined || typeof server.version !== 'number') return false;
    const merged = mergeTask(toLocalPayload(local), server);
    tx.update(tasks)
      .set({
        title: merged.title,
        category: merged.category as TaskRow['category'],
        estMinutes: merged.est_minutes,
        deadline: merged.deadline === null ? null : new Date(merged.deadline),
        value: merged.value,
        splittable: merged.splittable,
        earliestStart: merged.earliest_start === null ? null : new Date(merged.earliest_start),
        recurrence: merged.recurrence ?? null,
        status: merged.status as TaskRow['status'],
        doneAt: merged.done_at === null ? null : new Date(merged.done_at),
        postponeCount: merged.postpone_count,
        deletedAt: merged.deleted_at === null ? null : new Date(merged.deleted_at),
        version: merged.version,
        updatedAt: new Date(merged.updated_at),
      })
      .where(eq(tasks.id, id))
      .run();
    collapseOps(tx, ['task_upsert', 'task_delete'], id, op, now);
    tx.update(opOutbox)
      .set({
        opType: 'task_upsert',
        payload: merged as unknown as Record<string, unknown>,
        baseVersion: server.version,
        sentAt: now,
        lastError: 'conflict: merged and replayed',
      })
      .where(eq(opOutbox.seq, op.seq))
      .run();
    return true;
  }
  if (op.opType === 'profile_update') {
    const server = serverRow as unknown as ServerProfile;
    if (typeof server.version !== 'number') return false;
    const merged = mergeProfile(op.payload as never, server);
    tx.update(profiles)
      .set({
        timezone: merged.timezone,
        locale: merged.locale,
        workingHours: merged.working_hours as never,
        sleepWindow: merged.sleep_window as never,
        rmeqScore: merged.rmeq_score,
        chronotypeClass: merged.chronotype_class as never,
        surveySkipped: merged.survey_skipped,
        topCategories: merged.top_categories,
        onboardingCompletedAt:
          merged.onboarding_completed_at === null ? null : new Date(merged.onboarding_completed_at),
        settings: (merged.settings as never) ?? null,
        version: merged.version ?? server.version + 1,
        updatedAt: new Date(merged.updated_at ?? now.getTime()),
      })
      .where(eq(profiles.userId, uid))
      .run();
    collapseOps(tx, ['profile_update'], uid, op, now);
    tx.update(opOutbox)
      .set({
        payload: merged as unknown as Record<string, unknown>,
        baseVersion: server.version,
        sentAt: now,
        lastError: 'conflict: merged and replayed',
      })
      .where(eq(opOutbox.seq, op.seq))
      .run();
    return true;
  }
  return false;
}

/** Every other unacked op of the entity is superseded by the merged full-row op. */
function collapseOps(
  tx: LocalDb,
  opTypes: readonly OpType[],
  entityId: string,
  keep: OutboxRow,
  now: Date,
): void {
  for (const o of unackedOpsOf(tx, opTypes, entityId)) {
    if (o.seq === keep.seq) continue;
    tx.update(opOutbox)
      .set({ sentAt: now, ackedAt: now, lastError: `collapsed into ${keep.opId}` })
      .where(eq(opOutbox.seq, o.seq))
      .run();
  }
}

function toLocalPayload(row: TaskRow): LocalTaskPayload {
  return {
    id: row.id,
    user_id: row.userId,
    title: row.title,
    category: row.category,
    est_minutes: row.estMinutes,
    deadline: row.deadline?.getTime() ?? null,
    value: row.value,
    splittable: row.splittable,
    earliest_start: row.earliestStart?.getTime() ?? null,
    recurrence: row.recurrence ?? null,
    status: row.status,
    done_at: row.doneAt?.getTime() ?? null,
    postpone_count: row.postponeCount,
    deleted_at: row.deletedAt?.getTime() ?? null,
    version: row.version,
    created_at: row.createdAt.getTime(),
    updated_at: row.updatedAt.getTime(),
  };
}

/** Wire the lifecycle triggers once (root layout). Returns a disposer for tests. */
export function wireSync(): () => void {
  if (!supabase) return () => {};
  let poll: ReturnType<typeof setInterval> | null = null;
  const startPoll = () => {
    if (poll === null) poll = setInterval(() => void syncNow('poll'), POLL_INTERVAL_MS);
  };
  const stopPoll = () => {
    if (poll !== null) {
      clearInterval(poll);
      poll = null;
    }
  };
  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void syncNow('foreground');
      startPoll();
    } else {
      stopPoll();
    }
  });
  const network = Network.addNetworkStateListener((state) => {
    if (state.isConnected === true && useSyncStore.getState().status === 'offline') {
      void syncNow('reconnect');
    }
  });
  if (AppState.currentState === 'active') startPoll();
  return () => {
    appState.remove();
    network.remove();
    stopPoll();
  };
}
