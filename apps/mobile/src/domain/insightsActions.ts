/**
 * UI-facing P9 actions: the DAO write (SQLite + outbox + fact) plus the PostHog mirror (NFR-O1;
 * categorical only, NFR-S3) plus a debounced sync so a label reaches the service while the
 * device is online — the same shape as blockActions.ts. Imports the device database, so
 * component tests mock this module.
 */
import { currentUserId } from '../auth/identity';
import { db } from '../db/client';
import {
  applyTradeoffOption,
  labelBelief,
  recordWeeklyReview,
  rejectTradeoffs,
  stateRefOf,
} from '../db/insights';
import type { PlanRow } from '../db/plans';
import type { TaskCategory } from '../db/tasks';
import type { LocalDb } from '../db/writes';
import { track } from '../observability/analytics';
import { scheduleSync } from '../sync/engine';
import { runPlanRequest } from '../sync/usePlanTrigger';

import type { Belief, BeliefLabel, Daypart } from './heatmap';
import type { TradeOffOption } from './tradeoff';

const localDb = db as unknown as LocalDb;

export function labelBeliefAction(
  belief: Pick<Belief, 'state_ref' | 'category' | 'daypart' | 'day_type'>,
  label: BeliefLabel,
  surface: 'beliefs' | 'review',
): void {
  labelBelief(localDb, { userId: currentUserId(), stateRef: belief.state_ref, label, surface });
  track('belief_labeled', {
    label,
    category: belief.category,
    daypart: belief.daypart,
    day_type: belief.day_type,
    surface,
  });
  scheduleSync('write');
}

/** FR-33 "actually, I am a morning person": a ✓ on the (category, daypart, weekday) cell. */
export function tellBestTimeAction(category: TaskCategory, daypart: Daypart): void {
  const stateRef = stateRefOf(category, daypart, 'weekday');
  labelBelief(localDb, { userId: currentUserId(), stateRef, label: 'correct', surface: 'picker' });
  track('belief_labeled', {
    label: 'correct',
    category,
    daypart,
    day_type: 'weekday',
    surface: 'picker',
  });
  scheduleSync('write');
}

export function completeWeeklyReviewAction(input: {
  week: string;
  learnings: number;
  labelsSet: number;
  trend: 'up' | 'down' | 'flat' | null;
}): void {
  recordWeeklyReview(localDb, { userId: currentUserId(), ...input });
  track('weekly_review_completed', {
    week: input.week,
    learnings: input.learnings,
    labels_set: input.labelsSet,
    trend: input.trend,
  });
  scheduleSync('write');
}

export function applyTradeoffAction(input: {
  plan: PlanRow;
  option: TradeOffOption;
  rank: number;
  options: readonly TradeOffOption[];
}): void {
  try {
    applyTradeoffOption(localDb, {
      userId: currentUserId(),
      planId: input.plan.id,
      option: input.option,
      rank: input.rank,
      options: input.options,
    });
  } catch {
    // the task vanished meanwhile (deleted on another device): the sheet's answer is still a
    // decision — record it as "keep as is" rather than crash the press (P9 adversarial #12)
    rejectTradeoffsAction(input);
    return;
  }
  track('tradeoff_decided', {
    outcome: 'chosen',
    kind: input.option.kind,
    rank: input.rank,
    options: input.options.length,
  });
  // "the user's pick returns as a new /plan call with the option applied" (specs/07 §5)
  void runPlanRequest('manual');
}

export function rejectTradeoffsAction(input: {
  plan: PlanRow;
  options: readonly TradeOffOption[];
}): void {
  rejectTradeoffs(localDb, {
    userId: currentUserId(),
    planId: input.plan.id,
    options: input.options,
  });
  track('tradeoff_decided', {
    outcome: 'rejected_all',
    kind: null,
    rank: null,
    options: input.options.length,
  });
  scheduleSync('write');
}
