# HANDOFF — current state for a zero-context session

> Refresh at every phase boundary (and on mid-phase context pressure). Resume line:
> **"Read CLAUDE.md, PLAN.md and docs/HANDOFF.md, then continue."**
> Last update: 2026-08-30, **P9 — Trust surfaces: complete; PR #17 merged; migration applied by
> the owner and the full label round trip verified live (31/31); follow-up PR #18 (badge fix +
> smoke) merged; P10 — Notifications, privacy, a11y, performance opens next.** Standing rules live in CLAUDE.md:
> "Working mode", "Context efficiency", "Simulator evidence".

## Where we are

- **P0–P9 merged** (PRs #1–#18). `main` = hosted project (P9 migration applied 2026-08-30; functions and the service image at PR #18).
- **What P9 built** (ADR-0013; CHANGELOG "P9"): a belief label (FR-41 ✓/✗, FR-33 correction,
  the review's "tell Hourwell" picker) is a `belief_label` **fact** through the op outbox → an
  `events` trigger materialises `belief_labels` (id = op_id, closed vocabularies enforced at the
  op) → the sync-resolve reward pass POSTs undelivered rows to the service's new `POST /labels`
  after the tuples → the service stores them and runs the **full rebuild** from tuples + the
  label in force per cell (weight = one prior's worth, α₀ + β₀; decays like evidence; `none`
  clears; invariant 6/5 measured in `test_feedback.py`/`test_energy.py`). `/insights` gained
  `beliefs`, per-cell `personal`, `learning_mode`, `labels`. New `insights` edge function =
  service document + File 06 §1.4 PAR per ISO week from facts only (H2 guarded by a source
  test) + prior provenance; 503 on outage (client keeps its MMKV cache). Mobile: Insights tab
  (learning-mode badge, OKLCH heatmap on native Views with one accessible summary + text view,
  beliefs with population/personal phrasing and toggles, weekly review), Today's FR-24 trade-off
  sheet (pick → task op + `tradeoff_decision` → manual re-plan; reject → `tradeoff_rejected`;
  once per plan).
- **Gates at the close:** typecheck/lint/Prettier clean · jest **382** (47 suites) · Deno
  **166** · pytest **149** (8 skipped) · pgTAP **23/23** (linked, rolled back) · expo-doctor
  21/21 · live smoke **10/10 + 2 SKIP** (`p9-live-smoke.mjs`; FR-24 verified live).
- **Deployed:** functions `insights`, `attribute-rewards`, `sync-resolve`, `plan-request` (P9
  versions); the service image from `phase/P9-smoke-close` (badge fix) rolled out to the VM;
  migration `20260829120000_p9_trust.sql` applied by the owner 2026-08-30. `p9-live-smoke.mjs`
  **31/31** on the migrated project — the full label round trip (see CHANGELOG "Live").
- **Docs current:** ADR-0013, `p9-manual-verification.md` (§1 gates, §2.1 tests, §2.2 smoke,
  §3 not established, §4 adversarial), traceability (7 P9 rows), CHANGELOG, PLAN board + P9
  status line, device checklist "Trust surfaces (added P9)", revisit (P9-tagged lines closed or
  re-scheduled + 4 new), thesis-corrections #40–#42, versions (P9: no new deps), explainer
  (P9 section + decisions 17–19 + status rows).

## P9 status

- **Adversarial pass done** (`p9-manual-verification.md` §4): 4 MAJOR + 10 MINOR, all MAJORs and
  8 MINORs fixed in `7c7c238` (acked facts get `server_ts`; insights cache scoped to the account;
  FR-24 drop no longer loops the sheet — `plan-request` filters tasks deferred past the horizon;
  belief toggles reachable by VoiceOver; unpin/clamp/order/tie-break/fallback/today-only). Two
  MINORs (#6 4xx label batch, #9 `error` vs `rejected`) and one note in revisit.md.
- **PR #17 merged 2026-08-29** after CI on the fix commit and the re-run smoke (fixed image +
  functions: 10/10 + 2 SKIP) were green.

## Exact next actions (next session, in order)

1. **⛔ Owner first (5 minutes):** from the repo root, `supabase db push --linked` (answer yes).
   It applies `20260829120000_p9_trust.sql` (the `belief_labels` ledger + trigger; pgTAP-verified
   against the linked project in a rolled-back transaction). Then, from `apps/mobile`:
   `node ../../docs/verification/p9-live-smoke.mjs` — expect **12+/12+, 0 SKIP**: the document
   checks and the label round trip (fact → trigger → `/labels` → rebuild: the cell's `succ` =
   α₀ + β₀ → `/insights` shows the label; `none` clears it; replay = duplicate; malformed
   state_ref rejected). Paste the output into `p9-manual-verification.md` §2.2 and flip the
   traceability FR-41 row to ✅ fully. Also regenerate `packages/shared/src/database.ts` with
   `supabase gen types typescript --linked > packages/shared/src/database.ts &&
./scripts/normalize-db-types.sh packages/shared/src/database.ts` and commit if it differs from
   the hand-written block (CI's db job is the authority either way).
2. `git checkout main && git pull`; `gh run list --branch main -L 1` green; then
   `git checkout -b phase/P10-notify` and open PR #18 "P10 — Notifications, privacy, a11y,
   performance" early.
3. **P10 reading list** (read nothing else to orient): PLAN §3 P10; specs/02 FR-26, FR-42, FR-50,
   NFR-A1, NFR-A2, NFR-P1–P3, UC-10; specs/07 §7 (retention windows: events 24 mo, anonymous
   30 d; export/deletion cascade), Appendix A rows "notification lead" (10 min, v1 static) and
   "daily notification cap" (5, spec-fixed); File 05 §1 (lazy lapse — notifications must not
   become a correctness dependency, invariant 7); ADR-0012 §9/§10 (displacement notice →
   revisit "P10 notifications" line); `docs/privacy/README.md` (G-items) + `consent-clause.md`;
   `docs/verification/device-checklist.md` (P10 owns "prepare for device verification":
   protocols + instrumentation, every device-conditioned item listed and runnable);
   `docs/decisions/revisit.md` lines tagged P10 (week-horizon budget, displacement push, drop
   deadline warning, two-device decisions); `apps/mobile/src/sync/useLapseScan.ts`,
   `src/domain/planTrigger.ts` (06:00 anchor → FR-26 evening ritual), `app/settings.tsx`
   (privacy section lands here), `src/observability/*` (opt-out surface, `isAnalyticsEnabled`).
4. **P10 scope** (PLAN §3): block-start reminders with lead time + per-category mute + hard
   ≤5/day cap (FR-50, tested under a storm); "plan tomorrow" evening ritual (FR-26); JSON export
   - full deletion in-app with ≤30-day cascade (FR-42/UC-10 — the deletion must also clear
     `belief_labels`, `feedback_rewards`, `beta_cells`, `bandit_state`, `blend_state`,
     `duration_estimates`, `gcal_sync_state`, `sync_ops`, `sync_leases`: verify every `ON DELETE
CASCADE`); WCAG 2.2 AA pass + 200 %/reduced-motion sweep (NFR-A1/A2) scoped as "prepare for
     device verification"; performance pass with numbers labelled simulator vs device.
5. **Verification depth for P10:** FR-42 deletion/export is thesis-critical (GDPR claim in the
   privacy README and the consent clause) — cascade verified with pgTAP + a live smoke; FR-50
   cap is routine but needs the storm test; a11y/perf are device-conditioned by rule.
6. Keep `docs/thesis/pojasnennia.uk.md` in the same commits; add device-checklist entries during
   the phase; refresh this file at the end and close with `HANDOFF WRITTEN — safe to /clear`.

## ⛔ ACTION REQUIRED (owner)

- **Consent clause review** — `docs/privacy/consent-clause.md` (draft; contact block to fill).
- **Google OAuth _sign-in_ (FR-01, P4 leftover):** second Web OAuth client with redirect
  `https://uapiuehjcntilwdmpojk.supabase.co/auth/v1/callback`, id + secret into Supabase
  Dashboard → Authentication → Providers → Google; the session then runs the P4 smoke.
- Earlier gates unchanged: magic-link E2E with a real mailbox, OSF-freeze text items.
- **Pre-enrollment list** (`docs/decisions/revisit.md`): Oracle PAYG (deferred); Google consent
  screen **Testing → In production**; the device verification pass before P12.

## Gotchas (P9 additions; earlier lists still apply)

- **Migration before image, always.** The service's `/insights` and every rebuild read
  `belief_labels`; deploying the P9 image/functions before the migration made `/insights` 500
  and (until `3d04a0c`) took `sync-resolve` down with it. The label stage is now resilient; the
  service is not (by design — it must not ignore its own schema).
- **`@testing-library/react-native` 14: `render` is async** — `await render(...)` and
  `await fireEvent.press(...)`; a sync `render` leaves `screen` unset ("`render` function has
  not been called").
- **`expo-router`'s `useFocusEffect` needs a navigator** — the shell test renders tabs without
  one; the Insights tab refreshes on mount + AppState `active` instead (same shape as the plan
  trigger).
- **Prettier runs before you re-read**: patching a file by exact text after `pnpm format`
  changed its line breaks silently no-ops — grep the anchor first (bit twice this phase).
- **zsh + `--include=*.py`**: quote glob patterns for `grep -r` (`--include='*.py'`).
- The permission classifier may refuse hosted-schema changes (`db push`); function deploys and
  `gh workflow run` were allowed. The owner runs the push; never route DDL through `db query`
  (it would skip the migration history table).
- **A smoke must not gate on a side query.** The first P9 smoke skipped its own point because a
  `supabase db query` gate evaluated false in the owner's shell; gates now read the thing under
  test (the function's response) and a parse failure prints instead of silently returning `[]`.
- **A label weighs one prior, not a veto**: a ✓ on a cell with prior μ₀ lifts it to
  (μ₀ + 1)/2 — write live expectations from that arithmetic (the DM evening cell reaches 0.70,
  below the 0.78 early-morning prior; the morning cell reaches 0.87 and moves the belief).
- **`deploy-recsys.yml` can be dispatched from a branch** (`gh workflow run deploy-recsys.yml
--ref <branch>`) — it pushes `:latest`, so the VM runs the branch's service until main's next
  merge rebuilds it; fine for a phase that merges the same code.
- Run jest from `apps/mobile`; `supabase db query --linked -f` resolves paths against the
  workdir; the shell cwd persists across tool calls.

## Open questions (owner)

- None new. ADR-0013 items marked owner-facing: the migration push (above) only.
