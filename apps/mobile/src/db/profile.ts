/**
 * Profile DAO (FR-02) — same write discipline as tasks (src/db/writes.ts): one transaction
 * = local row + `profile_update` outbox op with the server-shaped snake_case payload, so
 * sync-resolve replays it (P8: the engine in src/sync/engine.ts; the P4 bridge is gone). The
 * payload carries `version` and `updated_at` — the class-2 merge inputs (ADR-0012 §4).
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
  /**
   * `profiles.settings` (specs/07 §4.1; notification prefs — src/domain/notificationSettings).
   * Undefined = leave the stored blob alone (the replay RPC keeps it when the payload has none).
   */
  settings?: Record<string, unknown> | null;
};

export type ProfileRow = typeof profiles.$inferSelect;

export function getProfile(db: LocalDb, userId: string): ProfileRow | undefined {
  return db.select().from(profiles).where(eq(profiles.userId, userId)).get() as
    ProfileRow | undefined;
}

function serverPayload(
  userId: string,
  draft: ProfileDraft,
  meta: { version: number; updatedAt: Date },
): Record<string, unknown> {
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
    // P10 (ADR-0014 §5): only when the caller carries settings — absent keeps the server's
    ...(draft.settings !== undefined && draft.settings !== null
      ? { settings: draft.settings }
      : {}),
    // P8 merge inputs (ADR-0012 §4): the version this edit produces and its edit time
    version: meta.version,
    updated_at: meta.updatedAt.getTime(),
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
          ...(draft.settings !== undefined ? { settings: draft.settings } : {}),
          version: existing.version + 1,
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
          ...(draft.settings !== undefined ? { settings: draft.settings } : {}),
          updatedAt: now,
        })
        .run();
    }
    enqueueOp(tx as LocalDb, {
      opType: 'profile_update',
      entityId: userId,
      payload: serverPayload(userId, draft, {
        version: existing ? existing.version + 1 : 1,
        updatedAt: now,
      }),
      baseVersion: existing?.version ?? null,
      now,
    });
    return getProfile(tx as LocalDb, userId) as ProfileRow;
  });
}

/** The row as a draft — the full snapshot every `profile_update` op must carry (RPC semantics). */
export function draftFromRow(row: ProfileRow): ProfileDraft {
  return {
    timezone: row.timezone,
    locale: row.locale,
    workingHours: row.workingHours as WorkingHours,
    sleepWindow: row.sleepWindow as MinuteRange,
    rmeqScore: row.rmeqScore,
    chronotypeClass: row.chronotypeClass,
    surveySkipped: row.surveySkipped,
    topCategories: row.topCategories as string[],
    onboardingCompletedAt: row.onboardingCompletedAt,
    settings: (row.settings as Record<string, unknown> | null) ?? null,
  };
}

/**
 * P10 (ADR-0014 §5): replace `profiles.settings` for the current row — same transaction shape
 * as saveProfile (row + op with the full snapshot, base_version chained). No row → nothing.
 */
export function updateProfileSettings(
  db: LocalDb,
  input: { userId: string; settings: Record<string, unknown>; now?: Date },
): ProfileRow | undefined {
  const existing = getProfile(db, input.userId);
  if (existing === undefined) return undefined;
  return saveProfile(db, {
    userId: input.userId,
    draft: { ...draftFromRow(existing), settings: input.settings },
    now: input.now ?? new Date(),
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
      ...(draft.settings !== undefined ? { settings: draft.settings } : {}),
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
