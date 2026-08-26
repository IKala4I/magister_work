/**
 * Profile DAO (FR-02) — same write discipline as tasks (src/db/writes.ts): one transaction
 * = local row + `profile_update` outbox op with the server-shaped snake_case payload, so
 * P8's sync-resolve replays it unchanged. Until the sync engine exists, the op is also
 * pushed directly by src/sync/profilePush.ts (ADR-0006 bridge) and acked there.
 *
 * The server instantiates cold-start priors via trigger when onboarding_completed_at first
 * lands (invariant 1: nothing model-state-shaped happens on the client).
 */
import { eq } from 'drizzle-orm';

import type { ChronotypeClass } from '../domain/rmeq';
import type { MinuteRange, WorkingHours } from '../domain/workingHours';

import { profiles } from './schema';
import { enqueueOp } from './writes';
import type { LocalDb } from './writes';

export type ProfileDraft = {
  timezone: string;
  locale: string;
  workingHours: WorkingHours;
  sleepWindow: MinuteRange;
  rmeqScore: number | null;
  chronotypeClass: ChronotypeClass | null;
  surveySkipped: boolean;
  topCategories: string[];
  onboardingCompletedAt: Date | null;
};

export type ProfileRow = typeof profiles.$inferSelect;

export function getProfile(db: LocalDb, userId: string): ProfileRow | undefined {
  return db.select().from(profiles).where(eq(profiles.userId, userId)).get() as
    ProfileRow | undefined;
}

function serverPayload(userId: string, draft: ProfileDraft): Record<string, unknown> {
  return {
    user_id: userId,
    timezone: draft.timezone,
    locale: draft.locale,
    working_hours: draft.workingHours,
    sleep_window: draft.sleepWindow,
    rmeq_score: draft.rmeqScore,
    chronotype_class: draft.chronotypeClass,
    survey_skipped: draft.surveySkipped,
    top_categories: draft.topCategories,
    onboarding_completed_at: draft.onboardingCompletedAt?.toISOString() ?? null,
  };
}

/** Insert-or-update the single local profile row for this user id + queue the op. */
export function saveProfile(
  db: LocalDb,
  input: { userId: string; draft: ProfileDraft; now: Date },
): ProfileRow {
  const { userId, draft, now } = input;
  return db.transaction((tx) => {
    const existing = getProfile(tx as LocalDb, userId);
    if (existing) {
      tx.update(profiles)
        .set({
          timezone: draft.timezone,
          locale: draft.locale,
          workingHours: draft.workingHours,
          sleepWindow: draft.sleepWindow,
          rmeqScore: draft.rmeqScore,
          chronotypeClass: draft.chronotypeClass,
          surveySkipped: draft.surveySkipped,
          topCategories: draft.topCategories,
          onboardingCompletedAt: draft.onboardingCompletedAt,
          updatedAt: now,
        })
        .where(eq(profiles.userId, userId))
        .run();
    } else {
      tx.insert(profiles)
        .values({
          userId,
          timezone: draft.timezone,
          locale: draft.locale,
          workingHours: draft.workingHours,
          sleepWindow: draft.sleepWindow,
          rmeqScore: draft.rmeqScore,
          chronotypeClass: draft.chronotypeClass,
          surveySkipped: draft.surveySkipped,
          topCategories: draft.topCategories,
          onboardingCompletedAt: draft.onboardingCompletedAt,
          updatedAt: now,
        })
        .run();
    }
    enqueueOp(tx as LocalDb, {
      opType: 'profile_update',
      entityId: userId,
      payload: serverPayload(userId, draft),
      baseVersion: existing?.version ?? null,
      now,
    });
    return getProfile(tx as LocalDb, userId) as ProfileRow;
  });
}

/**
 * Pull-path upsert: mirror a row the SERVER already owns. Deliberately enqueues nothing —
 * echoing a pulled row back as a `profile_update` op would bump the server version on every
 * account switch for no reason (P4 adversarial finding m3). Push paths use saveProfile.
 */
export function upsertProfileFromServer(
  db: LocalDb,
  input: {
    userId: string;
    draft: ProfileDraft;
    version: number;
    serverSeq: number | null;
    now: Date;
  },
): void {
  const { userId, draft, now } = input;
  db.transaction((tx) => {
    const existing = getProfile(tx as LocalDb, userId);
    const values = {
      timezone: draft.timezone,
      locale: draft.locale,
      workingHours: draft.workingHours,
      sleepWindow: draft.sleepWindow,
      rmeqScore: draft.rmeqScore,
      chronotypeClass: draft.chronotypeClass,
      surveySkipped: draft.surveySkipped,
      topCategories: draft.topCategories,
      onboardingCompletedAt: draft.onboardingCompletedAt,
      version: input.version,
      serverSeq: input.serverSeq,
      updatedAt: now,
    };
    if (existing) {
      tx.update(profiles).set(values).where(eq(profiles.userId, userId)).run();
    } else {
      tx.insert(profiles)
        .values({ userId, ...values })
        .run();
    }
  });
}

/** Record what the server accepted (bridge push or, later, sync pull). */
export function markProfileSynced(
  db: LocalDb,
  input: { userId: string; version: number; serverSeq: number | null },
): void {
  db.update(profiles)
    .set({ version: input.version, serverSeq: input.serverSeq })
    .where(eq(profiles.userId, input.userId))
    .run();
}
