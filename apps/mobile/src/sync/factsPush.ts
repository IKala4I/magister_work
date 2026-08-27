/**
 * P7 facts bridge (the client half of File 05 §1's instant phase until P8's op-replay sync):
 *   1. drain pending task rows (src/sync/taskPush.ts — completions/deferrals change tasks);
 *   2. push pending `event_append` ops as `events` rows through RLS (own rows; the server's
 *      UNIQUE(user_id, op_id) makes a re-push a no-op → `ignoreDuplicates`);
 *   3. invoke `attribute-rewards` in instant mode with the user's JWT, and mirror the
 *      server-derived recommendation rows (status, moved slots, target features) back into SQLite.
 * The client never computes a reward or a feature (invariant 1); it ships facts and renders what
 * the server concluded. Single-flight; offline is simply "nothing pushed" (NFR-R1).
 * P8 replaces steps 1–2 with the outbox replay and keeps step 3 inside `sync-resolve`.
 */
import type { Database } from '@hourwell/shared';
import { and, eq, isNull } from 'drizzle-orm';

import { supabase } from '../auth/client';
import { db } from '../db/client';
import { applyServerRecommendations, type ServerRecommendationPatch } from '../db/feedback';
import { opOutbox } from '../db/schema';
import type { LocalDb } from '../db/writes';

import { pushTasksIfPossible } from './taskPush';

export type FactsPushResult =
  | { kind: 'pushed'; events: number; tuples: number; delivery: string }
  | { kind: 'nothing-pending' }
  | { kind: 'no-session' }
  | { kind: 'offline' }
  | { kind: 'failed'; detail: string };

type EventInsert = Database['public']['Tables']['events']['Insert'];

let inFlight: Promise<FactsPushResult> | null = null;

export function pushFactsIfPossible(): Promise<FactsPushResult> {
  if (inFlight) return inFlight;
  inFlight = run().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

interface InstantResponse {
  tuples_written?: number;
  delivery?: string;
  recommendations?: ServerRecommendationPatch[];
}

async function run(): Promise<FactsPushResult> {
  if (!supabase) return { kind: 'no-session' };
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return { kind: 'no-session' };
  const localDb = db as unknown as LocalDb;

  const tasksPushed = await pushTasksIfPossible();
  if (tasksPushed === 'failed') return { kind: 'offline' };

  const pending = localDb
    .select()
    .from(opOutbox)
    .where(and(eq(opOutbox.opType, 'event_append'), isNull(opOutbox.ackedAt)))
    .orderBy(opOutbox.seq)
    .all();
  const rows = pending
    .map((op) => op.payload as Record<string, unknown>)
    .filter((p) => p.user_id === uid)
    .map((p): EventInsert => ({
      user_id: String(p.user_id),
      op_id: String(p.op_id),
      type: String(p.type),
      task_id: (p.task_id as string | null | undefined) ?? null,
      recommendation_id: (p.recommendation_id as string | null | undefined) ?? null,
      payload: (p.payload ?? {}) as EventInsert['payload'],
      context: (p.context ?? {}) as EventInsert['context'],
      client_ts: new Date(p.client_ts as number).toISOString(),
      local_day: String(p.local_day),
    }));
  if (rows.length === 0 && tasksPushed === 'nothing-pending') {
    // still poke the server: facts may have synced earlier while the service was down
    return invokeInstant(0);
  }
  if (rows.length > 0) {
    const { error } = await supabase
      .from('events')
      .upsert(rows, { onConflict: 'user_id,op_id', ignoreDuplicates: true });
    if (error) {
      const newest = pending[pending.length - 1];
      if (newest) {
        localDb
          .update(opOutbox)
          .set({ attempts: newest.attempts + 1, lastError: error.message })
          .where(eq(opOutbox.seq, newest.seq))
          .run();
      }
      return { kind: 'offline' };
    }
    const now = new Date();
    const pushedOpIds = new Set(rows.map((r) => r.op_id));
    localDb.transaction((tx) => {
      for (const op of pending) {
        if (!pushedOpIds.has(op.opId)) continue; // another identity's rows stay queued
        tx.update(opOutbox)
          .set({ sentAt: now, ackedAt: now })
          .where(eq(opOutbox.seq, op.seq))
          .run();
      }
    });
  }
  return invokeInstant(rows.length);
}

async function invokeInstant(eventsPushed: number): Promise<FactsPushResult> {
  if (!supabase) return { kind: 'no-session' };
  const { data: response, error } = await supabase.functions.invoke<InstantResponse>(
    'attribute-rewards',
    { body: { mode: 'instant' } },
  );
  if (error) {
    if (error.name === 'FunctionsFetchError') return { kind: 'offline' };
    return { kind: 'failed', detail: error.message };
  }
  const recs = response?.recommendations ?? [];
  if (recs.length > 0) applyServerRecommendations(db as unknown as LocalDb, recs);
  return {
    kind: 'pushed',
    events: eventsPushed,
    tuples: response?.tuples_written ?? 0,
    delivery: response?.delivery ?? 'unknown',
  };
}
