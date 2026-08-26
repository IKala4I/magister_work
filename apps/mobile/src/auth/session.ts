/**
 * Auth session state (Zustand — ephemeral UI mirror of supabase-js's persisted session)
 * plus the transition orchestration:
 *   INITIAL_SESSION/SIGNED_IN → adopt (first uid ever), no-op (same uid), or
 *   wipe + server-profile rehydrate (different uid — the cursor contract), then
 *   record lastUserId and opportunistically push the profile bridge op.
 * Anonymous bootstrap (FR-01 "trial from first launch"): when there has never been a
 * session on this install, silently create an anonymous user as soon as the network
 * allows; until then the P3 local placeholder keeps everything working offline.
 *
 * Supabase callback rule: no awaited supabase calls inside onAuthStateChange (it holds the
 * auth lock) — all follow-up work is deferred to a macrotask.
 */
import type { Session } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { db } from '../db/client';
import { markProfileSynced, saveProfile } from '../db/profile';
import type { LocalDb } from '../db/writes';
import { track } from '../observability/analytics';
import { pushProfileIfPossible } from '../sync/profilePush';

import { adoptLocalData, wipeLocalMirror } from './accountTransition';
import { isAuthAvailable, supabase, wireAutoRefresh } from './client';
import { getLastUserId, setLastUserId } from './identity';

export type SessionState = {
  /** 'unknown' until the persisted session has been read once. */
  status: 'unknown' | 'signed_out' | 'signed_in';
  userId: string | null;
  email: string | null;
  isAnonymous: boolean;
};

export const useSessionStore = create<SessionState>(() => ({
  status: isAuthAvailable() ? 'unknown' : 'signed_out',
  userId: null,
  email: null,
  isAnonymous: false,
}));

function applySession(session: Session | null): void {
  useSessionStore.setState(
    session
      ? {
          status: 'signed_in',
          userId: session.user.id,
          email: session.user.email ?? null,
          isAnonymous: session.user.is_anonymous ?? false,
        }
      : { status: 'signed_out', userId: null, email: null, isAnonymous: false },
  );
}

/**
 * A different account's rows are on the server; the P4 bridge can rehydrate the profile
 * (tasks and the rest arrive with real sync in P8). Failure is fine — the user just
 * re-onboards and the server keeps their beta_cells (ON CONFLICT DO NOTHING).
 */
async function rehydrateProfile(localDb: LocalDb, userId: string): Promise<void> {
  if (!supabase) return;
  const { data } = await supabase.from('profiles').select().eq('user_id', userId).maybeSingle();
  if (!data || !data.onboarding_completed_at) return;
  saveProfile(localDb, {
    userId,
    draft: {
      timezone: data.timezone,
      locale: data.locale,
      workingHours: (data.working_hours ?? {}) as never,
      sleepWindow: (data.sleep_window ?? [1380, 420]) as never,
      rmeqScore: data.rmeq_score,
      chronotypeClass: data.chronotype_class as never,
      surveySkipped: data.survey_skipped,
      topCategories: data.top_categories,
      onboardingCompletedAt: new Date(data.onboarding_completed_at),
    },
    now: new Date(),
  });
  markProfileSynced(localDb, {
    userId,
    version: data.version,
    serverSeq: data.server_seq == null ? null : Number(data.server_seq),
  });
}

async function handleSignedIn(session: Session): Promise<void> {
  const uid = session.user.id;
  const lastUid = getLastUserId();
  const localDb = db as unknown as LocalDb;
  if (lastUid === uid) {
    // Same account resuming — nothing to move.
  } else if (lastUid == null) {
    adoptLocalData(localDb, uid); // first sign-in ever on this install (contract, P3)
  } else {
    wipeLocalMirror(localDb); // different account — cursor contract (src/sync/cursor.ts)
    await rehydrateProfile(localDb, uid);
  }
  setLastUserId(uid);
  await pushProfileIfPossible();
}

let bootstrapAttempted = false;

/** Create the anonymous trial user once, silently; offline failures retry next launch. */
async function bootstrapAnonymous(): Promise<void> {
  if (!supabase || bootstrapAttempted) return;
  bootstrapAttempted = true;
  const { error } = await supabase.auth.signInAnonymously();
  if (!error) track('auth_event', { method: 'anonymous', event: 'signed_in' });
}

/** Call once from the root layout (same pattern as initSentry/initAnalytics). */
export function initAuth(): void {
  if (!supabase) return;
  wireAutoRefresh();
  // Foreground = retry moment for the profile bridge op queued while offline (NFR-R1).
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void pushProfileIfPossible();
  });
  supabase.auth.onAuthStateChange((event, session) => {
    applySession(session);
    setTimeout(() => {
      if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        void handleSignedIn(session).catch(() => {
          // Never crash auth wiring; the next foreground/push retries.
        });
      }
      if (event === 'INITIAL_SESSION' && !session && getLastUserId() == null) {
        void bootstrapAnonymous();
      }
    }, 0);
  });
}
