# Data Protection Impact Assessment (DPIA) — Hourwell field study

> Article 35 GDPR assessment for the Hourwell mobile planner and its 8-week within-subject
> field study (File 06). Drafted P12 (2026-08-31), **before any participant exists** — the
> hosted project holds only the researcher's own test accounts. This document consolidates
> the evidence accumulated per phase in `docs/privacy/README.md` (the working notes), the
> cross-border analysis in ADR-0011, and the FR-42 mechanisms fixed by ADR-0014/ADR-0016.
> Where this document and those sources disagree, this document is wrong — fix it.
>
> **Status: draft for owner sign-off** (§10). Review triggers in §11.

## 1. Why a DPIA, and under which law

Screening against WP248 rev.01 (the Art. 35(3) criteria): the processing involves
**(a) evaluation/scoring** — per-user completion-probability models and chronotype profiling —
and **(b) systematic monitoring of behaviour** — 8 weeks of timestamped task/focus/plan
behaviour per participant. Two criteria met → a DPIA is warranted regardless of scale
(≤ 42 participants; not large-scale, but the assessment is cheap and the thesis must defend it).

Applicable law (ADR-0011 §1, owner decision 1): the **controller is the researcher,
established in Ukraine**; recruitment is in Ukraine, EU/EEA residents are possible and not
designed against.

- **Case U (no EU/EEA participant):** Ukrainian law 2297-VI governs the controller; the EU
  processors' GDPR duties apply on their side; Art. 29 (2297-VI) governs the researcher's
  cross-border pulls.
- **Case E (≥ 1 EU/EEA participant):** the GDPR applies to the researcher under Art. 3(2)(b)
  (8 weeks of monitoring is not "occasional"), triggering the **Art. 27 representative**
  obligation BEFORE that participant enrolls (§8; enrollment checklist hard-stop).

The system is built to the stricter (EU) regime either way, so nothing in this DPIA depends
on which case obtains.

**Roles.** Controller: the researcher (contact block — owner to fill, tracked in
`consent-clause.md` §5). Processors: §3. Google is an **independent controller** for sign-in
and calendar (README G7). No joint controllership exists.

## 2. Systematic description of the processing (Art. 35(7)(a))

### 2.1 Purposes

1. **Operate the product**: plan the user's day, learn personal completion patterns, sync
   devices, remind, explain (specs/01–02; FR-xx).
2. **Answer the thesis questions** (File 06): H1/H2 adherence effects, OPE estimator study
   (RQ4), on pseudonymized behavioural data, reported as aggregates (min cell 5).

### 2.2 Data subjects

≤ 42 adult participants (≥ 18 y, own smartphone, informed consent, €20 completion voucher),
recruited in Ukraine; EU/EEA residents possible (recorded at enrollment). Plus incidental
trial users of the researcher's own accounts, and — once the store listing is public —
ordinary app users outside the study: they are processed under the Art. 6(1)(b) row of §3
only, with no research use absent enrollment and consent. No children, no vulnerable-group
targeting.

### 2.3 Categories of personal data

| Category                | Contents                                                                                                                                                                                                           | Notes                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Account / auth          | e-mail (magic link), Google identity, or an **anonymous id**; session tokens                                                                                                                                       | `auth.users`; anonymous accounts have no address at all                        |
| Profile                 | rMEQ score + chronotype class (the per-question answers are never persisted — they exist only in the onboarding UI state), settings (notifications, mutes, ritual time), `eu_eea_resident` flag, `research_cohort` | `profiles`                                                                     |
| Tasks                   | **titles — the only free text** — plus category, minutes, value, deadlines, priority                                                                                                                               | never trained on, never exported cross-user (NFR-S3)                           |
| Calendar                | event ids, times, titles, busy/free from Google (opt-in)                                                                                                                                                           | titles display-only (specs/07 §7); server-held refresh token, no client grants |
| Behavioural facts       | append-only `events` (start/pause/finish/skip/move, ratings, notification responses, trade-off decisions)                                                                                                          | categorical/numeric payloads by contract (tested)                              |
| Plans & recommendations | placements, propensities (M-01), feature snapshots (numeric arrays), rationale keys, experiment flags                                                                                                              | the OPE substrate                                                              |
| Learned state           | Beta cells, bandit state, blend weights, duration estimates, cluster assignment                                                                                                                                    | per-user rows in Postgres                                                      |
| Study                   | ABAB/BABA assignment, phase dates                                                                                                                                                                                  | `study_assignments`                                                            |
| Erasure audit           | SHA-256 hash of the uid, reason, timestamps — **no FK, survives erasure**                                                                                                                                          | `deletion_audit`                                                               |
| Telemetry               | pseudonymous product events (PostHog EU), crash reports without PII (Sentry EU, `sendDefaultPii: false`)                                                                                                           | opt-out in Settings (ADR-0014 §12)                                             |

Special categories (Art. 9): none by design. The rMEQ sleep-timing items are not an Art. 9
category on their face but sit close to health data (ADR-0011 §6 asked this DPIA to say so):
only the derived score/class is stored, it seeds prior means only, and it is never exported
cross-user. Free-text task titles COULD incidentally contain
anything a user types — treated as risk R2 (§6), not as intended processing.

### 2.4 Systems and locations (NFR-S2)

Evidence per row in `docs/privacy/README.md` §1 (verification dates there).

| Component                                                               | Where                                                                             | Personal data at rest?                                                       |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Supabase (Postgres 17, Auth, Edge Functions, Storage)                   | AWS **eu-west-1** (Ireland)                                                       | Yes — system of record                                                       |
| RecSys + training containers (Oracle Always Free VM, ADR-0009/ADR-0015) | OCI **eu-marseille-1** (France)                                                   | **No** — in transit/in memory only; model artifacts in Supabase Storage (EU) |
| Edge Function execution                                                 | pinned `FunctionRegion.EuWest1` on every client invoke (README G4, verified live) | transient                                                                    |
| PostHog                                                                 | EU Cloud (Germany)                                                                | pseudonymous events                                                          |
| Sentry                                                                  | Frankfurt (`de.sentry.io`)                                                        | crash events, no task text                                                   |
| CI (GitHub-hosted, US)                                                  | —                                                                                 | **None** — synthetic data only (G3, ADR-0011 option A)                       |
| Researcher's machine (Ukraine)                                          | —                                                                                 | **None by rule** — aggregates only (§5, README §7)                           |

### 2.5 Processors (Art. 28)

The full table with legal instruments, sub-processor lists and the Art. 28(3) checklist:
`docs/privacy/README.md` §2 (verified 2026-08-27). Processors: Oracle (IaaS), Supabase
(BaaS), PostHog EU, Sentry EU. Operator-facing only (no participant data): Let's Encrypt,
DuckDNS, GitHub/GHCR, Tailscale (ADR-0017 — coordination metadata only, sessions
WireGuard end-to-end). Known gap: **G1** — Oracle's sub-processor list is behind My Oracle
Support, inaccessible on a free tenancy (accepted residual until the pre-enrollment PAYG
revisit).

### 2.6 Cross-border transfers

**Normative annex: ADR-0011 §2** (the path-by-path table; per its Consequences, "DPIA
§transfers = §2 of this ADR"). Summary of dispositions after option A:

| Path                                            | Disposition                                                                                                                                                                         |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Device → Supabase (EU); Supabase ⇄ VM (EU ⇄ EU) | not transfers                                                                                                                                                                       |
| Edge functions                                  | pinned to eu-west-1 (G4 closed P8)                                                                                                                                                  |
| Researcher ← dashboards/CLI (path 4)            | **transfer when a participant row is shown** → operator access rule (§5), purpose-built RPCs, Art. 49(1)(a) consent clause as backstop, access log                                  |
| Researcher ← study dataset (path 5)             | **designed away**: analysis + training + OPE run on the EU VM; researcher receives aggregates only                                                                                  |
| CI runners / HF Hub (path 6)                    | **designed away**: `train.yml` synthetic-only; registry in Supabase Storage (EU); no hosted-project secret in CI                                                                    |
| Public artefacts (path 8)                       | synthetic dataset + replay harness public; real pseudonymized archive → restricted-access OSF deposit (Frankfurt) under a data-use agreement — final wording at the OSF freeze (G5) |
| Notifications                                   | local-only (ADR-0014 §6) — no push relay exists                                                                                                                                     |
| Google (sign-in, calendar)                      | independent-controller leg at the user's instruction (G7)                                                                                                                           |

### 2.7 Retention

Fixed by ADR-0014 §10; mechanisms live and audited (P10/P11):

- **Anonymous accounts:** erased after 30 days of inactivity (daily `retention_sweep_tick` →
  `delete-account {retention}`, audit reason `anonymous_retention`).
- **Raw `events`:** 24 months from study end, then reduced to the pseudonymized Parquet
  archive on EU storage by the P11 archive job (`hourwell-train --archive`); **no delete-only
  sweep exists before the archive** (deliberate — it would destroy the study).
- **Erasure on request:** synchronous (seconds; ≤ 30 days is the legal ceiling), cascade
  proven by pgTAP over all 18 user-owned tables, in-app confirmation with the audit
  reference (ADR-0016).
- **VM logs:** ≤ 30 MB rotated, ≤ 7 days; no request bodies. **CI logs:** synthetic only,
  GitHub 90-day default.
- `sync_ops` replay ledger: no retention bound yet — tens of rows/user-day; prune procedure
  is a P12 runbook item (revisit.md P8 line).

## 3. Necessity and proportionality (Art. 35(7)(b))

**Lawful bases.**

| Processing                                                               | Basis                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App operation for a user who installs it                                 | Art. 6(1)(b) (performance of the service the user requested); Ukrainian analogue for Case U                                                                                                                             |
| Study enrollment, arm assignment, research use of the behavioural record | Art. 6(1)(a) informed consent (`consent-clause.md`; signed before any study processing)                                                                                                                                 |
| Incidental operator access from Ukraine (path 4)                         | Art. 49(1)(a) explicit consent, purpose-limited, logged (consent clause §2)                                                                                                                                             |
| Google Calendar read / opt-in write-back                                 | user's own instruction to their own provider (Art. 6(1)(a)/(b); Google an independent controller)                                                                                                                       |
| Telemetry (PostHog/Sentry)                                               | Art. 6(1)(f) legitimate interest in service reliability — on when keys are present, with the in-app opt-out (ADR-0014 §12); disclosed to study participants in the consent clause (the study needs the events, File 06) |

**Necessity of each category:** the recommendation problem is _learned personal completion
probability by time slot_ — behavioural facts, plans, propensities and learned state ARE the
subject of the thesis; without them there is no study. Task titles are necessary for the
product (the user must recognize their tasks) but NOT for learning — hence the NFR-S3 line.

**Minimization, enforced structurally (not by policy):**

- Cross-user training reads a **whitelist-as-data** export — categorical/behavioural columns
  only, closed-vocabulary text CHECK-pinned in schema, guarded casts on client-writable
  payloads; the whitelist is the ONLY producer of export/archive SQL and is pgTAP + CI
  tested (P11, NFR-S3).
- Calendar titles: display-only; excluded from every export and training path (contract
  test).
- Feature snapshots are numeric arrays by contract; client fact payloads categorical/numeric
  (tested P7).
- No ad/tracking SDKs (NFR-S2); analytics event catalog is typed and closed
  (`captureAppLifecycleEvents: false`).
- Notifications are local; nothing transits a push relay.
- Aggregates leaving the VM respect **minimum cell size 5** (nightly report, P11).

**Data-subject rights (FR-42, live since P10):** export (Art. 15/20) via `export-data`
under the user's own RLS; erasure (Art. 17) via `delete-account` (self/operator/retention
modes) with audited cascade and in-app confirmation; withdrawal = erasure + a note, no
reason needed; rectification = ordinary editing; restriction/objection satisfied by
withdrawal or the analytics opt-out. Transparency: consent clauses, in-app legibility
(rationale on every placement, experiment blocks labeled — FR-22), synthetic dataset +
replay harness published for reproducibility.

**Proportionality judgment:** the study processes a moderate volume (≤ 42 × 8 weeks) of
mostly categorical behavioural data, in-region, with structural minimization and working
rights; the residual free-text and re-identification risks are mitigated in §6. The
research value (a reproducible field evaluation of a deployed bandit planner) cannot be
obtained with less: synthetic data cannot answer H1/H2, and aggregate-only collection would
destroy the OPE substrate (RQ4). Proportionate.

## 4. Security of processing (Art. 32)

- **Client/server:** TLS 1.3; RLS on every table (pgTAP-tested incl. bypass denial); JWT
  asymmetric auth; no service keys in the client bundle or OTA (NFR-S1); session in
  expo-secure-store.
- **VM:** key-only SSH behind two independent address locks + Tailscale admin path
  (ADR-0017; WireGuard end-to-end, break-glass serial console); no personal data at rest;
  Docker on the unix socket; only Caddy exposes 80/443; unattended-upgrades with nightly
  reboot window; secrets in `~/hourwell/.env` mode 600; rotation runbook §11.
- **Keys:** audited 2026-08-31 (runbook §14) — who uses which Supabase key, formats,
  verification per cell; legacy-JWT deprecation (end-2026) tracked with a migration plan
  (revisit.md P11 line).
- **Backups/durability:** Supabase managed backups (EU); the VM holds nothing to back up.
- **Breach handling:** rotation + incident runbook §11; Supabase/PostHog/Sentry DPAs carry
  processor breach-notification duties; controller notification duties per applicable law.

## 5. Operator access rule (path 4 discipline)

The full rule is `docs/privacy/README.md` §7 (MAY / MUST NOT / unavoidable-row procedure),
in force from the first real participant. In brief: routine operations never display
participant rows; row-level needs go through purpose-built no-display paths
(`diagnose_user`, `delete-account` operator mode); a row that must be seen is seen from the
VM, minimum columns, logged in `~/.hourwell/access-log.md`; the Art. 49(1)(a) clause covers
exactly this case. **This DPIA summarises that log at each wave close (§9). As of
2026-08-31 the log is empty (no participants).**

## 6. Risks to rights and freedoms (Art. 35(7)(c)) and measures (35(7)(d))

Likelihood/severity on a low/medium/high scale, judged pre-measures → residual after.

| #   | Risk                                                                                                                                                              | Pre | Measures                                                                                                                                                                                                                                             | Residual                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| R1  | **Re-identification** of pseudonymized study data (8 weeks of timestamps is a quasi-identifier; File 06 §5's "anonymized" was an over-claim — corrections #35–36) | M×H | No public row-level release: synthetic dataset public, real archive restricted-access (EU, DUA); aggregates min cell 5; pseudonymization keyed in `auth.users` only                                                                                  | **L**                                        |
| R2  | **Free-text task titles** carry sensitive content (health, names, employer matters)                                                                               | M×M | Titles never leave the EU DB except in the user's own export; excluded from training/CI/reports structurally (NFR-S3 tests); operator rule forbids row browsing; consent text names titles explicitly                                                | **L–M** (accepted: the product needs titles) |
| R3  | **Operator-side transfer breach** — habits erode the path-4 rule                                                                                                  | M×M | README §7 rule; purpose-built RPCs; access log summarized here; Art. 49(1)(a) consent backstop; analysis runs on the VM by construction                                                                                                              | **L**                                        |
| R4  | **VM compromise** → live DB credential + service key abuse                                                                                                        | L×H | §4 hardening; nothing at rest on the box; blast radius = model-state tables + transient requests; rotation runbook; least-privilege `recsys_service` DB role (P12 runbook item — until rotated, the pooler DSN is the `postgres` role: tracked risk) | **L–M → L** after the role rotation          |
| R5  | **Processor opacity** — Oracle sub-processor list unavailable (G1)                                                                                                | L×M | Recorded residual; PAYG revisit gate before enrollment; Oracle DPA + Data Transfer Annex otherwise complete                                                                                                                                          | **L** (accepted, time-boxed)                 |
| R6  | **DPF invalidation** (C-703/25 P) hits a US processing leg                                                                                                        | —-  | Retired by design: no participant data reaches US infrastructure (option A); GitHub/GHCR carry code + synthetic only                                                                                                                                 | **none**                                     |
| R7  | **Supabase-side breach**                                                                                                                                          | L×H | Processor DPA/SCCs; RLS everywhere; asymmetric JWTs; key audit + legacy-key migration plan; EU region                                                                                                                                                | **L**                                        |
| R8  | **Calendar token misuse / over-read**                                                                                                                             | L×M | Server-held tokens, zero client grants; read scope only unless write-back opted in; disconnect tears down mirror + channel + token (tested live P8); consent-screen production status is an enrollment gate                                          | **L**                                        |
| R9  | **EU/EEA participant enrolled without an Art. 27 representative**                                                                                                 | M×M | Enrollment checklist hard-stop ("STOP — do not enroll"); `eu_eea_resident` recorded per participant; cohort record §8                                                                                                                                | **L**                                        |
| R10 | **Retention failure** (kept too long / deleted too early)                                                                                                         | L×M | Audited sweeps (30-day anonymous purge live); archive job replaces deletion at 24 months; cascade pgTAP-proven; no premature delete sweep exists                                                                                                     | **L**                                        |
| R11 | **Lock-screen exposure** of task titles in local reminders                                                                                                        | M×L | OS-level preview settings are the user's; nothing transits a relay; consent text mentions reminders; per-category mute                                                                                                                               | **L** (OS-standard)                          |
| R12 | **Consent comprehension** (legal clauses too dense)                                                                                                               | M×M | Consent form separates `[system]` from `[legal]` clauses; Ukrainian version produced after owner approval; enrollment is in-person with the checklist                                                                                                | **L**                                        |

No residual risk is high → **Art. 36 prior consultation is not required.**

## 7. Consultation

- **DPO:** not designated — not required (Art. 37: not a public authority; core activities
  are not large-scale systematic monitoring at ≤ 42 subjects). The controller carries DPO-type
  duties personally.
- **Data subjects' views (Art. 35(9)):** the consent form and information sheet are reviewed
  with the first pilot participants; objections feed back into this DPIA.
- **Ethics board:** approval is an enrollment-checklist prerequisite; this DPIA is part of
  that submission.

## 8. Art. 27 cohort record (G6)

Filled at every wave; the enrollment checklist blocks an EU/EEA "yes" without a designated
representative.

| Wave | Dates | Enrolled | Any EU/EEA resident? | Representative designated (who/when) | Notes                            |
| ---- | ----- | -------- | -------------------- | ------------------------------------ | -------------------------------- |
| —    | —     | —        | —                    | —                                    | no participants as of 2026-08-31 |

## 9. Access-log summaries (path 4)

| Period             | Accesses | Purposes | Notes                                |
| ------------------ | -------- | -------- | ------------------------------------ |
| through 2026-08-31 | 0        | —        | pre-enrollment; log not yet in force |

## 10. Sign-off

| Role                    | Name     | Date | Outcome |
| ----------------------- | -------- | ---- | ------- |
| Controller / researcher | ⛔ owner | —    | pending |

Owner sign-off is an ACTION REQUIRED item (with the consent-clause contact block).

## 11. Review triggers

Re-open this DPIA when any of the following happens — and record the change here:

1. Any new processor, hosting region, or data path (e.g. a mail provider — ADR-0016 keeps
   Brevo pre-wired; a push relay; a week-view service).
2. The first EU/EEA-resident enrollment (Case E flips on; §8).
3. The OSF-freeze release decision (G5) — final wording of path 8.
4. The Oracle PAYG revisit (G1) and the Google consent screen going to production.
5. The Supabase legacy-key migration (end-2026 deprecation).
6. Any personal-data breach, or any access-log entry that the §5 rule did not anticipate.
7. Study design changes that alter scope/duration/population (File 06 amendments).
