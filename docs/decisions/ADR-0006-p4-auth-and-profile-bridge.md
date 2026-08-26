# ADR-0006 — P4 auth architecture: anonymous-first, encrypted session storage, profile bridge push

- **Date:** 2026-08-26
- **Status:** accepted (bridge parts superseded by sync-resolve in P8 by design)
- **Phase:** P4
- **Spec anchors:** FR-01/FR-02; specs/07 §4.4 (anonymous users), §5; File 03 stack pins;
  binding contracts in `src/sync/localUser.ts` + `src/sync/cursor.ts` (P3)

## Context

P4 ships auth and onboarding, but the sync engine is P8. Three gaps had to be bridged without
half-building P8: the server must hold the profile at onboarding completion (the priors
trigger and P6's `/plan` context need it); the session must be stored securely on device; and
FR-01's anonymous trial must not create UX friction or duplicate accounts.

## Decisions

1. **Anonymous-first bootstrap.** On first launch with no session and no previous uid, the app
   silently calls `signInAnonymously()` (deferred, retried on later launches; offline failures
   are invisible — the P3 local placeholder keeps everything working). A `bootstrapAttempted`
   latch plus the `lastUserId` guard prevents anonymous-account chains. Conversion is
   `updateUser({ email })` — same uid, no data migration (specs/07 §4.4); `email_exists` routes
   to sign-in-instead with a data-replacement warning.
2. **Session storage.** The official Supabase Expo "LargeSecureStore" pattern (expo-secure-store
   caps values at 2048 bytes): AES-256-CTR ciphertext with a fresh key per write; the key lives
   in the keychain/keystore via expo-secure-store. Deviation from the sample: ciphertext goes to
   **MMKV** instead of adding AsyncStorage — one fewer storage dependency, and the pinned intent
   ("session in expo-secure-store") holds because MMKV bytes are useless without the
   SecureStore key. PKCE flow; `detectSessionInUrl` off (no window.location in RN); the
   auth-callback route feeds deep-link URLs in explicitly and guards the one-shot code.
3. **Account transitions (the P3 contracts, now implemented).** First sign-in ever →
   `adoptLocalData` rewrites every row AND every op_outbox payload owned by the `local:` id
   inside one transaction, before any push. A different uid signing in → `wipeLocalMirror`
   (mirror + queue) + `resetSyncCursor` (global `server_seq` would otherwise skip the new
   account's rows), then a profile rehydrate from the server; device id and op counter survive
   (op_ids are never reused). Plain sign-out wipes nothing — the data still belongs to the last
   account on this device, and `currentUserId()` falls back to it for new writes.
4. **Profile bridge push (P4-only sync).** Profiles keep the P3 write discipline (local row +
   `profile_update` op). Until sync-resolve exists, `pushProfileIfPossible()` drains ONLY
   profile ops by upserting the CURRENT local row (each op carries the full row, so the newest
   state supersedes queued history; all pending profile ops are acked together). It runs after
   onboarding completion, on sign-in, and on every foreground. Version semantics are
   last-write-wins for this single-owner row until P8 adds `base_version` arbitration in
   sync-resolve; the op still records `base_version` so P8 can replay strictly. Rehydration
   (`rehydrateProfile`) is the read half: a returning user's completed profile is fetched
   directly so they skip onboarding (tasks return with real sync in P8).
5. **Defaults (PLAN §4B "working-hours template").** Working hours Mon–Fri 09:00–18:00
   ([540,1080]); sleep window 23:00–07:00 ([1380,420] — the specs/07 §5 example). Everything
   editable in 30-min steps during onboarding; no overnight _working_ ranges in v1 (the sleep
   window is the overnight object). Recorded as spec-conflicts L13 alongside the rMEQ wording
   (Appendix A had no rows for either). Onboarding requires **at least one working day**
   (adversarial m8): the MVP schedules only inside declared hours (decision 5 / UC-01 A2), so
   zero declared hours would make every plan empty; the all-days-off state shows a truthful
   "toggle at least one day" message. The server still tolerates empty hours defensively
   (weaker priors, never an error).
6. **Google OAuth** ships code-complete via `signInWithOAuth` + `WebBrowser.openAuthSessionAsync`
   (browser flow needs only Supabase-side provider config — no native SDK, no SHA certs). It
   stays inert behind the ⛔ consent-screen gate; the button surfaces the provider error as
   friendly copy.

## Rejected

- **Native Google Sign-In SDK** — needs the same consent screen plus native config for both
  platforms; the browser flow is the documented Supabase RN path and sufficient for FR-01.
- **Pushing profiles outside the outbox entirely** — would fork the write discipline P3
  established; the bridge preserves ops for P8 replay.
- **Prorating a partially answered rMEQ** — see ADR-0005.

## Consequences

- P8 must replace `pushProfileIfPossible` with op replay through sync-resolve and delete the
  bridge; the acked-op semantics here were chosen so that leftover P4 ops can never replay
  stale state later.
- Magic-link and conversion E2E need a real mailbox and the OAuth path needs the consent
  screen — both recorded as owner actions in the P4 report; deep-link behavior from real mail
  clients is on `docs/verification/device-checklist.md`.
