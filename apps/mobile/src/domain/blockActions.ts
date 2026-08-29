/**
 * UI-facing feedback actions: the DAO write (SQLite + outbox + fact) plus the PostHog mirror
 * (NFR-O1; categorical only, NFR-S3) plus a debounced sync so the instant phase runs while the
 * device is online. Imports the device database, so component tests mock this module
 * and the DAO is covered in src/db/__tests__/feedbackDao.test.ts.
 */
import { currentUserId } from '../auth/identity';
import { db } from '../db/client';
import {
  answerSkipDiagnostic,
  correctLapse,
  endFocusSession,
  markBlockDone,
  moveBlock,
  pauseFocusSession,
  rateFocusSession,
  resumeFocusSession,
  skipBlock,
  startFocusSession,
  type FocusSessionRow,
  type SkipDiagnosticAnswer,
} from '../db/feedback';
import type { RecommendationRow } from '../db/plans';
import type { TaskRow } from '../db/tasks';
import type { LocalDb } from '../db/writes';
import { track } from '../observability/analytics';
import { scheduleSync } from '../sync/engine';

const localDb = db as unknown as LocalDb;

function tagOf(rec: RecommendationRow) {
  return { model_version: rec.modelVersion ?? 'unknown', engine: rec.engine ?? 'heuristic' };
}

function afterFact(): void {
  scheduleSync('write');
}

export function startFocusAction(rec: RecommendationRow): FocusSessionRow {
  const s = startFocusSession(localDb, { userId: currentUserId(), recommendationId: rec.id });
  track('block_action', { action: 'start', is_experiment: rec.isExperiment, ...tagOf(rec) });
  afterFact();
  return s;
}

export function pauseFocusAction(sessionId: string): FocusSessionRow {
  const s = pauseFocusSession(localDb, { sessionId });
  afterFact();
  return s;
}

export function resumeFocusAction(sessionId: string): FocusSessionRow {
  const s = resumeFocusSession(localDb, { sessionId });
  afterFact();
  return s;
}

export function endFocusAction(
  sessionId: string,
  outcome: 'finished' | 'abandoned',
): FocusSessionRow {
  const s = endFocusSession(localDb, { sessionId, outcome });
  track('focus_session_ended', {
    outcome,
    focused_minutes: Math.round(s.focusedMs / 60_000),
    planned_minutes: s.plannedMinutes,
  });
  afterFact();
  return s;
}

export function rateSessionAction(
  sessionId: string,
  energy: 1 | 2 | 3,
  difficulty?: 1 | 2 | 3,
): void {
  rateFocusSession(localDb, { sessionId, energy, difficulty });
  track('session_rated', { energy, has_difficulty: difficulty !== undefined });
  afterFact();
}

export function doneBlockAction(rec: RecommendationRow): void {
  markBlockDone(localDb, { recommendationId: rec.id });
  track('block_action', { action: 'done', is_experiment: rec.isExperiment, ...tagOf(rec) });
  afterFact();
}

export function skipBlockAction(rec: RecommendationRow): { task: TaskRow; diagnosticDue: boolean } {
  const r = skipBlock(localDb, { recommendationId: rec.id });
  track('block_action', { action: 'skip', is_experiment: rec.isExperiment, ...tagOf(rec) });
  afterFact();
  return r;
}

export function moveBlockAction(rec: RecommendationRow, toStart: Date): RecommendationRow {
  const r = moveBlock(localDb, { recommendationId: rec.id, toStart });
  track('block_action', { action: 'move', is_experiment: rec.isExperiment, ...tagOf(rec) });
  afterFact();
  return r;
}

export function correctLapseAction(rec: RecommendationRow): void {
  correctLapse(localDb, { recommendationId: rec.id });
  track('block_action', { action: 'did_it', is_experiment: rec.isExperiment, ...tagOf(rec) });
  afterFact();
}

export function skipDiagnosticAction(taskId: string, answer: SkipDiagnosticAnswer): TaskRow {
  const t = answerSkipDiagnostic(localDb, { taskId, answer });
  track('skip_diagnostic', { answer });
  afterFact();
  return t;
}
