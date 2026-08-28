/**
 * Auth session state (Zustand — ephemeral UI mirror of supabase-js's persisted session)
 * plus the transition orchestration:
 *   INITIAL_SESSION/SIGNED_IN → adopt (first uid ever), no-op (same uid), or the account
 *   change (different uid — wipe, or the deferred wipe when the previous account still has
 *   unsynced changes, ADR-0012 §11), then record lastUserId and sync (the pull brings a
 *   returning user's profile, tasks and plans — the P4 rehydrate bridge is gone).
 * Anonymous bootstrap (FR-01 "trial from first launch"): when there has never been a
 * session on this install, silently create an anonymous user as soon as the network
 * allows; until then the P3 local placeholder keeps everything working offline.
 *
 * Supabase callback rule: no awaited supabase calls inside onAuthStateChange (it holds the
 * auth lock) — all follow-up work is deferred to a macrotask.
 */
import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { db } from '../db/client';
import type { LocalDb } from '../db/writes';
import { track } from '../observability/analytics';
import { syncNow } from '../sync/engine';

import { adoptLocalData, reconcilePendingWipe, transitionToAccount } from './accountTransition';
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

async function handleSignedIn(session: Session): Promise<void> {
  const uid = session.user.id;
  const lastUid = getLastUserId();
  const localDb = db as unknown as LocalDb;
  if (lastUid === uid) {
    // Same account resuming — nothing to move.
  } else if (lastUid == null) {
    adoptLocalData(localDb, uid); // first sign-in ever on this install (contract, P3)
  } else {
    transitionToAccount(localDb, lastUid); // wipe, or defer it (cursor contract, ADR-0012 §11)
  }
  reconcilePendingWipe(localDb, uid);
  setLastUserId(uid);
  // The pull rehydrates a returning user (profile first — the onboarding gate re-renders on
  // the profiles table); offline is fine, the next foreground retries.
  await syncNow('sign_in');
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
  supabase.auth.onAuthStateChange((event, session) => {
    // Conversion completes when a formerly anonymous session stops being anonymous.
    const wasAnonymous = useSessionStore.getState().isAnonymous;
    applySession(session);
    setTimeout(() => {
      if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        void handleSignedIn(session).catch(() => {
          // Never crash auth wiring; the next foreground/sync retries.
        });
      }
      if (event === 'USER_UPDATED' && wasAnonymous && session?.user.is_anonymous === false) {
        track('auth_event', { method: 'magic_link', event: 'converted' });
      }
      if (event === 'INITIAL_SESSION' && !session && getLastUserId() == null) {
        void bootstrapAnonymous();
      }
    }, 0);
  });
}
