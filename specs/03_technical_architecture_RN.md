# 03 — Technical Architecture (React Native Revision)

> **Project:** Kairos — Personal Time Optimization via Recommendation Systems
> **Document:** System Architecture, Tech Stack, RecSys Engine Design, Data Schema
> **Status:** v1.1-RN — supersedes `03_technical_architecture.md` v1.0. **Change scope: mobile client only** (React Native/Expo/TypeScript replaces Flutter/Dart). Backend, ML pipeline, data schema, and the offline-first contract (NFR-R1) are unchanged; §§3–5 and §7 carry over with client references updated.
> Versions reflect latest stable lines as of early 2026 — pin exact versions at implementation time.

---

## 1. System Architecture

### 1.1 High-Level Overview

```
┌───────────────────────────────────┐
│  MOBILE CLIENT                    │  React Native 0.8x (New Architecture:
│  React Native + Expo (TS strict)  │  Fabric + TurboModules, Hermes)
│  · Today / Inbox / Focus          │  Expo SDK 54+ · Expo Router (file-based)
│  · Expo SQLite + Drizzle ORM      │  Zustand (UI state) · Reanimated 4 +
│    (offline cache + op outbox)    │  Gesture Handler (drag-to-teach) ·
│  · chrono-node NL parser          │  FlashList v2 timeline · Skia heatmap
│  · (later: onnxruntime-rn ranker) │
└─────────────────┬─────────────────┘
        HTTPS/WSS │  @supabase/supabase-js v2 (auth, CRUD, realtime)
┌─────────────────▼─────────────────┐
│  SUPABASE (EU region)             │  Postgres 16 + Row-Level Security
│  · Auth (JWT, OAuth)              │  · Tables (§4) · Realtime channels
│  · Edge Functions (Deno/TS)       │  · pg_cron (plan triggers, retention)
└─────────────────┬─────────────────┘
     REST (JWT-   │ signed; service-role only server-side)
┌─────────────────▼─────────────────┐
│  RECSYS SERVICE                   │  FastAPI (Python 3.12) on Hugging Face
│  · /plan  /feedback  /insights    │  Spaces (Docker, free CPU tier)
│  · Feasible-start precompute      │  OR-Tools CP-SAT (File 4 §1)
│  · Bandit-weighted solve + TS     │  implicit · NumPy LinUCB/TS · River
│  · Model registry (HF Hub)        │  PyTorch (SASRec-lite) → ONNX
└─────────────────┬─────────────────┘
       nightly    │
┌─────────────────▼─────────────────┐
│  TRAINING PIPELINE                │  GitHub Actions cron (public repo →
│  · pseudonymized export → retrain │  free minutes) · eval gate · push
│    → eval gate → HF Hub → registry│  artifacts + registry row
└───────────────────────────────────┘
```

**Key request flow — plan generation (UC-03):** client → Edge Function `plan-request` (validates JWT, assembles context) → FastAPI `/plan` (File 4 §1: bandit-weighted CP-SAT, one posterior sample, one solve) → assignment + rationales + confidence + propensities persisted to `recommendations` → client renders. The **heuristic fallback (NFR-R2) lives in the Edge Function**, so a sleeping free-tier ML container never blocks the user — unchanged and client-agnostic.

**Feedback flow:** client appends facts to its local **Drizzle-managed outbox** (Expo SQLite) → push-then-pull sync (File 5 v1.1) → two-phase feedback: instant signals hit `/feedback` immediately; lapses are finalized by the 23:55 attribution job. Identical semantics to v1.0; only the client-side persistence layer changed.

**A note on shared types (new, and a genuine improvement over the Flutter stack):** the FastAPI OpenAPI spec and the Postgres schema are compiled into TypeScript types in CI (`openapi-typescript` + `supabase gen types typescript`). The client, Edge Functions (Deno/TS), and API contract now share one type system end-to-end — a class of client/server drift bugs that required manual discipline in Dart simply fails to compile here.

### 1.2 Architectural Principles — unchanged
Event sourcing for behavior · degradable intelligence (heuristic → cached personal model → full pipeline) · thin client, smart edge · everything versioned (`model_version` + feature snapshot per recommendation). The client remains a **fact logger and renderer**: it never computes rewards or touches model state — the boundary that keeps NFR-R1 and the ML layer independent survives the framework swap untouched.

## 2. Tech Stack Selection (100% free / free-tier)

### 2.1 Mobile client — replaced rows

| Layer | Choice (stable line, early 2026) | Why · free-tier fit |
|---|---|---|
| Framework | **React Native 0.8x** (New Architecture: Fabric + TurboModules default, Hermes) + **TypeScript 5.x `strict`** | Team expertise is the deciding factor — architecture quality is downstream of maintainer fluency. New Architecture closes the historical perf gap for our canvas-heavy timeline |
| Platform tooling | **Expo SDK 54+**, dev builds (`expo-dev-client`), **Expo Router** (file-based, typed routes) | Managed native layer, OTA-capable, config plugins cover every native module below — no ejecting |
| Timeline list | **@shopify/FlashList v2** | Rewritten for the New Architecture, no size-estimate tuning; 60 fps day/week timeline at our item counts (NFR-P2) |
| Animation & gestures | **react-native-reanimated 4.x** + **react-native-gesture-handler 2.x** | UI-thread worklets for the drag-to-teach interaction (UC-07) — drag physics never touch the JS thread; Reanimated 4 requires New Architecture, which we're on |
| Custom drawing | **@shopify/react-native-skia** | Energy heatmap (FR-40), focus-gradient timer ring, confidence-styled glass blocks — declarative canvas at native speed |
| Offline DB + ORM | **Expo SQLite + Drizzle ORM** (`useLiveQuery` reactive reads) | Type-safe schema/migrations in TS; live queries make SQLite the **single reactive source of truth** for domain data (replacing Drift's role 1:1). **Considered & rejected:** WatermelonDB — mature, but its built-in `synchronize()` presumes its own pull/push contract, which conflicts with our custom push-then-pull + domain-rule resolution in `sync-resolve` (File 5); we'd bypass its main feature. A hand-rolled Drizzle outbox matches the protocol we actually specified |
| Fast KV | **react-native-mmkv 3.x** | Settings, flags, sync cursor — synchronous, ~30× AsyncStorage |
| UI state | **Zustand 5.x** | Ephemeral UI state only (sheet stacks, timer, selection). Domain data flows exclusively from SQLite live queries — **deliberately no TanStack Query layer**: a server-cache abstraction on top of a local DB is double-caching with two invalidation systems; in DB-first offline architecture the database *is* the cache |
| Supabase SDK | **@supabase/supabase-js v2** | Auth (session in `expo-secure-store`), CRUD under RLS, realtime channels; same capabilities as the Flutter SDK — zero backend impact |
| NL quick-add | **chrono-node 2.x** | Best-in-class natural-language date/duration parsing, pure TS, runs on-device (FR-11) — an upgrade over the Dart options; server `/parse-preview` remains fallback-only |
| Notifications | **expo-notifications** | Local block reminders (FR-50); no correctness depends on background execution — lazy lapse detection (File 5) is unchanged and was designed for exactly this OS reality |
| On-device ML (roadmap) | **onnxruntime-react-native** | Same ONNX artifacts from the training pipeline; the on-device personal-ranker roadmap (§7) transfers as-is |

### 2.2 Backend, ML, data — **unchanged from v1.0**
Supabase free tier (Postgres 16, Auth, RLS, Realtime, Edge Functions, pg_cron; EU region) · FastAPI 0.11x + Pydantic v2 on Python 3.12 · Hugging Face Spaces free CPU + HF Hub model registry · OR-Tools CP-SAT ≥9.x · `implicit` 0.7.x ALS · NumPy-owned LinUCB/TS with Postgres-persisted state (MABWiser as CI test oracle only — per Phase 4 audit) · River online blend weights · PyTorch 2.x SASRec-lite → ONNX Runtime · sentence-transformers ≥3 MiniLM · PostHog + Sentry free tiers · GitHub Actions (public repo → free standard-runner minutes). Cost envelope per the corrected Phase 4 audit: **$0 through ~3k MAU; ≤$25/mo (Supabase Pro) to ~50k** (NFR-Sc1 as amended).

## 3. Recommendation Engine Design — unchanged
§§3.1–3.6 of v1.0 apply verbatim, as amended by File 4 (unified bandit-weighted CP-SAT with context bucketing supersedes Stages 1/4/5; propensity logging per migration M-01). Nothing in the engine touches the client framework: the `/plan` and `/feedback` contracts are JSON over HTTPS, and the client's only ML-adjacent duty — faithful fact logging with context snapshots — is persistence-layer work now handled by the Drizzle outbox.

## 4. Data Schema — unchanged
The v1.0 schema applies verbatim, including migrations **M-01** (`recommendations.propensity real`) and **M-02** (`displaced_pending` status + `conflict_flag`). One addition worth stating: Drizzle's client-side schema for the local mirror tables (`tasks`, `recommendations`, `events` outbox) is generated to match the Postgres schema via the CI type-generation step (§6), so local and remote shapes cannot silently diverge.

## 5. API Surface — unchanged
`POST /plan` · `POST /feedback` · `GET /insights` · `POST /parse-preview` (fallback-only) · `GET /healthz`. JWT verification against Supabase JWKS, as before.

## 6. DevOps & Quality (client pipeline replaced)

**PR pipeline (GitHub Actions):**
1. **Contract sync:** `supabase gen types typescript` + `openapi-typescript` against the FastAPI spec → fail the build if generated types differ from committed ones (client/server drift is a compile error, not a runtime surprise).
2. **Static gates:** `tsc --noEmit` (strict) · **ESLint 9** (flat config, `typescript-eslint`, `eslint-plugin-react-hooks`) · Prettier check (Biome noted as a consolidation option once its RN rule coverage matches — not yet the conservative choice).
3. **Tests:** **Jest 30** + **React Native Testing Library** for components; plain Jest for the domain layer (outbox reducer, sync cursor logic, lapse scan, NL-parse mapping) — coverage gate **≥70% on domain logic** (NFR-M1, unchanged); `expo-doctor` sanity check.
4. **E2E (nightly, not per-PR):** **Maestro** flows for the five critical paths (onboarding, quick-add, plan accept, drag-override, offline-complete-then-sync) on the EAS free-tier emulator or local runner.

**Build & release:** **EAS Build** for store binaries — free-tier build quota is finite, so the cadence is: local `eas build --local` (unlimited, free) for day-to-day, cloud EAS for signed store submissions; **EAS Update** for OTA JS/asset updates with staged rollouts (free tier covers early scale; quotas re-verified at implementation per the version-pinning rule). Python side unchanged: ruff + mypy + pytest, Docker build, deploy Space, nightly `train.yml` with the eval promotion gate.

**Observability:** `@sentry/react-native` (config-plugin install) with source maps uploaded from EAS builds; PostHog RN SDK with model-version tagging on every recommendation event (NFR-O1) — semantics identical to v1.0.

## 7. Security & Privacy Architecture — unchanged
RLS everywhere · scoped service role keyed by verified JWT `sub` · per-user embeddings, categorical-only cross-user training (NFR-S3, CI-tested export query) · secrets in GitHub/HF/EAS encrypted stores, none in the JS bundle (and OTA updates never ship secrets by construction) · GDPR: EU-region Supabase & PostHog, export/erasure (FR-42), DPIA in `/docs/privacy` · Roadmap: on-device personal ranker via **onnxruntime-react-native** — same artifacts, same privacy-and-latency win.

---

*Change log v1.0 → v1.1-RN: client framework, offline persistence, state management, client CI, and E2E tooling replaced; §§3–5, 7 semantics untouched; File 5 v1.1 updates participant names to match. Files 1, 2, 4, 6 require no changes — FR/NFR/use-case language and all math were written stack-agnostically (NFR-M1's coverage gate applies to the TS domain layer as it did to Dart's).*
