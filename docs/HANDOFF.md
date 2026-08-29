# HANDOFF — current state for a zero-context session

> Refresh at every phase boundary (and on mid-phase context pressure). Resume line:
> **"Read CLAUDE.md, PLAN.md and docs/HANDOFF.md, then continue."**
> Last update: 2026-08-29 (afternoon), **P9 — Trust surfaces: code-complete on `phase/P9-trust`
> (PR #17); one ⛔ owner step (migration push) gates the live label round trip; P10 —
> Notifications, privacy, a11y, performance opens next.** Standing rules live in CLAUDE.md:
> "Working mode", "Context efficiency", "Simulator evidence".

## Where we are

- **P0–P8 merged** (PRs #1–#16). **P9 on PR #17** — see "P9 status" below for merge state.
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
- **Gates at the close:** typecheck/lint/Prettier clean · jest **380** (47 suites) · Deno
  **166** · pytest **146** (8 skipped) · pgTAP **21/21** (linked, rolled back) · expo-doctor
  21/21 · live smoke **10/10 + 2 SKIP** (`p9-live-smoke.mjs`; FR-24 verified live).
- **Deployed:** functions `insights`, `attribute-rewards`, `sync-resolve` (P9 versions); the
  service image built from the branch by `deploy-recsys.yml` (workflow_dispatch) and rolled out
  to the VM (confirmed by the workflow). **NOT applied:** migration
  `20260829120000_p9_trust.sql` — see ⛔ below. Until it is, the service's `/insights` and any
  `/feedback` correction rebuild answer 500 (they read `belief_labels`): the Insights tab shows
  its cached/empty state via the 503 contract, and a UC-04 A1 correction stays undelivered
  (re-sent every pass, never lost). Sync itself is unaffected (fix `3d04a0c`).
- **Docs current:** ADR-0013, `p9-manual-verification.md` (§1 gates, §2.1 tests, §2.2 smoke,
  §3 not established, §4 adversarial), traceability (7 P9 rows), CHANGELOG, PLAN board + P9
  status line, device checklist "Trust surfaces (added P9)", revisit (P9-tagged lines closed or
  re-scheduled + 4 new), thesis-corrections #40–#42, versions (P9: no new deps), explainer
  (P9 section + decisions 17–19 + status rows).

## P9 status

_(see the P9 report in the session transcript / PR #17; the adversarial pass outcome is in
`p9-manual-verification.md` §4)_

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

- **P9 migration push** — item 1 above. The session's permission classifier refused
  `supabase db push --linked --yes` (a hosted-schema change); everything else of P9 is deployed.
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
  `gh workflow run` were allowed. Run the migration push as the owner, do not route the DDL
  through `db query` (it would skip the migration history table).
- **`deploy-recsys.yml` can be dispatched from a branch** (`gh workflow run deploy-recsys.yml
--ref <branch>`) — it pushes `:latest`, so the VM runs the branch's service until main's next
  merge rebuilds it; fine for a phase that merges the same code.
- Run jest from `apps/mobile`; `supabase db query --linked -f` resolves paths against the
  workdir; the shell cwd persists across tool calls.

## Open questions (owner)

- None new. ADR-0013 items marked owner-facing: the migration push (above) only.
