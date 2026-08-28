/**
 * Local SQLite schema (Drizzle) — the single reactive source of truth on device
 * (File 03 §1.2). Mirrors the P1 server schema (specs/07 §4 + M-01/M-02) for the tables the
 * client renders and writes, plus the op outbox that carries offline writes to sync
 * (invariant 8). The client is a fact logger and renderer: no reward columns, no model
 * state, ever (invariant 1).
 *
 * Type mapping from Postgres: uuid→text, timestamptz→integer(timestamp_ms), jsonb→text(json),
 * bool→integer(boolean), real→real. `server_seq` is nullable locally — rows born offline get
 * it on first pull. `plans` is mirrored from P6 on: the Today screen needs the plan's
 * provenance (NFR-R2 fallback reason vs. a study arm) and the unplaced list, which live in
 * `plans.telemetry` server-side.
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

/**
 * Local mirror of the server `profiles` row (specs/07 §4.1) — one row per known user id
 * (pre-auth local id or authed uid; account transitions rewrite/wipe, src/auth). Model
 * state (beta_cells etc.) is deliberately NOT mirrored: the client renders profiles and
 * logs facts, it never holds priors (invariant 1).
 */
export const profiles = sqliteTable('profiles', {
  userId: text('user_id').primaryKey(),
  timezone: text('timezone').notNull(),
  locale: text('locale').notNull().default('en'),
  /** {mon:[start,end],...} minutes from local midnight (specs/07 §5). */
  workingHours: text('working_hours', { mode: 'json' }).notNull(),
  /** [start,end], may wrap midnight. */
  sleepWindow: text('sleep_window', { mode: 'json' }).notNull(),
  rmeqScore: integer('rmeq_score'),
  chronotypeClass: text('chronotype_class', { enum: ['DM', 'MM', 'INT', 'ME', 'DE'] }),
  surveySkipped: integer('survey_skipped', { mode: 'boolean' }).notNull().default(false),
  topCategories: text('top_categories', { mode: 'json' }).notNull().default('[]'),
  onboardingCompletedAt: integer('onboarding_completed_at', { mode: 'timestamp_ms' }),
  settings: text('settings', { mode: 'json' }),
  version: integer('version').notNull().default(1),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  serverSeq: integer('server_seq'),
});

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
    /**
     * LOCAL-ONLY (never in the op payload): consecutive skips/lapses since the last completion —
     * the UC-04 A2 "third consecutive skip" trigger. Server-side skip counts live in events.
     */
    skipStreak: integer('skip_streak').notNull().default(0),
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

export const PLAN_HORIZONS = ['day', 'week'] as const;
export const PLAN_ENGINES = ['learned', 'heuristic'] as const;

/**
 * Local mirror of the server `plans` row (specs/07 §4.1): one row per generation run, written
 * by the plan-request edge function and mirrored here from its response (P6 bridge) or by pull
 * (P8). Read-only on the client — never enqueues an op.
 */
export const plans = sqliteTable(
  'plans',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    /** YYYY-MM-DD in the user's zone. */
    planDate: text('plan_date').notNull(),
    horizon: text('horizon', { enum: PLAN_HORIZONS }).notNull().default('day'),
    engine: text('engine', { enum: PLAN_ENGINES }).notNull(),
    modelVersion: text('model_version'),
    arm: text('arm'),
    solverStatus: text('solver_status'),
    /** Server telemetry incl. `ef.reason`, `unplaced`, `infeasible` (P6 migration comment). */
    telemetry: text('telemetry', { mode: 'json' }).notNull(),
    generatedAt: integer('generated_at', { mode: 'timestamp_ms' }).notNull(),
    serverSeq: integer('server_seq'),
  },
  (t) => [index('plans_user_date_idx').on(t.userId, t.planDate, t.generatedAt)],
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

/**
 * Local mirror of the server `calendar_events` row (specs/07 §4.1; FR-03/UC-09): the busy
 * intervals the webhook imported from the user's Google Calendar. Read-only on the client
 * (pull only, never an op); `deleted_at` tombstones cancelled meetings so the mirror converges.
 * `title` is display-only and never leaves the device again (specs/07 §7).
 */
export const calendarEvents = sqliteTable(
  'calendar_events',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    source: text('source').notNull().default('google'),
    externalId: text('external_id').notNull(),
    startAt: integer('start_at', { mode: 'timestamp_ms' }).notNull(),
    endAt: integer('end_at', { mode: 'timestamp_ms' }).notNull(),
    title: text('title'),
    busy: integer('busy', { mode: 'boolean' }).notNull().default(true),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    serverSeq: integer('server_seq'),
  },
  (t) => [
    index('calendar_events_user_start_idx').on(t.userId, t.startAt),
    uniqueIndex('calendar_events_source_external_unique').on(t.userId, t.source, t.externalId),
  ],
);

export const FOCUS_SESSION_STATES = ['running', 'paused', 'finished', 'abandoned'] as const;

/**
 * Focus sessions (FR-30) — LOCAL-ONLY table: the durable facts are the `focus_*` events in
 * `events` (append-only, synced); this row is the device's own record of the session so a
 * running timer survives an app restart and the Focus tab can render it from SQLite
 * (single source of truth). `focusedMs` accumulates completed run segments; while `running`,
 * the live elapsed time is `focusedMs + (now − lastResumedAt)`.
 */
export const focusSessions = sqliteTable(
  'focus_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    recommendationId: text('recommendation_id').notNull(),
    taskId: text('task_id').notNull(),
    state: text('state', { enum: FOCUS_SESSION_STATES }).notNull().default('running'),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
    /** Focused milliseconds from completed run segments (pauses excluded). */
    focusedMs: integer('focused_ms').notNull().default(0),
    /** Start of the current run segment while `running`; NULL while paused/ended. */
    lastResumedAt: integer('last_resumed_at', { mode: 'timestamp_ms' }),
    plannedMinutes: integer('planned_minutes').notNull(),
    estMinutes: integer('est_minutes').notNull(),
    /** FR-31 1-tap ratings (1–3); NULL = not rated (never required). */
    ratedEnergy: integer('rated_energy'),
    ratedDifficulty: integer('rated_difficulty'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('focus_sessions_user_state_idx').on(t.userId, t.state),
    index('focus_sessions_rec_idx').on(t.recommendationId),
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
