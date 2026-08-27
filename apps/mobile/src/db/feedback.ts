/**
 * Feedback-loop facts on the local mirror (FR-23, FR-25, FR-30–FR-32, UC-04, UC-06, UC-07; File
 * 05 §1). Every function is one SQLite transaction: the local row change + the append-only event
 * (through the outbox, synced by the facts bridge) + the task-status mirror through the outbox.
 *
 * The client is a fact logger and renderer (invariant 1): it never computes a reward, never
 * decides in-window/off-slot, never touches features. Local recommendation statuses set here
 * (`completed`, `lapsed`, `rejected`, `moved`) are the device's rendering state; the server
 * derives the authoritative status from the facts (`attribute-rewards`) and the response is
 * mirrored back with `applyServerRecommendations`. No `recommendation_status` op is enqueued for
 * fact-derived statuses (spec-conflicts L11): facts beat plans, and the fact IS the op.
 */
import { randomUUID } from 'expo-crypto';
import { and, desc, eq, inArray, lt } from 'drizzle-orm';

import { focusSessions, recommendations, tasks } from './schema';
import type { RecommendationRow } from './plans';
import { taskOpPayload } from './tasks';
import type { TaskRow } from './tasks';
import { appendEvent, enqueueOp } from './writes';
import type { LocalDb } from './writes';

export type FocusSessionRow = typeof focusSessions.$inferSelect;
export type SkipDiagnosticAnswer = 'too_big' | 'wrong_time' | 'not_important';
/** UC-04 A2: the diagnostic question is asked on the third consecutive skip/lapse. */
export const SKIP_DIAGNOSTIC_STREAK = 3;
const OPEN_STATUSES = ['shown', 'accepted', 'pinned', 'moved'] as const;

// --- queries (fed to useLiveRows) -----------------------------------------------------------

export function activeFocusSessionQuery(db: LocalDb, userId: string) {
  return db
    .select()
    .from(focusSessions)
    .where(
      and(eq(focusSessions.userId, userId), inArray(focusSessions.state, ['running', 'paused'])),
    )
    .orderBy(desc(focusSessions.startedAt))
    .limit(1);
}

/** The most recent ended session — the Focus tab offers the FR-31 rating for it. */
export function lastEndedSessionQuery(db: LocalDb, userId: string) {
  return db
    .select()
    .from(focusSessions)
    .where(
      and(
        eq(focusSessions.userId, userId),
        inArray(focusSessions.state, ['finished', 'abandoned']),
      ),
    )
    .orderBy(desc(focusSessions.endedAt))
    .limit(1);
}

export function sessionsForRecommendation(
  db: LocalDb,
  recommendationId: string,
): FocusSessionRow[] {
  return db
    .select()
    .from(focusSessions)
    .where(eq(focusSessions.recommendationId, recommendationId))
    .all() as FocusSessionRow[];
}

/** Live elapsed focused time of a session at `now`. */
export function focusedMsAt(session: FocusSessionRow, now: Date): number {
  if (session.state === 'running' && session.lastResumedAt !== null) {
    return session.focusedMs + Math.max(now.getTime() - session.lastResumedAt.getTime(), 0);
  }
  return session.focusedMs;
}

function requireSession(tx: LocalDb, id: string): FocusSessionRow {
  const row = tx.select().from(focusSessions).where(eq(focusSessions.id, id)).get() as
    FocusSessionRow | undefined;
  if (row === undefined) throw new Error(`focus session ${id} not found`);
  return row;
}

function requireTask(tx: LocalDb, id: string): TaskRow {
  const row = tx.select().from(tasks).where(eq(tasks.id, id)).get() as TaskRow | undefined;
  if (row === undefined) throw new Error(`task ${id} not found`);
  return row;
}

function requireRec(tx: LocalDb, id: string): RecommendationRow {
  const row = tx.select().from(recommendations).where(eq(recommendations.id, id)).get() as
    RecommendationRow | undefined;
  if (row === undefined) throw new Error(`recommendation ${id} not found`);
  return row;
}

/** Task row update + the matching op (server-shaped payload, base_version check for P8). */
function writeTask(tx: LocalDb, current: TaskRow, patch: Partial<TaskRow>, now: Date): TaskRow {
  const next: TaskRow = { ...current, ...patch, version: current.version + 1, updatedAt: now };
  tx.update(tasks)
    .set({ ...patch, version: next.version, updatedAt: now })
    .where(eq(tasks.id, current.id))
    .run();
  enqueueOp(tx, {
    opType: 'task_upsert',
    entityId: current.id,
    payload: taskOpPayload(next),
    baseVersion: current.version,
    now,
  });
  return next;
}

function setRecStatus(
  tx: LocalDb,
  id: string,
  status: RecommendationRow['status'],
  now: Date,
  extra: Partial<typeof recommendations.$inferInsert> = {},
): void {
  tx.update(recommendations)
    .set({ status, updatedAt: now, ...extra })
    .where(eq(recommendations.id, id))
    .run();
}

function completeTask(tx: LocalDb, task: TaskRow, now: Date): TaskRow {
  if (task.status === 'done') return task;
  return writeTask(tx, task, { status: 'done', doneAt: now, skipStreak: 0 }, now);
}

/** A skipped/lapsed task returns to the Inbox (FR-23) and counts a postpone (FR-32). */
function deferTask(tx: LocalDb, task: TaskRow, now: Date): TaskRow {
  if (task.status === 'done' || task.status === 'archived') return task;
  return writeTask(
    tx,
    task,
    { status: 'inbox', postponeCount: task.postponeCount + 1, skipStreak: task.skipStreak + 1 },
    now,
  );
}

const minutesBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 60_000);

// --- FR-30 focus sessions -----------------------------------------------------------------------

export function startFocusSession(
  db: LocalDb,
  input: { userId: string; recommendationId: string; now?: Date },
): FocusSessionRow {
  const now = input.now ?? new Date();
  return db.transaction((tx) => {
    const open = activeFocusSessionQuery(tx, input.userId).get() as FocusSessionRow | undefined;
    if (open !== undefined) throw new Error('a focus session is already running');
    const rec = requireRec(tx, input.recommendationId);
    const task = requireTask(tx, rec.taskId);
    const row: FocusSessionRow = {
      id: randomUUID(),
      userId: input.userId,
      recommendationId: rec.id,
      taskId: rec.taskId,
      state: 'running',
      startedAt: now,
      endedAt: null,
      focusedMs: 0,
      lastResumedAt: now,
      plannedMinutes: Math.max(minutesBetween(rec.slotStart, rec.slotEnd), 1),
      estMinutes: task.estMinutes,
      ratedEnergy: null,
      ratedDifficulty: null,
      createdAt: now,
      updatedAt: now,
    };
    tx.insert(focusSessions).values(row).run();
    if (rec.status === 'shown') {
      // starting the block is accepting the placement (plan-review vocabulary, L11)
      setRecStatus(tx, rec.id, 'accepted', now);
      enqueueOp(tx, {
        opType: 'recommendation_status',
        entityId: rec.id,
        payload: { id: rec.id, status: 'accepted', version: rec.version },
        baseVersion: rec.version,
        now,
      });
    }
    appendEvent(tx, {
      userId: input.userId,
      type: 'focus_start',
      taskId: rec.taskId,
      recommendationId: rec.id,
      payload: {
        session_id: row.id,
        started_at: now.toISOString(),
        slot_start: rec.slotStart.toISOString(),
        planned_minutes: row.plannedMinutes,
        start_offset_minutes: minutesBetween(rec.slotStart, now),
      },
      now,
    });
    return row;
  });
}

export function pauseFocusSession(
  db: LocalDb,
  input: { sessionId: string; now?: Date },
): FocusSessionRow {
  const now = input.now ?? new Date();
  return db.transaction((tx) => {
    const s = requireSession(tx, input.sessionId);
    if (s.state !== 'running') return s;
    const focusedMs = focusedMsAt(s, now);
    tx.update(focusSessions)
      .set({ state: 'paused', focusedMs, lastResumedAt: null, updatedAt: now })
      .where(eq(focusSessions.id, s.id))
      .run();
    appendEvent(tx, {
      userId: s.userId,
      type: 'focus_pause',
      taskId: s.taskId,
      recommendationId: s.recommendationId,
      payload: { session_id: s.id, at: now.toISOString(), focused_ms: focusedMs },
      now,
    });
    return requireSession(tx, s.id);
  });
}

export function resumeFocusSession(
  db: LocalDb,
  input: { sessionId: string; now?: Date },
): FocusSessionRow {
  const now = input.now ?? new Date();
  return db.transaction((tx) => {
    const s = requireSession(tx, input.sessionId);
    if (s.state !== 'paused') return s;
    tx.update(focusSessions)
      .set({ state: 'running', lastResumedAt: now, updatedAt: now })
      .where(eq(focusSessions.id, s.id))
      .run();
    appendEvent(tx, {
      userId: s.userId,
      type: 'focus_resume',
      taskId: s.taskId,
      recommendationId: s.recommendationId,
      payload: { session_id: s.id, at: now.toISOString() },
      now,
    });
    return requireSession(tx, s.id);
  });
}

/**
 * Finish or abandon. A finished session completes the task (UC-06 main); the server decides the
 * reward (rows 1–4) from `started_at` vs. the slot — the client only reports what happened.
 */
export function endFocusSession(
  db: LocalDb,
  input: { sessionId: string; outcome: 'finished' | 'abandoned'; now?: Date },
): FocusSessionRow {
  const now = input.now ?? new Date();
  return db.transaction((tx) => {
    const s = requireSession(tx, input.sessionId);
    if (s.state === 'finished' || s.state === 'abandoned') return s;
    const focusedMs = focusedMsAt(s, now);
    tx.update(focusSessions)
      .set({ state: input.outcome, focusedMs, lastResumedAt: null, endedAt: now, updatedAt: now })
      .where(eq(focusSessions.id, s.id))
      .run();
    if (input.outcome === 'finished') {
      completeTask(tx, requireTask(tx, s.taskId), now);
      setRecStatus(tx, s.recommendationId, 'completed', now);
    }
    appendEvent(tx, {
      userId: s.userId,
      type: 'focus_end',
      taskId: s.taskId,
      recommendationId: s.recommendationId,
      payload: {
        session_id: s.id,
        outcome: input.outcome,
        started_at: s.startedAt.toISOString(),
        ended_at: now.toISOString(),
        focused_ms: focusedMs,
        planned_minutes: s.plannedMinutes,
        est_minutes: s.estMinutes,
        fraction: Math.min(focusedMs / (s.plannedMinutes * 60_000), 1),
      },
      now,
    });
    return requireSession(tx, s.id);
  });
}

/** FR-31: optional, ≤ 2 taps, never blocking; ratings are labels, never rewards (§3.4). */
export function rateFocusSession(
  db: LocalDb,
  input: { sessionId: string; energy: 1 | 2 | 3; difficulty?: 1 | 2 | 3; now?: Date },
): FocusSessionRow {
  const now = input.now ?? new Date();
  return db.transaction((tx) => {
    const s = requireSession(tx, input.sessionId);
    tx.update(focusSessions)
      .set({ ratedEnergy: input.energy, ratedDifficulty: input.difficulty ?? null, updatedAt: now })
      .where(eq(focusSessions.id, s.id))
      .run();
    appendEvent(tx, {
      userId: s.userId,
      type: 'session_rated',
      taskId: s.taskId,
      recommendationId: s.recommendationId,
      payload: {
        session_id: s.id,
        energy: input.energy,
        difficulty: input.difficulty ?? null,
        outcome: s.state,
      },
      now,
    });
    return requireSession(tx, s.id);
  });
}

// --- block actions on the Today timeline ----------------------------------------------------------

export function markBlockDone(db: LocalDb, input: { recommendationId: string; now?: Date }): void {
  const now = input.now ?? new Date();
  db.transaction((tx) => {
    const rec = requireRec(tx, input.recommendationId);
    const task = completeTask(tx, requireTask(tx, rec.taskId), now);
    setRecStatus(tx, rec.id, 'completed', now);
    appendEvent(tx, {
      userId: rec.userId,
      type: 'task_completed',
      taskId: task.id,
      recommendationId: rec.id,
      payload: {
        done_at: now.toISOString(),
        source: 'block',
        completion_latency_minutes: minutesBetween(rec.slotStart, now),
      },
      now,
    });
  });
}

export interface SkipResult {
  task: TaskRow;
  /** UC-04 A2: ask the one-question diagnostic now. */
  diagnosticDue: boolean;
}

/** Explicit skip (row 6): never an error state, never red (FR-23; File 02 §3.4). */
export function skipBlock(
  db: LocalDb,
  input: { recommendationId: string; now?: Date },
): SkipResult {
  const now = input.now ?? new Date();
  return db.transaction((tx) => {
    const rec = requireRec(tx, input.recommendationId);
    const task = deferTask(tx, requireTask(tx, rec.taskId), now);
    setRecStatus(tx, rec.id, 'rejected', now);
    appendEvent(tx, {
      userId: rec.userId,
      type: 'block_skipped',
      taskId: task.id,
      recommendationId: rec.id,
      payload: {
        at: now.toISOString(),
        minutes_before_slot_end: minutesBetween(now, rec.slotEnd),
        skip_streak: task.skipStreak,
      },
      now,
    });
    return { task, diagnosticDue: task.skipStreak >= SKIP_DIAGNOSTIC_STREAK };
  });
}

/** UC-07 override: the move is a fact with both slots; the server computes the target context. */
export function moveBlock(
  db: LocalDb,
  input: { recommendationId: string; toStart: Date; now?: Date },
): RecommendationRow {
  const now = input.now ?? new Date();
  return db.transaction((tx) => {
    const rec = requireRec(tx, input.recommendationId);
    const durationMs = rec.slotEnd.getTime() - rec.slotStart.getTime();
    const toEnd = new Date(input.toStart.getTime() + durationMs);
    setRecStatus(tx, rec.id, 'moved', now, { slotStart: input.toStart, slotEnd: toEnd });
    appendEvent(tx, {
      userId: rec.userId,
      type: 'block_moved',
      taskId: rec.taskId,
      recommendationId: rec.id,
      payload: {
        from_start: rec.slotStart.toISOString(),
        from_end: rec.slotEnd.toISOString(),
        to_start: input.toStart.toISOString(),
        to_end: toEnd.toISOString(),
        distance_minutes: minutesBetween(rec.slotStart, input.toStart),
      },
      now,
    });
    return requireRec(tx, rec.id);
  });
}

/** UC-04 A1 "actually did it" on a lapsed block. */
export function correctLapse(db: LocalDb, input: { recommendationId: string; now?: Date }): void {
  const now = input.now ?? new Date();
  db.transaction((tx) => {
    const rec = requireRec(tx, input.recommendationId);
    const task = completeTask(tx, requireTask(tx, rec.taskId), now);
    setRecStatus(tx, rec.id, 'completed', now);
    appendEvent(tx, {
      userId: rec.userId,
      type: 'lapse_corrected',
      taskId: task.id,
      recommendationId: rec.id,
      payload: {
        at: now.toISOString(),
        hours_after_slot_end: (now.getTime() - rec.slotEnd.getTime()) / 3_600_000,
      },
      now,
    });
  });
}

export interface LapseScanResult {
  lapsed: RecommendationRow[];
  /** Tasks whose streak reached the UC-04 A2 threshold in this scan. */
  diagnosticDue: TaskRow[];
}

/**
 * Lazy lapse detection (File 05 §1; invariant 7): on foreground, every open block whose slot has
 * ended with no session and no completion is marked `lapsed` locally, the task returns to the
 * Inbox, and a `lapse_observed` fact is logged. Pure instant comparisons — a DST transition
 * cannot move a slot across the boundary. The 23:55 job remains the authority.
 */
export function lapseScan(db: LocalDb, input: { userId: string; now?: Date }): LapseScanResult {
  const now = input.now ?? new Date();
  return db.transaction((tx) => {
    const open = tx
      .select()
      .from(recommendations)
      .where(
        and(
          eq(recommendations.userId, input.userId),
          inArray(recommendations.status, [...OPEN_STATUSES]),
          lt(recommendations.slotEnd, now),
        ),
      )
      .all() as RecommendationRow[];
    const lapsed: RecommendationRow[] = [];
    const diagnosticDue: TaskRow[] = [];
    for (const rec of open) {
      const task = requireTask(tx, rec.taskId);
      if (task.status === 'done' || task.deletedAt !== null) continue;
      const sessions = sessionsForRecommendation(tx, rec.id);
      if (sessions.some((s) => s.state !== 'abandoned')) continue; // running/paused/finished
      const next = deferTask(tx, task, now);
      setRecStatus(tx, rec.id, 'lapsed', now);
      appendEvent(tx, {
        userId: rec.userId,
        type: 'lapse_observed',
        taskId: task.id,
        recommendationId: rec.id,
        payload: {
          observed_at: now.toISOString(),
          hours_after_slot_end: (now.getTime() - rec.slotEnd.getTime()) / 3_600_000,
          skip_streak: next.skipStreak,
        },
        now,
      });
      lapsed.push(requireRec(tx, rec.id));
      if (
        next.skipStreak >= SKIP_DIAGNOSTIC_STREAK &&
        next.skipStreak % SKIP_DIAGNOSTIC_STREAK === 0
      ) {
        diagnosticDue.push(next);
      }
    }
    return { lapsed, diagnosticDue };
  });
}

/** UC-04 A2: the answer routes to a split suggestion / affinity update / archive suggestion. */
export function answerSkipDiagnostic(
  db: LocalDb,
  input: { taskId: string; answer: SkipDiagnosticAnswer; now?: Date },
): TaskRow {
  const now = input.now ?? new Date();
  return db.transaction((tx) => {
    const task = requireTask(tx, input.taskId);
    const patch: Partial<TaskRow> = { skipStreak: 0 };
    if (input.answer === 'too_big') patch.splittable = true;
    if (input.answer === 'not_important') patch.status = 'archived';
    const next = writeTask(tx, task, patch, now);
    appendEvent(tx, {
      userId: task.userId,
      type: 'skip_diagnostic',
      taskId: task.id,
      payload: {
        answer: input.answer,
        consecutive_skips: task.skipStreak,
        category: task.category,
        est_minutes: task.estMinutes,
      },
      now,
    });
    return next;
  });
}

// --- server → local mirror (attribute-rewards response) ---------------------------------------

export interface ServerRecommendationPatch {
  id: string;
  status: RecommendationRow['status'];
  slot_start: string;
  slot_end: string;
  context_bucket: string;
  features: number[];
  attributed_at: string | null;
}

/** Facts beat plans, and the server's reading of the facts beats the device's local guess. */
export function applyServerRecommendations(
  db: LocalDb,
  rows: readonly ServerRecommendationPatch[],
  now = new Date(),
): void {
  if (rows.length === 0) return;
  db.transaction((tx) => {
    for (const r of rows) {
      tx.update(recommendations)
        .set({
          status: r.status,
          slotStart: new Date(r.slot_start),
          slotEnd: new Date(r.slot_end),
          contextBucket: r.context_bucket,
          features: r.features,
          attributedAt: r.attributed_at === null ? null : new Date(r.attributed_at),
          updatedAt: now,
        })
        .where(eq(recommendations.id, r.id))
        .run();
    }
  });
}
