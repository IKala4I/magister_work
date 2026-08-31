# Privacy & Data-Protection Notes (NFR-S2/S3; FR-42)

Working notes toward the DPIA (full document due P12; this file accumulates evidence per phase).
Roles: **controller** = the researcher (thesis owner, established in Ukraine); **data subjects** =
study participants — recruited in **Ukraine**, EU/EEA residents possible (ADR-0011 decision 1:
the design meets the stricter EU regime either way); **processors** = the table in §2. Updated
2026-08-27 for the self-hosted RecSys VM (ADR-0009) and 2026-08-28 for the cross-border
decisions (ADR-0011) — both changes in the data-protection picture, recorded like the HF EU finding.

## 1. Hosting regions (NFR-S2: EU region hosting)

| Service                                   | Region                                                                                                               | Evidence / status                                                                                                                                                                                                                                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase (Postgres, Auth, Edge Functions) | **eu-west-1 (Ireland)**                                                                                              | `supabase projects list` 2026-08-24: project `magister_work`, region `eu-west-1`, linked ✔. Edge Functions execute nearest the caller unless pinned (`x-region`) — the callers are the app (EU participants) and pg_cron (eu-west-1); pinning is a P10 hardening item.                                    |
| **RecSys service (self-hosted VM)**       | **Oracle Cloud Infrastructure, France South / Marseille, `eu-marseille-1`** (EU member state)                        | Provisioned 2026-08-27 (ADR-0009 option A): VM.Standard.A1.Flex 2 OCPU / 12 GB, Ubuntu 24.04, administered by the researcher. Oracle's Hosting & Delivery Policies: "Your Content will be stored in the Data Center Region applicable to such Services"; Always Free compute is home-region-only. See §3. |
| PostHog (product analytics)               | **EU Cloud (eu.posthog.com) — REQUIRED**                                                                             | Account not yet created (ACTION REQUIRED gate). Config constant must point at the EU ingestion host; the US default is a violation of decision 7 / NFR-S2.                                                                                                                                                |
| Sentry (crash reporting)                  | EU org region required at signup (Frankfurt, `de.sentry.io`); account/org metadata stays in the US per Sentry's docs | SDK scaffolded P2, **env-gated**: without `EXPO_PUBLIC_SENTRY_DSN` it initializes disabled (tested). Init pins `sendDefaultPii: false`, tracing off; stack traces + device context only, never task text.                                                                                                 |
| ~~Hugging Face Spaces~~ (withdrawn)       | US only on free/PRO plans (verified 2026-08-27)                                                                      | Free Docker Spaces were withdrawn by the provider in July 2026 (spec-conflicts H4); never deployed; replaced by the Oracle VM above. Kept for the record: the tier as originally specified would not have met NFR-S2.                                                                                     |

## 2. Processors (GDPR Art. 28) — verified 2026-08-27

| Processor                                        | Role                                    | Location / region                                                                                                                                                                                                        | What it processes                                                                                                                                                                             | Legal instrument                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Oracle Cloud Infrastructure** (Always Free VM) | Processor (IaaS)                        | `eu-marseille-1` (France); content stored in-region; Oracle "may access Personal Information globally as necessary to perform the Services, such as for support" (DPA §6.2) under its Data Transfer Annex (SCCs / BCR-P) | Transient pseudonymous behavioural data in requests (UUID user ids, task categories/durations/values, numeric feature vectors, plan assignments); the Supabase DB credential; the backend key | **Data Processing Agreement for Oracle Services** v14082025 — incorporated automatically by the Cloud Services Agreement §5.2(b): https://www.oracle.com/contracts/docs/data-processing-agreement-oracle-services-081425.pdf · CSA https://www.oracle.com/contracts/docs/cloud_csa_online_v062223_us_eng.pdf · Hosting & Delivery Policies https://www.oracle.com/contracts/docs/ocloud_hosting_delivery_policies_3089853.pdf · Data Transfer Annex https://www.oracle.com/contracts/docs/data-transfer-annex-v060225.pdf · sub-processors: My Oracle Support Doc 2121811.1 (see gap G1) |
| **Supabase** (Postgres, Auth, Edge Functions)    | Processor (BaaS)                        | AWS eu-west-1; Edge Functions nearest the caller unless pinned                                                                                                                                                           | Account/auth data, tasks (incl. titles — the only free text), events, plans, recommendations, reward tuples, model state                                                                      | DPA https://supabase.com/legal/dpa (acceptance of the ToS = signing the SCCs) · sub-processor list https://supabase.com/legal/customer-resources/subprocessor-list                                                                                                                                                                                                                                                                                                                                                                                                                       |
| PostHog EU Cloud                                 | Processor (analytics)                   | AWS Germany                                                                                                                                                                                                              | Pseudonymous product events (no text, no identifiers beyond the pseudonymous id)                                                                                                              | DPA https://posthog.com/dpa (countersigned in-app) · sub-processors https://posthog.com/subprocessors                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Sentry (EU region)                               | Processor (error monitoring)            | Frankfurt (`de.sentry.io`); org metadata in the US                                                                                                                                                                       | Error events, device context; no task text by design                                                                                                                                          | DPA https://sentry.io/legal/dpa/ · sub-processors https://sentry.io/legal/subprocessors/ · data location https://docs.sentry.io/organization/data-storage-location/                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Let's Encrypt / ISRG                             | Certificate authority (operator-facing) | US CA; certificates published in CT logs                                                                                                                                                                                 | Server hostname + IP, ACME request logs — **no participant data**                                                                                                                             | Privacy policy https://letsencrypt.org/privacy/                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| DuckDNS                                          | DNS provider (operator-facing)          | AWS (region not stated)                                                                                                                                                                                                  | Operator's OAuth identity, sign-in IP, the VM's IP and subdomain — **no participant data**; logs deleted after 90 days                                                                        | Privacy statement https://www.duckdns.org/pp.jsp · terms https://www.duckdns.org/tac.jsp                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| GitHub / GHCR                                    | Code + container registry               | GitHub-operated (US)                                                                                                                                                                                                     | The container image and source — **no personal data**. (P11 note: GitHub-hosted runners would process pseudonymised events — see gap G3)                                                      | GitHub DPA https://github.com/customer-terms/github-data-protection-agreement · sub-processors https://github.com/subprocessors                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

Art. 28(3) checklist against Oracle's DPA: documented instructions (§ scope, incorporated by the
CSA) ✔ · confidentiality ✔ · Art. 32 measures (Hosting & Delivery Policies + Corporate Security
Practices) ✔ · sub-processor authorisation (general, 30-day objection window) ✔ · assistance with
data-subject rights (n/a — nothing at rest on the VM) ✔ · deletion/return at end of service (the
instance is terminated by the controller; nothing persists) ✔ · audit/information (Oracle
certifications; sub-processor list only via My Oracle Support) ⚠ G1.

## 3. Self-hosted RecSys VM — what changed with ADR-0009

Before: the RecSys tier was a managed container on a PaaS (US, as it turned out). Now the
researcher **administers a VM** in the EU; Oracle is an infrastructure processor, and the
following became **our** responsibilities (Art. 32 — measures in `docs/runbooks/oracle-vm.md`,
re-verifiable with `deploy/verify.sh`):

| Aspect                                                                            | Position                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personal data on the box                                                          | **In transit / in memory only.** `/plan` requests carry the pseudonymous user id, task attributes (category, minutes, value, deadlines — never titles), calendar busy intervals (times only), the Beta-cell evidence; `/feedback` carries reward tuples with numeric feature snapshots; `/parse-preview` receives quick-add text and returns a parse without storing or logging it. Per-user model state is read/written in Postgres (eu-west-1), never stored on the VM.        |
| Data at rest on the box                                                           | None that is personal: the container image, Caddy's TLS material, Caddy's access log (client IPs = Supabase egress + the operator; rotated 3 × 10 MB, ≤ 7 days), container stdout logs (3 × 10 MB; the service logs paths/status codes, not bodies). Erasure requests (FR-42) therefore have nothing to erase on the VM.                                                                                                                                                         |
| Credentials on the box                                                            | `DATABASE_URL` (pooler DSN — currently the `postgres` role: least-privilege `recsys_service` role is a P12 runbook item, revisit.md) and `HOURWELL_SERVICE_KEY`, in `~/hourwell/.env` (mode 600, owner-only user). Rotation procedure: runbook §9.                                                                                                                                                                                                                               |
| Access control                                                                    | One user, key-only SSH from the owner's addresses only — two independent locks, both browser-managed (Security List; host allow-list synced from the instance tag `ssh-allow`, runbook §0); no root login, no password auth over the network (a console-only password exists for the out-of-band serial console — lockout recovery, runbook §5); no forwarding; Docker daemon on the unix socket only; only Caddy exposes ports (80/443).                                        |
| Admin connectivity (ADR-0017, accepted 2026-08-31; installs with the P11 VM keys) | Daily administration over a Tailscale tailnet (runbook §12). The coordination server (US) sees admin device names/keys/endpoints ONLY; sessions are WireGuard end-to-end; **no participant data ever transits Tailscale** — the same SSH sessions that previously rode the open internet to port 22. Not an Art. 28 processor for study data (reasoning: ADR-0017). The two address locks and the serial-console ladder remain the security boundary and break-glass, unchanged. |
| Patching                                                                          | **Ours.** `unattended-upgrades` daily with automatic reboot at 04:15 UTC; Docker/Compose updates via apt; the image is rebuilt by CI on every service change (base image `python:3.12-slim`, refreshed on each build).                                                                                                                                                                                                                                                           |
| Availability / resilience                                                         | Single instance, no SLA; the app degrades to the heuristic fallback (NFR-R2) and reward tuples wait for re-delivery — no data loss on outage (ADR-0010 §8). Oracle may reclaim idle Always Free instances only when CPU, network and memory are all below their 7-day thresholds (guard: the hourly keep-busy timer).                                                                                                                                                            |
| Monitoring                                                                        | `/healthz` (build, arch, storage) polled by CI after each publish; Caddy/compose logs; no third-party monitoring receives data.                                                                                                                                                                                                                                                                                                                                                  |
| Transfers                                                                         | Storage in-region; Oracle's remote support access is covered by its Data Transfer Annex. Operator-facing providers (Let's Encrypt, DuckDNS, GHCR) receive no participant data.                                                                                                                                                                                                                                                                                                   |

## 4. Gaps and decisions for the DPIA (owner attention)

- **G1 — Oracle sub-processor transparency.** Oracle publishes its sub-processor list only via
  My Oracle Support (Doc 2121811.1); Always Free tenancies "are not eligible for Oracle Support".
  Residual gap for Art. 28(3)(h): record it, or upgrade to Pay As You Go (Always Free stays
  free) and confirm access to the document. **Owner 2026-08-27:** PAYG deferred (it grants no
  idle-reclamation exemption); revisit before participant enrollment, when support access may
  matter. Recorded as a residual gap until then.
- **G2 — Exports to the researcher's machine are a Chapter V transfer.** Ukraine has no EU
  adequacy decision (17 decisions as of 2026-08-27). EDPB Guidelines 05/2021 (v2.0): data
  flowing from an EU processor back to a controller established in a third country **is** a
  transfer — Example 10 when the controller is subject to the GDPR (EU participants), Example 6
  when it is not (participants in Ukraine; then it is the processor's obligation and Ukrainian
  law 2297-VI Art. 29 governs the controller). So the data-subject → controller and controller →
  EU-processor legs are fine, but **pulling participant data — dashboard browsing, `db dump`, the
  study dataset, the Parquet archive — to a machine in Ukraine needs a ground**, and no Art. 46
  instrument exists today for an importer already subject to Art. 3(2). **Full path-by-path
  analysis, lawful bases and options: `docs/decisions/ADR-0011-cross-border-transfers.md`
  (proposed — owner decision, claim-level).** Recommended default: in-region analysis + training
  on the EU VM, aggregates only to the researcher, Art. 49(1)(a) clause in the consent form.
- **G3 — GitHub-hosted runners for training (P11).** The nightly pipeline as specified would
  pull pseudonymised behavioural data onto GitHub-hosted runners (US) and push artefacts to HF
  Hub (US). Today **no CI job touches participant data** (`ci.yml` has no hosted-project
  secret). GitHub is DPF-certified (Art. 45), the DPF is under appeal (C-703/25 P), HF Hub's DPF
  status is unverified, and under Ukrainian law the US is not adequate regardless. ADR-0011
  option A keeps participant data off CI entirely (training on the VM; `train.yml` on synthetic
  data; registry in Supabase Storage). **Implemented in P11** (ADR-0015): `train.yml` seeds a
  synthetic cohort into the CI-local stack and runs the same pipeline; the nightly run is a
  systemd timer on the VM; artifacts live in the private `models` bucket (EU).
- **G4 — Edge Functions region — closed in P8.** Every `functions.invoke` goes through
  `apps/mobile/src/sync/invoke.ts`, pinned to `FunctionRegion.EuWest1` (`plan-request`,
  `sync-resolve`, `gcal-connect`); verified live on the hosted project by the
  `x-sb-edge-region` response header (`p8-manual-verification.md` §2). Server-to-server calls
  (pg_cron → functions, functions → the VM) never leave the EU by construction.
- **G7 — Google Calendar (FR-03, P8).** Google is an **independent controller** of the user's
  calendar; Hourwell is an OAuth client acting on the user's instruction (Art. 6(1)(a)/(b) —
  the user connects and can disconnect at any time; the consent-form text is
  `consent-clause.md` §1). What crosses to Google: the OAuth code exchange, `events.list`
  reads, `events.watch` channel registrations (the webhook URL), and — only with the opt-in
  write-back — event titles of the user's own tasks written into their own calendar. What comes
  back and is stored in the EU database: event ids, times, titles (display-only, never exported
  or trained on — specs/07 §7), busy/free, and the server-held refresh token (`gcal_sync_state`,
  no client grants). Google's servers may be outside the EU, but this leg is the user's own
  service used at their request, not a transfer by the controller. **Gate for enrollment:** the
  OAuth consent screen must be **in production** — in "Testing" status Google expires refresh
  tokens after 7 days and would silently disconnect participants mid-study (ADR-0012
  Consequences); the calendar scopes are "sensitive", so an unverified app shows a warning
  screen and is capped at 100 users — enough for the study, but the verification review is
  owner work if the warning is unacceptable.
- **G8 — CLOSED (owner decision 2026-08-31, ADR-0016): erasure confirmation is in-app, by
  design.** The anonymous-account argument settles it (no address exists for the trial
  cohort or the retention purges, so the in-app path must exist regardless); Art. 12(3)'s
  "without undue delay" is satisfied at request time; the built-in mailer is
  team-addresses-only at 2/hour. No new processor. **Pre-wired fallback if an ethics board
  ever requires mail:** Brevo (French, EU-hosted, DPA, free ≈ 300/day) + one edge function
  — ADR-0016 records the comparison so it never needs re-research.
- **G9 — Retention fixed (P10, ADR-0014 §10).** Anonymous accounts inactive for 30 days (no
  sign-in, no event) are erased daily by `retention_sweep_tick` → `delete-account {retention}`
  with an audit row (`reason = anonymous_retention`); the 24-month raw-event window is executed by
  the P11 archive job, never by a delete sweep. Recorded here so the DPIA cites the mechanism.
- **G5 — Public dataset (File 06 §5).** A row-level event dataset of 42 people is not anonymous
  by relabelling; publication is lawful only if genuinely anonymous. ADR-0011 §4: synthetic
  dataset + replay harness, and/or restricted-access OSF deposit (Frankfurt storage). ⛔ owner
  decision at the OSF freeze.
- **G6 — Art. 27 representative — conditional obligation (owner decision 2026-08-28).**
  Recruitment is in Ukraine, so by default the GDPR does not bind the researcher and no
  representative is needed. **Trigger:** the first EU/EEA-resident participant. From then on the
  researcher is subject to the GDPR under Art. 3(2)(b) (8 weeks of behavioural monitoring is not
  "occasional" — Art. 27(2) does not exempt) and must designate a representative in the Union
  **before** that participant's enrollment (candidates: the supervising institution's EU partner;
  otherwise a commercial representative — cost, needs owner approval under invariant 11). The
  study-mode enrollment checklist (P11) asks "resident in the EU/EEA?" so the trigger cannot be
  missed; the DPIA (P12) records the answer per cohort. ADR-0011 §1, §6.

## 5. Data-minimization commitments already enforced in schema (P1)

- Cross-user training export: **categorical/behavioral columns only, never task text** (NFR-S3);
  CI test lands with the export query (P11).
- `calendar_events.title` is display-only; excluded from every export/training path (specs/07 §7).
- Erasure: `on delete cascade` from `auth.users` through every user-owned table (FR-42);
  `deletion_audit` keeps proof-of-erasure with a user hash, no FK — survives the cascade.
  **P10:** proven by pgTAP `p10_privacy_test.sql` (every FK to `auth.users` cascades; a row of
  one user in all 18 tables is gone after one delete), executed by the `delete-account` edge
  function (self / operator / retention) after a best-effort Google teardown (mirror out,
  channel stopped, token revoked). ADR-0014 §8.
- Export (Art. 20): the `export-data` edge function reads under the **user's** client — RLS is
  the filter — and never includes calendar event titles or the server-only ledgers (`sync_ops`,
  `sync_leases`, `gcal_sync_state`, `recsys_applied_tuples`); the whitelist is pinned by a
  contract test against the same 18-table list. ADR-0014 §7.
- `recommendations.features` snapshots are numeric arrays (no text) by contract (specs/07 §5).
- P7: every client fact payload is categorical/numeric (tested, NFR-S3); ratings are labels.
- P8: `gcal_sync_state` (refresh tokens, channel secrets) has no client grants and no policies;
  the device only ever sees a consent URL and a yes/no status. Calendar-event tombstones
  (`deleted_at`) make cancellations converge without hard deletes on the audit substrate.

## 6. Retention (fixed by ADR-0014 §10, P10)

Raw `events`: 24 months from study end → pseudonymized Parquet archive (File 06 §5 — see G2 for
where it may live; the archive job is P11's, no delete sweep exists before it). Anonymous
accounts: erased after **30 days of inactivity** (no sign-in, no event) by the daily
`retention-sweep` pg_cron job through the audited `delete-account` path. Account deletion on
request completes synchronously (the ≤ 30-day bound of UC-10 is the legal ceiling) and is
confirmed in-app with the audit reference (G8). VM logs: ≤ 30 MB rotated, ≤ 7 days (Caddy).

## 7. Operator access rule — path 4 (ADR-0011 decision 4; in force from the first real participant)

Everything the researcher opens from a machine outside the EU is a Chapter V transfer the moment
it shows a participant's row. Option A only holds if daily operations respect this. The rule:

**MAY, any time (no participant rows are shown):**

- Migrations, `supabase db push/diff/pull`, `supabase gen types`, function deploys, secrets,
  Vault, `config.toml`, Edge Function **error** logs (`console.error('<fn> failed', err)` — paths
  and errors only), `cron.job_run_details`, `net._http_response` (status + the functions' count
  responses), `/healthz`, Caddy/compose logs on the VM (paths, status codes, Supabase egress IPs).
- Tables with no per-user rows: `prior_cells`, `model_registry`, `deletion_audit` (user hash
  only), the training pipeline's aggregate outputs.
- **Aggregate queries** (`count`, `avg`, quantiles, histograms) over user-owned tables **with a
  minimum group size of 5** and no free-text column in the output; PostHog dashboards
  (aggregates); the File 06 analysis outputs (coefficients, tables, plots) produced **on the VM**.

**MUST NOT (once a real participant exists):**

- The dashboard **Table Editor** on `auth.users`, `profiles`, `tasks`, `events`, `plans`,
  `recommendations`, `feedback_rewards`, `duration_estimates`, `calendar_events`, or any
  `select *` / row-level `select` on them from the SQL editor or CLI; **Authentication → Users**
  (e-mails); CSV/JSON export; `supabase db dump` with data; the Logs explorer at request/body
  level; PostHog **person** profiles and per-person event streams.
- Copying any per-user dataset (Parquet, CSV, `pg_dump`) to the laptop — the File 06 analysis
  and OPE run on the VM (ADR-0011 option A) and hand back aggregates.

**Row-level access that cannot be avoided** (a participant's own support request, an FR-42
erasure, a bug that only reproduces on their data):

1. Prefer a **purpose-built path** that acts without displaying rows. **Erasure (P10):**
   `delete-account` in operator mode — `curl -X POST <functions-url>/delete-account -H
'x-service-key: …' -H 'apikey: <anon>' -d '{"mode":"operator","user_id":"<uid>"}'` (the
   backend key from `~/.hourwell`, never from the repo); resolve the uid with
   `select id from auth.users where email = '…'` (one id, no other column) and log the access.
   The response is the audit reference only. `diagnose_user(email)` (P11, service-only)
   returns counts/timestamps for exactly this case — run it instead of any row-level select.
2. If a row must be seen: minimum columns, that participant only, from the VM
   (`docker compose exec recsys …` / `psql` inside the compose network) — the screen is still a
   transfer, so this is the case the consent form's Art. 49(1)(a) clause covers.
3. Log it in `~/.hourwell/access-log.md` (date, participant hash, purpose, tables) — outside the
   repo; the DPIA (P12) summarises the log.

**Before the first participant:** none of this applies — the hosted project holds only the
researcher's own test accounts, and the P7/P8 verification scripts may read rows freely.
