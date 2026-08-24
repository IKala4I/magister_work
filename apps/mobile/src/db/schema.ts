/**
 * Local SQLite schema (Drizzle) — the single reactive source of truth on device
 * (File 03 §1.2). Mirrors the P1 server schema (specs/07 §4 + M-01/M-02) for the tables the
 * client renders and writes, plus the op outbox that carries offline writes to sync
 * (invariant 8). The client is a fact logger and renderer: no reward columns, no model
 * state, ever (invariant 1).
 *
 * Type mapping from Postgres: uuid→text, timestamptz→integer(timestamp_ms), jsonb→text(json),
 * bool→integer(boolean), real→real. `server_seq` is nullable locally — rows born offline get
 * it on first pull. `plans` is not mirrored yet: recommendations carry engine/model_version
 * themselves; P6 revisits when the Today timeline needs solver telemetry.
 *
 * Local-only status values never leave the device: the client may PUSH only the plan-review
 * set {accepted, pinned, moved, rejected} (spec-conflicts L11); the full value set exists
 * here because pulled rows carry server-authored statuses.
 */
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const TASK_CATEGORIES = ['deep', 'admin', 'physical', 'learning'] as const;
export const TASK_STATUSES = ['inbox', 'scheduled', 'done', 'archived'] as const;

/** Full server value set (specs/07 §4.1 base + M-02 displacement statuses). */
export const RECOMMENDATION_STATUSES = [
  'shown',
  'accepted',
  'pinned',
  'moved',
  'rejected',
  'completed',
  'lapsed',
  'expired',
  'displaced_pending',
  'displaced',
] as const;

/** Client-pushable subset (spec-conflicts L11) — enforced at the sync layer in P3/P8. */
export const CLIENT_WRITABLE_RECOMMENDATION_STATUSES = [
  'accepted',
  'pinned',
  'moved',
  'rejected',
] as const;

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    title: text('title').notNull(),
    category: text('category', { enum: TASK_CATEGORIES }).notNull(),
    estMinutes: integer('est_minutes').notNull(),
    deadline: integer('deadline', { mode: 'timestamp_ms' }),
    value: integer('value').notNull(),
    splittable: integer('splittable', { mode: 'boolean' }).notNull().default(false),
    earliestStart: integer('earliest_start', { mode: 'timestamp_ms' }),
    recurrence: text('recurrence', { mode: 'json' }),
    status: text('status', { enum: TASK_STATUSES }).notNull().default('inbox'),
    doneAt: integer('done_at', { mode: 'timestamp_ms' }),
    postponeCount: integer('postpone_count').notNull().default(0),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    version: integer('version').notNull().default(1),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    serverSeq: integer('server_seq'),
  },
  (t) => [
    index('tasks_user_status_idx').on(t.userId, t.status),
    index('tasks_user_deadline_idx').on(t.userId, t.deadline),
  ],
);

export const recommendations = sqliteTable(
  'recommendations',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    planId: text('plan_id').notNull(),
    taskId: text('task_id').notNull(),
    chunkIndex: integer('chunk_index').notNull().default(0),
    slotStart: integer('slot_start', { mode: 'timestamp_ms' }).notNull(),
    slotEnd: integer('slot_end', { mode: 'timestamp_ms' }).notNull(),
    contextBucket: text('context_bucket').notNull(),
    /** Numeric-only feature snapshot (NFR-O1); never task text (specs/07 §7). */
    features: text('features', { mode: 'json' }),
    qHat: real('q_hat'),
    confidence: real('confidence'),
    rationaleKey: text('rationale_key'),
    rationaleParams: text('rationale_params', { mode: 'json' }),
    isExperiment: integer('is_experiment', { mode: 'boolean' }).notNull().default(false),
    engine: text('engine', { enum: ['learned', 'heuristic'] }),
    modelVersion: text('model_version'),
    status: text('status', { enum: RECOMMENDATION_STATUSES }).notNull().default('shown'),
    attributedAt: integer('attributed_at', { mode: 'timestamp_ms' }),
    /** M-01: exact ε/m on the randomized slice; NULL until the nightly MC backfill for TS. */
    propensity: real('propensity'),
    /** M-02: concurrent_external_conflict marker driving ambiguity exclusion. */
    conflictFlag: integer('conflict_flag', { mode: 'boolean' }).notNull().default(false),
    version: integer('version').notNull().default(1),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    serverSeq: integer('server_seq'),
  },
  (t) => [
    index('recommendations_user_slot_start_idx').on(t.userId, t.slotStart),
    index('recommendations_user_status_idx').on(t.userId, t.status),
  ],
);

/**
 * Append-only behavioral log (invariant 8: events are append-only). The DAO layer (P3)
 * exposes insert + select only; there is no update path by construction.
 */
export const events = sqliteTable(
  'events',
  {
    /** Local insertion order; the server assigns its own bigint identity. */
    localId: integer('local_id').primaryKey({ autoIncrement: true }),
    opId: text('op_id').notNull(),
    userId: text('user_id').notNull(),
    type: text('type').notNull(),
    taskId: text('task_id'),
    recommendationId: text('recommendation_id'),
    payload: text('payload', { mode: 'json' }),
    context: text('context', { mode: 'json' }),
    clientTs: integer('client_ts', { mode: 'timestamp_ms' }).notNull(),
    /** Set once the server acknowledges/returns the row; NULL while local-only. */
    serverTs: integer('server_ts', { mode: 'timestamp_ms' }),
    /** YYYY-MM-DD in the user's timezone (attribution day, File 05 §1). */
    localDay: text('local_day').notNull(),
    serverSeq: integer('server_seq'),
  },
  (t) => [
    uniqueIndex('events_op_id_unique').on(t.opId),
    index('events_local_day_idx').on(t.localDay),
  ],
);

export const OP_TYPES = [
  'event_append',
  'task_upsert',
  'task_delete',
  'recommendation_status',
  'profile_update',
] as const; // [INFERRED] from the File 05 §2 op classes; extended as later phases add ops

/**
 * Op outbox (invariant 8): ordered domain writes awaiting push. `seq` is send order;
 * `op_id` is the client-monotonic id (src/sync/opId.ts); `base_version` carries the
 * optimistic-concurrency check for plain-row updates. Push (P3+) walks seq ascending,
 * marks sent/acked; acked rows are pruned.
 */
export const opOutbox = sqliteTable(
  'op_outbox',
  {
    seq: integer('seq').primaryKey({ autoIncrement: true }),
    opId: text('op_id').notNull(),
    opType: text('op_type', { enum: OP_TYPES }).notNull(),
    entityId: text('entity_id'),
    payload: text('payload', { mode: 'json' }).notNull(),
    baseVersion: integer('base_version'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    sentAt: integer('sent_at', { mode: 'timestamp_ms' }),
    ackedAt: integer('acked_at', { mode: 'timestamp_ms' }),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
  },
  (t) => [uniqueIndex('op_outbox_op_id_unique').on(t.opId)],
);
