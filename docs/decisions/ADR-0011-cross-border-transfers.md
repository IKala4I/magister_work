# ADR-0011 — Cross-border data flows (GDPR Chapter V) for a controller established in Ukraine

- **Date:** 2026-08-27
- **Status:** **accepted** (owner decision 2026-08-28 — see "Decision"); claim-level: it changes
  what the thesis says about "EU hosting", not how the system is built (owner directive
  2026-08-27: not deferred to P11)
- **Phase:** P7.1 (applies to P8/P9 consent text, P10 notifications, P11 pipeline, P12 DPIA)
- **Spec anchors:** NFR-S2 (EU region hosting), NFR-S3 (no raw text in cross-user training),
  File 06 §1.3 (participants), §5 (artefact statement: "anonymized event dataset (Parquet, HF
  datasets)"), specs/07 §4 `model_registry.artifact_uri` (HF Hub), PLAN §3 P11 (`train.yml`
  nightly, HF Hub push); `docs/privacy/README.md` G2–G4; thesis-corrections #34.

## Context

The thesis claims EU hosting (NFR-S2) and — per thesis-corrections #34 — treats "controller in
Ukraine, data in the EU" as transfer-free. The first claim is true for **storage**: Supabase
(`eu-west-1`) and the RecSys VM (`eu-marseille-1`) hold everything. The second is not true for
**flows**: two planned paths carry participant data out of the EU (to the researcher's machine in
Ukraine and to GitHub-hosted runners in the US), and a third (the public dataset) is a
publication decision. Nothing has crossed yet — the hosted project holds only the researcher's
own test accounts; File 06 is not frozen; no participant is enrolled — so this is a design
decision, not a remediation.

One input is missing from the specs: **where the participants are.** File 06 §1.3 says
"university lists + productivity communities" with a € voucher; the privacy README assumed EU
data subjects. The applicable law differs by that answer (§1), the safeguards that work in both
cases are the same (§4), and the recommended design makes the answer irrelevant for the data
flows — but not for Art. 27 (§6).

## 1. Which law applies — two cases (facts verified 2026-08-27, §7)

| Case                                 | GDPR on the researcher (controller)                                                                                                                                                                                                                                                         | GDPR on the processors                                                                                                                                                                                                                                                         | Ukrainian law on the researcher                                                                                                                                                                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **E — participants in the EU/EEA**   | Applies under **Art. 3(2)(b)** (monitoring the behaviour of data subjects in the Union — an 8-week behavioural study is exactly that). Chapter V binds every outbound flow; Art. 27 representative in the Union unless the 27(2) exemption holds (§6); Art. 30 records; Art. 35 DPIA (P12). | Supabase and Oracle process in the EU on the controller's instructions (Art. 28). EDPB Guidelines 05/2021 v2.0 **Example 10**: the processor's disclosure back to a controller in a third country **is a transfer** even though that controller is itself subject to the GDPR. | Law 2297-VI applies as well (Ukrainian controller). Art. 29: transfers abroad are free to states with adequate protection — **EU/EEA states and Convention 108 parties** — otherwise a ground is needed (the data subject's consent, contract, …). The **US is not a Convention 108 party.** |
| **U — participants in Ukraine only** | GDPR does **not** apply to the controller (no EU establishment, no Art. 3(2) trigger). "GDPR-compliant" becomes a voluntary design standard, not an obligation.                                                                                                                             | Same processing, same Art. 3(1) coverage of the processors; EDPB **Example 6**: the return leg to the non-EU controller is a transfer — the **processor's** obligation (SCC Module 4, reduced clauses when the importer is outside the GDPR).                                  | Law 2297-VI is the primary regime. Ukraine → EU processors: adequate destination. EU → Ukraine: data returning to its controller — no restriction. Ukraine → US (runners, HF Hub, OSF-US): a ground is needed.                                                                               |
| **Mixed**                            | Apply Case E to everyone — simpler than segmenting, and the recommended design (§5) costs nothing extra.                                                                                                                                                                                    |                                                                                                                                                                                                                                                                                |                                                                                                                                                                                                                                                                                              |

Draft law No. 8153 (GDPR-aligned) passed first reading on 2024-11-20 and is not in force; when
it is, Case U converges on Case E. **Design for Case E now** — it is the stricter regime and the
one the thesis text implies.

## 2. What actually crosses which border — path by path

"Transfer" = the EDPB's three cumulative criteria (Guidelines 05/2021 v2.0 §7): an exporter
subject to the GDPR; discloses or otherwise makes data available to another controller/processor;
the importer is in a third country. Remote access from a third country counts as "making
available". Identifiability: everything below is **pseudonymised, not anonymised** — the
controller holds the key (`auth.users`), and 8 weeks of timestamped behaviour is a
quasi-identifier on its own.

| #   | Path                                                                                                                                  | What actually moves                                                                                                                                                                                                                                                                                                                                                                                                           | Today (P7.1)                                                                                                                       | Chapter V (Case E)                                                                                                                                                                                             | UA Art. 29 (Case U)                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | Participant's device → Supabase (`eu-west-1`)                                                                                         | Account (email for magic link, Google identity, or an anonymous id), profile + rMEQ answers, **tasks incl. titles** (the only free text), events, plans, recommendations, reward tuples, device time zone; P8 adds calendar events incl. titles.                                                                                                                                                                              | Live (test accounts only).                                                                                                         | **Not a transfer** (inbound to the EU).                                                                                                                                                                        | Ukraine → EU: adequate destination.                                                            |
| 2   | Supabase Edge Functions (`plan-request`, `attribute-rewards`)                                                                         | The same rows, in memory, in the region **nearest the caller** (functions are deployed globally). For a caller in Ukraine or the EU that is an EU region; for a participant travelling outside Europe it is not. Pin with `region: FunctionRegion.EuWest1` on `functions.invoke` (or the `x-region` header); the `x-sb-edge-region` response header proves it. pg_cron's calls run in `eu-west-1`.                            | Not pinned (README G4).                                                                                                            | Unpinned: an occasional, participant-triggered transfer to wherever the participant is. Pinned: none.                                                                                                          | Same.                                                                                          |
| 3   | Supabase ⇄ RecSys VM (`eu-marseille-1`)                                                                                               | Pseudonymous `/plan` and `/feedback` bodies (UUID ids, categorical task attributes, numeric feature vectors, busy intervals); `/parse-preview` text, not stored or logged (README §3).                                                                                                                                                                                                                                        | Live after ⛔ 1–6.                                                                                                                 | EU ⇄ EU: none. Provider support access (Oracle DPA §6.2 + Data Transfer Annex; Supabase DPA SCCs) — already recorded, README §2.                                                                               | n/a                                                                                            |
| 4   | **Researcher's Mac (Ukraine) ← Supabase dashboard / CLI / SQL editor**                                                                | Whatever is opened: `auth.users` (**emails — direct identifiers**), `tasks.title`, every user-owned table, `supabase db dump` = everything; function logs (`console.error('… failed', err)` only — paths and errors, no bodies). Routine operations (migrations, `net._http_response`, cron health, secrets) show **no participant rows**; the Table Editor shows them on one click.                                          | Live, but only the researcher's own data exists.                                                                                   | **Transfer** (Example 10) — continuous during the study: support, FR-42 erasure, monitoring. No Art. 46 instrument exists for this importer today (§3); Art. 49(1)(a) explicit consent is the workable ground. | Not a transfer for the controller (data returning home); the processor's Module 4 obligation.  |
| 5   | **Researcher's Mac ← the study dataset** (File 06 §4 analysis, OPE replay, Parquet archive)                                           | The whole pseudonymised behavioural dataset: ≤ 42 people × 8 weeks of blocks, facts, rewards, propensities, feature snapshots. Largest volume, most re-identifiable. Would sit on a laptop (Art. 32: encryption, backups, retention become the researcher's problem).                                                                                                                                                         | Not built (P11).                                                                                                                   | **Transfer**, same footing as #4, one-off at study end plus every re-run.                                                                                                                                      | As #4.                                                                                         |
| 6   | **GitHub-hosted runners (US) ← Supabase** — P11 `train.yml` nightly                                                                   | The NFR-S3 export: per-pseudonymous-user categorical/behavioural columns (no text) → ALS user/item factors, k-means, EB priors on the runner; job logs and artefacts retained by GitHub (90 days default); global artefacts to HF Hub (US).                                                                                                                                                                                   | **Nothing:** `ci.yml` holds no hosted-project secret; no CI job reads participant data; `deploy-recsys.yml` only polls `/healthz`. | **Transfer** to GitHub (DPF-certified → Art. 45 covers it today; the DPF is under appeal, C-703/25 P) and to HF Hub (DPF status **unverified**).                                                               | US is not adequate under Art. 29 → consent or another ground needed **regardless of the DPF**. |
| 7   | Researcher's Mac ← Oracle VM (ssh)                                                                                                    | Container stdout (paths, status codes), Caddy access log (client IPs = Supabase egress + the researcher). No request bodies, nothing at rest (README §3).                                                                                                                                                                                                                                                                     | Live.                                                                                                                              | No participant data by design — keep it so (never enable body logging).                                                                                                                                        | n/a                                                                                            |
| 8   | **Public artefacts** — File 06 §5 "anonymized event dataset (Parquet, HF datasets)", `model_registry` artefacts, OSF pre-registration | Pre-registration = design + analysis code: no personal data (choose OSF's **Germany – Frankfurt** storage at project creation anyway). Global model artefacts (item factors, centroids, priors) are aggregates over all users. A **row-level event dataset of 42 people is not anonymous** by relabelling — publication is a transfer to the world and lawful only if genuinely anonymous (Recital 26; WP29 Opinion 05/2014). | Not built.                                                                                                                         | Publication needs a documented anonymisation or restricted access (§4, release options).                                                                                                                       | Same conclusion.                                                                               |
| 9   | Operator-facing providers (Let's Encrypt, DuckDNS, GHCR image); Google (OAuth, P8 Calendar)                                           | No participant data (README §2). Google acts as an independent controller for sign-in and calendar; Google → Supabase is inbound.                                                                                                                                                                                                                                                                                             | As documented.                                                                                                                     | None of ours.                                                                                                                                                                                                  | n/a                                                                                            |
| 10  | Notifications (P10)                                                                                                                   | Not implemented yet (`apps/mobile/src` has no `expo-notifications` use). A server push through Expo's push service (US) carrying task titles would be a **new** transfer path. Pre-empt: local scheduled notifications, or generic bodies resolved on-device.                                                                                                                                                                 | —                                                                                                                                  | Avoidable by design.                                                                                                                                                                                           | Avoidable by design.                                                                           |

Net: paths **4, 5, 6, 8** are the whole problem; 2 and 10 are two-line design choices.

## 3. Lawful bases available (Case E)

- **Art. 45 adequacy.** None for Ukraine (17 decisions as of 2026-08-27; the latest is Brazil,
  January 2026). For the US only DPF-certified importers: GitHub is certified; HF Hub not
  verified; OSF is moot with Frankfurt storage. The DPF survived at first instance (T-553/23,
  2025-09-03); the appeal (C-703/25 P, lodged 2025-10-31) has no hearing date — a judgment is not
  expected before late 2026/2027. Building the thesis claim on it means re-checking at OSF freeze.
- **Art. 46 SCCs.** The importer on paths 4–5 is a controller **already subject to the GDPR via
  Art. 3(2)**; the 2021 SCCs do not cover that case, and the Commission's dedicated clauses
  (consulted Q4 2024) were still unadopted on 2026-08-27. The processors' DPAs contain SCCs for
  _their_ onward transfers, not for exports to the customer. So there is no ready-made Art. 46
  instrument for the researcher's own access today.
- **Art. 49(1)(a) explicit consent.** Feasible in a research consent form: "the researcher is in
  Ukraine, which has no EU adequacy decision; your pseudonymised study data will be accessed from
  there; the risks are …; you may withdraw" (EDPB Guidelines 2/2018: derogations are exceptions;
  consent must be explicit, specific and risk-informed; withdrawal stops future transfers). For a
  consented 42-person study this is the conventional academic route — but it covers access by
  the researcher, not a routine pipeline to a third-party processor. The "compelling legitimate
  interests" fallback (Art. 49(1) 2nd subpara.) needs DPA notification — not appropriate here.
- **Not transferring personal data.** Anonymous aggregates are outside the GDPR (Recital 26).
  Whatever leaves the EU as coefficients, tables, plots or synthetic data needs no Chapter V basis.
  This is the only basis that does not depend on the population question or on the DPF appeal.

## 4. Options

| Option                                                   | Analysis + OPE (path 5)                                                                                                                                                                                                                                                                       | Training (path 6)                                                                                                                                                                                                 | Researcher's access (path 4)                                                                                                                                                                                                | Thesis sentence                                                                                                                                                                                   | Cost / risk                                                                                                                                                                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — in-region by construction** (recommended)          | Runs **on the EU VM** (a second container from `training/` + the frozen analysis script, nightly via systemd — it can replace the synthetic keep-busy job) or in Supabase SQL; the Mac receives **aggregates only** (coefficients, tables with a minimum cell size, plots, no per-user rows). | **On the VM**, same container; `train.yml` keeps running in CI **on synthetic data only** as the pipeline's test; model registry = Supabase Storage bucket / `model_registry` in Postgres (EU) instead of HF Hub. | Policy: no row-level browsing of participant tables from the Mac; erasure and support through RPCs/aggregate views; **Art. 49(1)(a) clause in the consent form** as the backstop for incidental access, listed in the DPIA. | "All participant data is stored and processed in EU regions; the researcher, located in Ukraine, receives anonymous aggregates; incidental administrative access is covered by explicit consent." | 0 €; 2 cores / 12 GB are ample for ≤ 42 users; **check arm64 wheels** for `implicit`/`scikit-learn` (P11); CPU contention with `/plan` — schedule at 03:00 local, `cpus:` cap on the second container.         |
| **B — self-hosted GitHub runner on the VM**              | As A, orchestrated by GitHub.                                                                                                                                                                                                                                                                 | `train.yml` unchanged in shape; data stays in the EU; only logs/artefacts leave (must be aggregates).                                                                                                             | As A.                                                                                                                                                                                                                       | As A.                                                                                                                                                                                             | Self-hosted runners on a **public repo** execute PR code — restrict to `main`/schedule, no fork PRs; a runner token to rotate; one more process on the box. A subset of A; pick it for GitHub's scheduling UI. |
| **C — as specified** (GitHub-hosted US runners + HF Hub) | Unchanged.                                                                                                                                                                                                                                                                                    | US runners under Art. 45 (GitHub DPF); HF Hub unverified.                                                                                                                                                         | Consent clause still needed.                                                                                                                                                                                                | Must be rewritten: "EU storage; training on US infrastructure under the DPF".                                                                                                                     | Cheapest engineering, weakest claim: DPF appeal pending; under UA Art. 29 the US needs consent anyway; the HF Hub gap.                                                                                         |
| **D — full dataset to the Mac under Art. 49(1)(a)**      | On the laptop.                                                                                                                                                                                                                                                                                | Any of the above.                                                                                                                                                                                                 | Consent clause carries everything.                                                                                                                                                                                          | "EU storage; analysis in Ukraine with explicit consent".                                                                                                                                          | Conventional in academia, but the least-controlled processing location (Art. 32: full-disk encryption, no cloud backup, retention/deletion on the laptop); stretches "occasional".                             |

**Public release (path 8) — separate choice at the OSF freeze (⛔ irreversible):**
(i) a **row-level** dataset with a documented anonymisation (coarsened timestamps, generalised
categories, small-cell suppression, a re-identification risk statement) — strong claim, hard to
defend for 42 users; (ii) a **synthetic** dataset drawn from the fitted models plus the replay
harness (File 06's "one-command replay" reproduces the tables without personal data); (iii) a
**restricted-access** deposit on OSF (Frankfurt storage, access on request under a data-use
agreement). Recommended: **(ii) + (iii)**; File 06 §5's "anonymized event dataset (Parquet, HF
datasets)" then changes wording (spec-conflicts H5).

## 5. Recommendation (default if the owner does not object)

**Option A + release (ii)+(iii)**, with the consent-form transfer clause regardless of option,
edge-function region pinning in P8 (when the sync engine replaces both `functions.invoke`
call sites), and local notifications in P10. It makes the thesis claim true **by construction**
in both population cases, keeps the DPF litigation out of the argument, costs nothing, and turns
the keep-busy timer into useful work. B is the fallback if GitHub orchestration is wanted.

## 6. Findings that need the owner's answer (not decided here)

1. **Population.** Who the participants are decides Art. 3(2) and Art. 27. Default until File 06
   is frozen: design for Case E.
2. **Art. 27 representative (Case E).** A Ukrainian controller monitoring EU data subjects must
   designate a representative in the Union unless processing is "occasional", excludes large-scale
   special categories **and** is unlikely to result in a risk (Art. 27(2)) — an 8-week continuous
   behavioural study is not "occasional". Options: a partner EU institution (supervisor's
   university?) as representative, or record the gap in the DPIA with the reasoning. Not blocking
   the build; blocking the compliance claim.
3. **Consent form.** Include the Art. 49(1)(a) clause (default: yes) — drafted with the FR-42
   texts in P8/P9.
4. **rMEQ answers.** Sleep-timing questions are not an Art. 9 category on their face but sit close
   to health data; the DPIA should say so explicitly (P12).

## 7. Facts verified 2026-08-27 (re-check at the OSF freeze)

- Commission adequacy list: 17 decisions, no Ukraine —
  https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/adequacy-decisions_en
- EDPB Guidelines 05/2021 v2.0 (2023-02-14): three criteria (§7); Example 6 (controller and
  data subjects outside the EU), Example 10 (controller under Art. 3(2)) —
  https://www.edpb.europa.eu/system/files/documents/2023-02/edpb_guidelines_05-2021_interplay_between_the_application_of_art3-chapter_v_of_the_gdpr_v2_en_0.pdf
- DPF: General Court T-553/23 _Latombe v Commission_ dismissed 2025-09-03; appeal C-703/25 P
  lodged 2025-10-31, no hearing scheduled (IAPP; EDPL 2026/1).
- SCCs for importers subject to Art. 3(2): public consultation Q4 2024, not adopted —
  https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/standard-contractual-clauses-scc_en
- GitHub: DPF-certified (GitHub General Privacy Statement, https://docs.github.com/privacy);
  DPA https://github.com/customer-terms/github-data-protection-agreement.
- Ukraine Law 2297-VI Art. 29 (EEA + Convention 108 parties adequate; otherwise consent etc.) —
  https://zakon.rada.gov.ua/laws/show/2297-17; draft No. 8153 first reading 2024-11-20, not in
  force (EBA; eu4digitalua).
- OSF storage regions (US, Canada, Germany–Frankfurt, Australia; fixed at project creation) —
  https://help.osf.io/article/236-set-a-global-storage-location
- Supabase Edge Functions regional invocation (`region` option / `x-region` header;
  `x-sb-edge-region` response header) — Supabase docs "Regional invocations", via ctx7.
- Code facts: `.github/workflows/ci.yml` references no hosted-project secret; edge functions log
  only `console.error('<fn> failed', err)`; `apps/mobile/src` has no `expo-notifications` usage;
  `@supabase/supabase-js ^2.112.4` exports `FunctionRegion`.

## Decision (owner, 2026-08-28)

1. **Population.** Recruitment is in Ukraine (university lists, local productivity
   communities); participants are treated as Ukraine-based, with EU/EEA residents possible and
   **not designed against**. Nothing in the system depends on the answer (option A makes it
   irrelevant to the lawful-basis question). The **Art. 27 representative** is recorded as a
   **conditional obligation**: it triggers if any EU/EEA-resident participant enrolls, and the
   enrollment checklist (File 06 §1.3, P11 study mode) asks the question so it cannot surprise
   anyone (privacy README G6).
2. **Option A — in-region by construction.** Analysis and training run on the EU VM
   (`training/` container + systemd timer, replacing the synthetic keep-busy load); `train.yml`
   runs in CI on **synthetic data only**; the model registry lives in **Supabase Storage** (EU) —
   `model_registry.artifact_uri` is an EU storage URI, not an HF Hub reference; the researcher
   receives **aggregates only**; the Art. 49(1)(a) clause goes into the consent form as the
   backstop for incidental administrative access. Rationale in the owner's words: it makes the
   thesis claim true rather than defensible-with-caveats, at no cost, and it survives both the
   population question and the DPF appeal.
3. **Release.** Public artefact = **synthetic dataset + the replay harness**; the real
   pseudonymised event log goes to a **restricted-access deposit on EU storage** (OSF, Frankfurt
   region, data-use agreement). File 06 §5's "anonymized" is an over-claim (42 × 8 weeks of
   timestamps is pseudonymised at best) — the exact replacement wording is thesis-corrections
   #35–36.
4. **Path 4 discipline** (dashboard/CLI from the researcher's Mac) is written as a followable
   rule in `docs/privacy/README.md` §7 — what may and may not be opened once real participant
   data exists — not as a caveat.
5. **PAYG** stays deferred (no reclamation exemption; keep-busy on) until before enrollment.

## Consequences (apply once the owner decides)

- **P8:** pin `region` on both `functions.invoke` sites in the new sync engine; draft the consent
  clause with the FR-42 texts; the onboarding/enrollment flow records country of residence for
  the Art. 27 trigger (a yes/no in study mode, not free text). **P10:** notifications local-only or text-free. **P11:** training +
  analysis container on the VM (`training/` gains a `Dockerfile` and a systemd timer next to the
  keep-busy one; arm64 wheel check), model registry in Supabase Storage, `train.yml` on synthetic
  data only, anonymisation/synthetic-release procedure, the NFR-S3 export query test stays.
  **P12:** DPIA §transfers = §2 of this ADR; runbook section for the analysis container.
- **Thesis text:** thesis-corrections #34–36; File 06 §5 wording (spec-conflicts H5); specs/07
  `model_registry.artifact_uri` semantics (EU storage URI, not HF Hub).
- **Traceability:** NFR-S2 gains a "flows" row pointing here; the claim flips to ✅ only after
  the owner's decision is implemented and the consent form carries the clause.
