/**
 * Local write path (NFR-R1, invariant 8): every domain write lands in SQLite first, inside
 * one transaction that also queues the matching op for sync. The DAO layer here is the ONLY
 * write surface — screens never touch `db.insert` directly, so the outbox can never be
 * skipped and events stay append-only by construction (no update helper exists for them).
 *
 * Op payloads use server column names (snake_case, epoch-ms timestamps) so P8's
 * `sync-resolve` replays them without a client-side rename layer (specs/07 §4).
 */
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import { localDayOf } from '../domain/localDay';
import { nextOpId } from '../sync/opId';

import { events, opOutbox } from './schema';
import type { OP_TYPES } from './schema';

/** Sync-driver database: expo-sqlite in the app, better-sqlite3 in tests. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- driver run-result types differ
export type LocalDb = BaseSQLiteDatabase<'sync', any, Record<string, unknown>>;

export type OpType = (typeof OP_TYPES)[number];

/**
 * Queue an op for the push loop (P8). Must run inside the same transaction as the domain
 * write it mirrors — a task row without its outbox op would be a silent sync hole.
 */
export function enqueueOp(
  tx: LocalDb,
  input: {
    opType: OpType;
    entityId: string;
    payload: Record<string, unknown>;
    baseVersion: number | null;
    now: Date;
  },
): string {
  const opId = nextOpId();
  tx.insert(opOutbox)
    .values({
      opId,
      opType: input.opType,
      entityId: input.entityId,
      payload: input.payload,
      baseVersion: input.baseVersion,
      createdAt: input.now,
    })
    .run();
  return opId;
}

/** Append-only event types the client can emit so far; later phases extend this list. */
export const CLIENT_EVENT_TYPES = ['task_created'] as const;
export type ClientEventType = (typeof CLIENT_EVENT_TYPES)[number];

/**
 * Append a behavioral event (specs/07 §4 `events`): one local mirror row plus one
 * `event_append` op sharing the same op_id, so the server's UNIQUE(user_id, op_id)
 * makes replay a no-op. Payloads are categorical only — never task text (NFR-S3).
 */
export function appendEvent(
  tx: LocalDb,
  input: {
    userId: string;
    type: ClientEventType;
    taskId?: string;
    recommendationId?: string;
    payload?: Record<string, unknown>;
    context?: Record<string, unknown>;
    now: Date;
  },
): string {
  const opId = nextOpId();
  const clientTs = input.now;
  const localDay = localDayOf(input.now);
  tx.insert(events)
    .values({
      opId,
      userId: input.userId,
      type: input.type,
      taskId: input.taskId ?? null,
      recommendationId: input.recommendationId ?? null,
      payload: input.payload ?? null,
      context: input.context ?? null,
      clientTs,
      localDay,
    })
    .run();
  tx.insert(opOutbox)
    .values({
      opId,
      opType: 'event_append',
      entityId: input.taskId ?? null,
      payload: {
        op_id: opId,
        user_id: input.userId,
        type: input.type,
        task_id: input.taskId ?? null,
        recommendation_id: input.recommendationId ?? null,
        payload: input.payload ?? null,
        context: input.context ?? null,
        client_ts: clientTs.getTime(),
        local_day: localDay,
      },
      baseVersion: null,
      createdAt: input.now,
    })
    .run();
  return opId;
}
