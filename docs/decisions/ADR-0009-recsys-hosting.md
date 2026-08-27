# ADR-0009 — RecSys service hosting after the loss of free Hugging Face Docker Spaces

- **Date:** 2026-08-27
- **Status:** **accepted 2026-08-27 — owner decision: option A** (Oracle Cloud Always Free,
  `eu-marseille-1`); the options analysis below is kept as the record of why
- **Phase:** P7 (raised); affects P5/P6 verification backlog, P11 (model registry), P12 (release)
- **Spec anchors:** File 03 §2.2 (stack, cost envelope), File 02 NFR-Sc1 / NFR-S2 / NFR-P1 /
  NFR-R2, File 04 §1.5 ("meeting NFR-P1 on 2 vCPU"), UC-03 A1 ("free-tier sleep"), specs/07 §7;
  spec-conflicts **H4**, thesis-corrections #26–#27; CLAUDE.md invariant 11 (free tier only)

## Context

The architecture (File 03 §2.2, "unchanged from v1.0") runs the FastAPI/CP-SAT service on a free
Hugging Face **Docker Space** (CPU Basic, 2 vCPU / 16 GB, $0/h) and builds NFR-Sc1's "$0 through
~3k MAU" on it; `deploy-recsys.yml` (P5) pushes the `services/recsys` subtree to that Space;
HANDOFF ⛔ 1 asked the owner to create it. **That tier no longer exists** — verified 2026-08-27
against the provider's own pages (research transcript summarised here; every claim carries its
source):

| Fact (verified 2026-08-27)                                                                                                                                                             | Source                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| "Static Spaces are free for everyone. Gradio and Docker Spaces run on compute and **require a paid plan to create**: PRO for personal accounts, Team or Enterprise for organizations." | huggingface.co/docs/hub/spaces-overview                                               |
| Docs change = hub-docs PR #2624 by HF staff, opened 2026-07-06, merged 2026-07-21; UI gate observed 2026-07-08. No changelog/blog announcement.                                        | github.com/huggingface/hub-docs/pull/2624; discuss.huggingface.co/t/…/177580          |
| CPU Basic still "$0/hour" but only creatable on a paid plan; **PRO = $9/month**; Team = $20/user/month.                                                                                | huggingface.co/docs/hub/spaces-gpus; huggingface.co/pricing                           |
| "For non-Team or Enterprise users, repositories are always stored in the US"; EU runtime for Spaces exists only on Team/Enterprise.                                                    | huggingface.co/docs/hub/storage-regions                                               |
| CPU Basic: fixed 48 h sleep, no custom keep-alive; cold start community-reported 2–5 min.                                                                                              | huggingface.co/docs/huggingface_hub/…/manage-spaces; discuss.huggingface.co/t/…/72154 |
| Grandfathering of pre-existing free Docker Spaces: **unverified** (conflicting user reports, no staff statement). Irrelevant for us — ours was never created.                          | forum threads 177580 / 177629 / 177703                                                |

Two consequences beyond the deploy path: (1) the **NFR-S2 "EU region hosting" claim never held for
the service tier** as specified — the P1 DPIA note hedged "not guaranteed"; it is now a verified
"US only" for free and PRO accounts (thesis-corrections #27); (2) every verification item pinned
to "the 2 vCPU Space" (warm NFR-P1 p95 on the learned path, container solve timing, the live
learned-path smoke) stays blocked and is **never** substituted by Mac numbers (CLAUDE.md
"Simulator evidence").

### What the service actually needs

| Need                                       | Why                                                                                                                                                                                                                                           | Consequence for a host                                                                                                                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native OR-Tools CP-SAT (Python wheel, C++) | File 04 §1 is a CP-SAT model (optional intervals, NoOverlap, AddElement, AddHint, anytime cap); P5 tests/parity pin it                                                                                                                        | A Linux container (or VM) running CPython; ~400 MB image (ortools ≈ 100 MB, scipy, numpy, psycopg)                                                                            |
| 2 workers, 1.5 s anytime cap               | File 04 §1.5 "on 2 vCPU"; measured presolve-bound (ADR-0007 §11): CPU speed, not RAM, decides                                                                                                                                                 | Real cores. Fractional-vCPU tiers (0.1 vCPU) turn a 150 ms day solve into seconds and make the week horizon unreachable                                                       |
| Warm during the study                      | NFR-P1 is "warm backend"; a cold hit under the 1.9 s EF budget is a fallback plan → an **outage user-day excluded from the analysis** (File 06 §1.6). With tens of participants the first plan of each morning would hit a sleeping container | Either no scale-to-zero, or a keep-warm (pg_cron → `/healthz` every 5 min is one SQL line — pg_net is already in the P7 migration) that costs nothing on the host's free tier |
| EU processing region (NFR-S2)              | Pseudonymous user id + behavioural features are personal data; the thesis states EU hosting                                                                                                                                                   | An EU member-state region selectable on the free tier (UK/CH are adequacy countries, not EU)                                                                                  |
| $0 (invariant 11; NFR-Sc1)                 | "Free tier only; any cost-incurring choice needs explicit approval first"                                                                                                                                                                     | Perpetual free tier, not a trial/credit; whether a card on file is acceptable is part of the decision                                                                         |
| Reachable by the edge function + cron      | `plan-request` calls `/plan`; `attribute-rewards` calls `/feedback`; the P7 sweep re-delivers undelivered tuples, so **learning signal survives an outage** (P7 migration `delivered_at`)                                                     | Public HTTPS URL; the shared `HOURWELL_SERVICE_KEY` header                                                                                                                    |
| Training/OPE (P11) unaffected              | Runs on GitHub Actions + HF **Hub** (model registry, datasets) — the Hub is not affected by the Spaces change                                                                                                                                 | Only the online service moves                                                                                                                                                 |

## Options (facts verified 2026-08-27; each against NFR-S2 · cost · NFR-P1 · migration)

**A. Oracle Cloud "Always Free" VM, EU home region (Frankfurt / Amsterdam / Paris / Stockholm /
Milan / Madrid / Marseille) — Docker + Caddy, image from GHCR.**
Ampere A1 allowance = 1,500 OCPU-h + 9,000 GB-h per month ⇒ **2 OCPU + 12 GB always on**; also
2 × AMD micro (1/8 OCPU, 1 GB — too weak). Home region only; EU choices exist. "Never expires."
Card + phone for identity, "will not be charged unless you upgrade".

- NFR-S2: ✅ EU region (member state) chosen at sign-up. · Cost: **$0**, no bill possible without
  a PAYG upgrade. · NFR-P1: ✅ best of all — no cold start, 2 real cores; container pinned with
  `--cpus=2` reproduces File 04 §1.5's box exactly (measurement item on the checklist becomes
  runnable). NFR-Sc1's "$0 through ~3k MAU" **stays true verbatim** (a 2-core box does ≈ 1 plan/s
  warm) and the "$25–50/mo at 50k" tier maps to a paid A1 shape (~$0.01/OCPU-h).
- Risks: (i) **"Out of host capacity"** for A1 at creation is chronic and acknowledged in Oracle's
  docs — a lottery that can take days (less contended regions: Marseille/Milan/Madrid/Stockholm);
  (ii) **idle reclamation**: Always Free instances with 7-day CPU/network/memory 95th-pct < 20 %
  "may be reclaimed" — a tens-of-requests/day service is idle by that rule; mitigations: the keep-warm
  ping (network) plus a nightly `bench_solve.py` run (CPU) — or the PAYG upgrade, which exempts the
  tenancy while keeping the same resources free; (iii) **ops on a VM**: OS patching, firewall,
  TLS (Caddy + a free DNS name), SSH deploys from Actions — more moving parts than a PaaS, all
  ours to keep secure; (iv) ARM64: `ortools` publishes aarch64 manylinux wheels, but a multi-arch
  build must be verified in CI (it is not today).
- Migration: Dockerfile unchanged; new workflow (build+push GHCR multi-arch → `ssh … docker compose
pull && up`); Caddyfile + compose in `services/recsys/deploy/`; `RECSYS_URL` = the VM's name;
  runbook for the owner (account, VM, ports 80/443, DNS, GitHub secrets `ORACLE_HOST`/`SSH_KEY`).
  ≈ 1 day of work + owner sign-up.

**B. Google Cloud Run, Tier-1 EU region (europe-west1 Belgium / europe-west4 Netherlands /
europe-west9 Paris / europe-north2 Stockholm), scale-to-zero + pg_cron keep-warm.**
Always-Free: 2 M requests, 360k GiB-s, 180k vCPU-s per month, "aggregated across projects by billing
account and resets every month"; **not region-restricted** (the US-only clause applies to Compute
Engine only); "applied as a spending-based discount using Tier 1 pricing". 60-min request
timeout, no image-size limit. **Requires a billing account (card).**

- NFR-S2: ✅ EU region, Google DPA. · Cost: **$0 for the study** (a 2-vCPU service billed only
  while serving: 3 vCPU-s per 1.5 s plan → ≈ 60k plans/month inside the free grant; keep-warm
  pings cost ≈ 1k vCPU-s/month); but the card can be charged — mitigate with `max-instances=1`,
  budget alerts, no min-instances. **NFR-Sc1 must be restated**: ≈ $9/mo at 3k MAU, ≈ $150+/mo at
  50k MAU (no always-on box to saturate) — thesis-corrections text change, honest but a change.
  · NFR-P1: ✅ warm; cold start of a 400 MB Python image is seconds (unmeasured) → each cold hit is
  one fallback plan; the keep-warm makes cold hits rare, not impossible (instance recycling). `--cpu=2`
  reproduces the 2-vCPU box. · Migration: `gcloud run deploy` from Actions via Workload Identity
  Federation (no long-lived keys), Artifact Registry in the same region, `RECSYS_URL` = the run.app
  URL. ≈ ½ day + owner project/billing/WIF setup (deterministic).

**C. Hugging Face PRO ($9/month) — keep everything as built.**

- NFR-S2: ❌ **US only** (EU runtime is Team, $20/user/mo). · Cost: $9/mo (the sole paid item; the
  cost envelope becomes "$9/mo service tier"). · NFR-P1: as designed (2 vCPU CPU Basic; 48 h sleep,
  2–5 min cold start after two idle days — a study with daily users stays warm). · Migration: **none**
  (workflow, secrets, HANDOFF ⛔ 1 as written). Also possible: HF Inference Endpoints **eu-west-1**
  at $0.033/h ≈ $24/mo always-on — EU but paid and a different deploy model.
- Verdict: fixes the deploy path only; breaks both stated constraints (free tier, EU). Not recommended
  unless the owner explicitly accepts both text changes for zero engineering time.

**D. Supabase-only — no Python container (online path in Deno Edge Functions).**
Verified limits: **2 s CPU per request** (hard; one docs page says 200 ms), 256 MB, 20 MB bundle,
150 s wall on Free, 500k invocations/month; WASM is supported; functions run at the edge globally
unless pinned with `x-region: eu-west-1`. No `plpython3u` (refused by Supabase for security), no
container/VM product, staff: Python is not coming to Edge Functions. Google ships no JS/WASM
OR-Tools; community ports: `cpsat-js` 1.3.0 (OR-Tools 9.12, 6 MB wasm, single-thread; **no
AddElement, no optional intervals**), `or-tools-wasm` 0.9.1 (full API, 9.15, but 12 MB CP-SAT wasm

- 105 MB tarball, thread-dependent); MIP fallback `highs` 1.15.2 (3.4 MB, verified in Deno).

* NFR-S2: ✅ (pin eu-west-1). · Cost: $0. · NFR-P1: ❓ single-threaded solver under a 2 s CPU cap —
  the day instance (presolve-bound, ~150 ms on a Mac) might fit, the week horizon will not.
  · Migration: **a method change** — the File 04 §1 CP-SAT model would be re-encoded (no optional
  intervals/AddElement in the only small port) or reformulated as MIP for HiGHS; the bandit/Beta/blend
  math is trivial to port (the TS mirrors already exist for arm A) but every P5 solver test, the
  parity fixture, ADR-0007's measured behaviour and the thesis's "bandit-weighted CP-SAT" claim would
  be redone. Weeks of work in the middle of the thesis; the training/OPE side stays Python anyway.
* Verdict: architecturally attractive (one runtime, EU by construction) but wrong at this point of
  the thesis. Recorded as a roadmap item (§ Consequences), not as a P7 option.

**E. Other free EU serverless container grants — Scaleway Serverless Containers (Paris/Amsterdam/
Warsaw; 400k GB-s + 200k vCPU-s/month), Azure Container Apps (180k vCPU-s + 360k GiB-s/month; West
Europe, Germany West Central, Sweden Central …).** Both: EU ✅, $0 within the grant, card required,
scale-to-zero with unpublished cold starts, an always-on replica exceeds the grant. Same shape as B
with a smaller grant, less mature CI tooling (Scaleway) or heavier setup (Azure). B dominates them.

**F. Vercel Hobby, Python function pinned to fra1 (Frankfurt) — no card.** Region selectable on
Hobby; Python bundle limit 500 MB (OR-Tools fits); 300 s max; **4 CPU-hours/month** and
"non-commercial use only" (a thesis study qualifies). EU ✅, $0 ✅, no card ✅; fails NFR-Sc1 by
construction (4 CPU-h ≈ 10k plans/month at 1.5 s), cold starts on every idle gap ("pre-warmed
instances" are paid), serverless-function packaging instead of the Dockerfile. A credible
**study-only** fallback if the owner refuses any card on file; the scalability claim would have to be
re-scoped to "study scale".

**G. Disqualified (facts):** Fly.io (no free tier for new orgs since 2024; trial only); Koyeb Free,
Render Free, Northflank sandbox (0.1 vCPU — 10× too slow for the solver; Render also spins down after
15 min with ~1 min spin-up); Railway ($1/month credit); Modal ($30/month credits but EU regions at
1.5–1.75× and keep-warm billed — the credits would not survive a warm month); Cloudflare Containers
(paid plan); Deno Deploy (JS/TS only); Leapcell/Back4app (no EU); GitHub Actions as compute (ToS
forbids serving; 10–30 s+ start latency).

## Recommendation

**A (Oracle Always Free, EU home region) as the target, with B (Cloud Run, Tier-1 EU) as the
pre-approved fallback if A's capacity cannot be obtained within a bounded attempt.** Reasoning in
the CLAUDE.md priority order:

1. _Thesis defensibility_: A keeps every stated constraint literally true — free tier, EU region,
   the "2 vCPU" box of File 04 §1.5, and the NFR-Sc1 envelope including its 50k-MAU migration tier.
   B keeps "free for the study" and "EU" but forces a rewrite of NFR-Sc1's numbers (a defensible
   rewrite, still a rewrite). C breaks two constraints; D changes the method; F breaks scalability.
2. _Consistency with specs_: A and B are both "a free CPU container in the EU" — one errata line
   (H4) either way; A additionally preserves UC-03 A1's "cold backend" story as a rare event rather
   than a daily one.
3. _Measurability_: A gives a deterministic, always-warm 2-core box for the NFR-P1 p95 and the
   container solve timing (the two blocked verification items); B's numbers would carry a
   cold-start tail that has to be reported separately.
4. _Pragmatics_ (last): B is the easier setup and the lower operational risk; A costs a VM runbook,
   an ARM build check, and a sign-up lottery. That trade is worth making for a thesis whose text
   states the constraints A preserves — but only if the lottery is bounded, hence the fallback.

If the owner would rather not run a VM at all, **B is the right single choice** and costs one
paragraph in the thesis (thesis-corrections #26 gets the Cloud Run numbers). C is a stop-gap for
speed only and should be declined on the EU ground alone.

## Consequences (apply once the owner decides)

- **Either A or B:** rewrite `deploy-recsys.yml` for the chosen host; add the host to
  `docs/privacy/README.md` (region, DPA); rewrite HANDOFF ⛔ 1 with the runbook; keep the
  `RECSYS_URL` / `HOURWELL_SERVICE_KEY` contract (edge functions unchanged); add the pg_cron
  `/healthz` keep-warm (B: required; A: also the idle-reclaim guard); pin the container to 2 CPUs
  for the File 04 §1.5 measurement; then run the blocked items: live learned-path smoke, warm
  NFR-P1 p95, `bench_solve.py` in the container (device-checklist "Service environment").
- **A specifically:** multi-arch (arm64) image build in CI; `services/recsys/deploy/` (compose +
  Caddyfile); `docs/runbooks/oracle-vm.md`; decide PAYG-upgrade vs keep-busy for reclamation;
  thesis-corrections #26 → "Oracle Cloud Always Free (EU)" with the envelope unchanged.
- **B specifically:** WIF + Artifact Registry; `max-instances=1`, budget alert; thesis-corrections
  #26 → Cloud Run numbers ("$0 through ~1k MAU, ≈ $9/mo at 3k, ≈ $150+/mo at 50k"); a cold-start
  measurement added to the checklist (report the p95 with and without cold hits).
- **Roadmap (any choice):** D remains the long-term "one runtime" option — revisit after the study,
  when the model is frozen and a re-encoding can be validated against the archived OPE logs.
- **Not done, by owner instruction:** no Space, no GitHub secrets, no host account; the three
  blocked measurements stay on the verification backlog explicitly (device-checklist, HANDOFF).

## Decision (2026-08-27)

1. **Host = option A.** The owner provisioned `recsys-oracle` (VM.Standard.A1.Flex, 2 OCPU /
   12 GB, Ubuntu 24.04 Minimal aarch64) in **France South / Marseille (`eu-marseille-1`)**, an
   EU member-state region, with a reserved public IPv4 and 80/443 open. NFR-S2 holds for every
   tier; NFR-Sc1's envelope stays as written. Q1 answered by the provisioning; Q3/Q4 moot.
2. **Q2 (idle reclamation):** default kept — **upgrade the tenancy to Pay As You Go** (Always
   Free shapes remain free; the 1 EUR budget alert guards mistakes). Until the owner confirms the
   upgrade, `hourwell-keepbusy.timer` runs `bench_solve.py` hourly inside the container to keep
   the 7-day 95th-percentile CPU above the reclaim threshold; disable it once upgraded.
3. **Hostname + TLS = DuckDNS** (`hourwell-recsys.duckdns.org`) + Caddy automatic HTTPS. The edge
   function needs an `https` `RECSYS_URL` and Let's Encrypt does not issue for bare IPs, so a name
   is on the critical path. DuckDNS is free without a card, gives a stable name for a static IP,
   and is on the **Public Suffix List** — Let's Encrypt's per-registered-domain rate limit then
   applies to our subdomain alone; `sslip.io`/`nip.io`-style wildcard names share one bucket with
   every other user and can fail for reasons outside our control. Owning a domain would cost money
   (invariant 11). Steps: runbook §2.
4. **Rollout = pull-based, no SSH from CI.** The owner's hardening requirement (port 22 only from
   their IP) is incompatible with GitHub-hosted runners SSHing into the box (hundreds of changing
   egress ranges). CI therefore builds the linux/arm64 image on a native arm64 runner, verifies a
   real CP-SAT solve with the aarch64 OR-Tools wheel inside it, pushes to GHCR (`:sha` + `:latest`),
   and only _observes_ the rollout (`/healthz.build == sha`); the VM's `hourwell-rollout.timer`
   pulls every 5 min. Consequence: **no GitHub secrets** are needed at all — one repo variable
   (`RECSYS_HOST`). The GHCR package must be public (the image holds no secrets; the repo is public).
5. **Box hardening and re-verification are scripted** (`deploy/harden.sh`, `verify.sh`) and
   listed step by step in `docs/runbooks/oracle-vm.md` §3; the data-protection change (self-hosted
   processing, Oracle as processor, our patching responsibility) is recorded in
   `docs/privacy/README.md` — treated like the HF EU finding, not as plumbing.
6. **Container pinned to 2 CPUs** (`cpus: 2` in compose) so `bench_solve.py` inside it measures
   the box File 04 §1.5 names; a threshold different from the Mac numbers is an empirical result
   (ADR-0007 §11 treatment).

## Questions for the owner (as asked before the decision; answers above)

1. Host: **A with B as fallback** (default) · B only · C · F?
2. If A: PAYG upgrade to exempt the tenancy from idle reclamation (default: **yes**, it stays $0)
   or keep the tenancy un-upgraded and rely on the keep-busy job?
3. If B: is a card on a $0-spend billing account acceptable under invariant 11 (default: **yes**
   with `max-instances=1` + budget alert)?
4. Bound for the A capacity attempt before falling back to B (default: **3 days** of a retry script
   in the chosen EU region, then Marseille/Milan/Madrid before giving up)?
