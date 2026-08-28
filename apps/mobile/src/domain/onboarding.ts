/**
 * Onboarding completion (FR-02, UC-01 postcondition "profile persisted; cold-start priors
 * selected"): score the survey, persist the profile locally through the outbox discipline,
 * then sync so the server trigger instantiates priors (invariant 1 — selection
 * happens entirely server-side; this module never computes a prior).
 */
import { getCalendars } from 'expo-localization';

import { currentUserId } from '../auth/identity';
import { db } from '../db/client';
import { saveProfile } from '../db/profile';
import type { ProfileRow } from '../db/profile';
import type { LocalDb } from '../db/writes';
import { track } from '../observability/analytics';
import { scheduleSync } from '../sync/engine';

import { scoreRmeq } from './rmeq';
import type { RmeqAnswers } from './rmeq';
import type { MinuteRange, WorkingHours } from './workingHours';

export function deviceTimezone(): string {
  return getCalendars()[0]?.timeZone ?? 'UTC';
}

export function completeOnboardingAction(input: {
  answers: RmeqAnswers;
  workingHours: WorkingHours;
  sleepWindow: MinuteRange;
  topCategories: string[];
  seedTasksAdded: number;
}): ProfileRow {
  const result = scoreRmeq(input.answers);
  const row = saveProfile(db as unknown as LocalDb, {
    userId: currentUserId(),
    draft: {
      timezone: deviceTimezone(),
      locale: 'en',
      workingHours: input.workingHours,
      sleepWindow: input.sleepWindow,
      rmeqScore: result.score,
      chronotypeClass: result.chronotypeClass,
      surveySkipped: result.skipped,
      topCategories: input.topCategories,
      onboardingCompletedAt: new Date(),
    },
    now: new Date(),
  });
  track('onboarding_completed', {
    survey_skipped: result.skipped,
    chronotype_class: result.chronotypeClass,
    top_categories_count: input.topCategories.length,
    seed_tasks_added: input.seedTasksAdded,
  });
  scheduleSync('write'); // offline is fine — the op waits, foreground retries
  return row;
}
