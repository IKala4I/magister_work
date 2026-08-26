/**
 * P4 bridge push for the profile row ONLY (ADR-0006): the real push engine is P8's
 * sync-resolve; onboarding cannot wait for it because the server must hold the profile to
 * instantiate cold-start priors (trigger on onboarding_completed_at) and to assemble /plan
 * context in P6. So: the profile still goes local-first through the outbox (writes.ts
 * discipline), and this module drains just the `profile_update` ops by upserting the
 * CURRENT local row (each op carries the full row, so the newest state supersedes queued
 * history; all pending profile ops are acked together). P8 replaces this with op replay.
 *
 * Never runs unless the local row already belongs to the signed-in uid — the adopt
 * contract (src/auth/accountTransition.ts) must have rewritten placeholder ids first.
 */
import { and, eq, isNull } from 'drizzle-orm';

import { supabase } from '../auth/client';
import { db } from '../db/client';
import { getProfile, markProfileSynced } from '../db/profile';
import { opOutbox } from '../db/schema';
import type { LocalDb } from '../db/writes';

export type ProfilePushResult =
  'pushed' | 'nothing-pending' | 'no-session' | 'not-adopted' | 'failed';

export async function pushProfileIfPossible(): Promise<ProfilePushResult> {
  if (!supabase) return 'no-session';
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return 'no-session';

  const localDb = db as unknown as LocalDb;
  const pending = localDb
    .select()
    .from(opOutbox)
    .where(and(eq(opOutbox.opType, 'profile_update'), isNull(opOutbox.ackedAt)))
    .all();
  if (pending.length === 0) return 'nothing-pending';

  const row = getProfile(localDb, uid);
  if (!row) return 'not-adopted'; // local profile still on a placeholder id — adopt first

  const now = new Date();
  const { data: saved, error } = await supabase
    .from('profiles')
    .upsert(
      {
        user_id: uid,
        timezone: row.timezone,
        locale: row.locale,
        working_hours: row.workingHours as never,
        sleep_window: row.sleepWindow as never,
        rmeq_score: row.rmeqScore,
        chronotype_class: row.chronotypeClass,
        survey_skipped: row.surveySkipped,
        top_categories: (row.topCategories ?? []) as string[],
        onboarding_completed_at: row.onboardingCompletedAt?.toISOString() ?? null,
      },
      { onConflict: 'user_id' },
    )
    .select('version, server_seq')
    .single();

  if (error) {
    const newest = pending[pending.length - 1];
    if (newest) {
      localDb
        .update(opOutbox)
        .set({ attempts: newest.attempts + 1, lastError: error.message })
        .where(eq(opOutbox.seq, newest.seq))
        .run();
    }
    return 'failed';
  }

  localDb.transaction((tx) => {
    for (const op of pending) {
      tx.update(opOutbox).set({ sentAt: now, ackedAt: now }).where(eq(opOutbox.seq, op.seq)).run();
    }
  });
  markProfileSynced(localDb, {
    userId: uid,
    version: saved.version,
    serverSeq: saved.server_seq == null ? null : Number(saved.server_seq),
  });
  return 'pushed';
}
