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

| Aspect                    | Position                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personal data on the box  | **In transit / in memory only.** `/plan` requests carry the pseudonymous user id, task attributes (category, minutes, value, deadlines — never titles), calendar busy intervals (times only), the Beta-cell evidence; `/feedback` carries reward tuples with numeric feature snapshots; `/parse-preview` receives quick-add text and returns a parse without storing or logging it. Per-user model state is read/written in Postgres (eu-west-1), never stored on the VM. |
| Data at rest on the box   | None that is personal: the container image, Caddy's TLS material, Caddy's access log (client IPs = Supabase egress + the operator; rotated 3 × 10 MB, ≤ 7 days), container stdout logs (3 × 10 MB; the service logs paths/status codes, not bodies). Erasure requests (FR-42) therefore have nothing to erase on the VM.                                                                                                                                                  |
| Credentials on the box    | `DATABASE_URL` (pooler DSN — currently the `postgres` role: least-privilege `recsys_service` role is a P12 runbook item, revisit.md) and `HOURWELL_SERVICE_KEY`, in `~/hourwell/.env` (mode 600, owner-only user). Rotation procedure: runbook §9.                                                                                                                                                                                                                        |
| Access control            | One user, key-only SSH from the owner's addresses only — two independent locks, both browser-managed (Security List; host allow-list synced from the instance tag `ssh-allow`, runbook §0); no root login, no password auth over the network (a console-only password exists for the out-of-band serial console — lockout recovery, runbook §5); no forwarding; Docker daemon on the unix socket only; only Caddy exposes ports (80/443).                                 |
| Patching                  | **Ours.** `unattended-upgrades` daily with automatic reboot at 04:15 UTC; Docker/Compose updates via apt; the image is rebuilt by CI on every service change (base image `python:3.12-slim`, refreshed on each build).                                                                                                                                                                                                                                                    |
| Availability / resilience | Single instance, no SLA; the app degrades to the heuristic fallback (NFR-R2) and reward tuples wait for re-delivery — no data loss on outage (ADR-0010 §8). Oracle may reclaim idle Always Free instances only when CPU, network and memory are all below their 7-day thresholds (guard: the hourly keep-busy timer).                                                                                                                                                     |
| Monitoring                | `/healthz` (build, arch, storage) polled by CI after each publish; Caddy/compose logs; no third-party monitoring receives data.                                                                                                                                                                                                                                                                                                                                           |
| Transfers                 | Storage in-region; Oracle's remote support access is covered by its Data Transfer Annex. Operator-facing providers (Let's Encrypt, DuckDNS, GHCR) receive no participant data.                                                                                                                                                                                                                                                                                            |

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
  data; registry in Supabase Storage).
- **G4 — Edge Functions region.** Until pinned, functions run nearest the caller (deployed
  globally); for callers in the EU or Ukraine that is an EU region, for a participant travelling
  outside Europe it is not. Pin with `region: FunctionRegion.EuWest1` on `functions.invoke`
  (verify: `x-sb-edge-region` response header) — **P8**, when the sync engine replaces both
  call sites (`planRequest.ts`, `factsPush.ts`).
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
- `recommendations.features` snapshots are numeric arrays (no text) by contract (specs/07 §5).
- P7: every client fact payload is categorical/numeric (tested, NFR-S3); ratings are labels.

## 6. Retention (defaults, fixed by ADR in P10)

Raw `events`: 24 months → pseudonymized Parquet archive (File 06 §5 — see G2 for where it may
live). Unconverted anonymous accounts: purged after 30 days. Account deletion completes ≤30 days
with email confirmation (UC-10). VM logs: ≤ 30 MB rotated, ≤ 7 days (Caddy).

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

1. Prefer a **purpose-built RPC** that acts without displaying rows (`erase_user(email)`,
   `diagnose_user(email)` returning counts/timestamps — add them in P8/P9 as needed).
2. If a row must be seen: minimum columns, that participant only, from the VM
   (`docker compose exec recsys …` / `psql` inside the compose network) — the screen is still a
   transfer, so this is the case the consent form's Art. 49(1)(a) clause covers.
3. Log it in `~/.hourwell/access-log.md` (date, participant hash, purpose, tables) — outside the
   repo; the DPIA (P12) summarises the log.

**Before the first participant:** none of this applies — the hosted project holds only the
researcher's own test accounts, and the P7/P8 verification scripts may read rows freely.
