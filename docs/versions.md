# Pinned Versions

Every entry lists the version in use and the date it was verified against real docs/registries.
Spec File 03 mandates: "pin exact versions at implementation time". Deviations from the spec's
indicative versions are footnoted and, where architectural, recorded as ADRs.

## Toolchain (verified 2026-08-24)

| Tool                            | Version | Notes                                                                                                  |
| ------------------------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| Node                            | 24.13.1 | Active LTS. Spec-era PLAN said 22 LTS → ADR-0001                                                       |
| pnpm                            | 10.33.2 | pinned via `packageManager`; expo-doctor 21/21 → ADR-0002                                              |
| TypeScript                      | 5.9.3   | strict everywhere; 6.0 reverted → ADR-0004 (openapi-typescript peer `^5.x`)                            |
| ESLint                          | 10.9.0  | flat config (File 03 §6 said "ESLint 9"; 10 is the current line, same flat-config system)              |
| typescript-eslint               | 8.67.0  |                                                                                                        |
| eslint-plugin-react-hooks       | 7.1.1   | rules registered manually (version-stable form)                                                        |
| eslint-config-prettier          | 10.1.8  |                                                                                                        |
| @eslint/js                      | 10.0.1  |                                                                                                        |
| Prettier                        | 3.9.6   |                                                                                                        |
| uv                              | 0.12.5  | Homebrew install                                                                                       |
| supabase CLI                    | 2.115.0 | Homebrew; CI pins the same in supabase/setup-cli                                                       |
| Postgres (hosted + local)       | 17.6    | Supabase provisions 17 (File 03 said "Postgres 16" — 17 ⊇ 16 features; config.toml major_version = 17) |
| Python (service/training venvs) | 3.12.14 | spec-pinned line (File 03 §2.2); system 3.14 unused                                                    |
| ruff                            | 0.16.4  |                                                                                                        |
| mypy                            | 2.3.1   |                                                                                                        |
| pytest                          | 9.1.1   |                                                                                                        |

## Mobile (verified 2026-08-24)

| Package      | Version | Notes                                                                        |
| ------------ | ------- | ---------------------------------------------------------------------------- |
| expo         | 57.0.16 | Spec says "SDK 54+" — 57 is current stable                                   |
| react-native | 0.86.2  | New Architecture only (spec: "0.8x, New Arch")                               |
| react        | 19.2.3  |                                                                              |
| jest         | 29.7.0  | File 03 §6 says "Jest 30"; jest-expo 57 internals pin the 29 line → ADR-0003 |
| jest-expo    | 57.0.4  |                                                                              |
| @types/jest  | 29.5.x  | matches jest 29                                                              |
| @types/react | 19.2.x  |                                                                              |

## Mobile — P2 additions (verified 2026-08-24)

Expo-managed packages installed with `npx expo install` (SDK-57-resolved ranges); the rest
pinned exactly.

| Package                                            | Version  | Notes                                                                                                                    |
| -------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| expo-router                                        | ~57.0.16 | file-based routing; typed routes experiment on                                                                           |
| expo-sqlite                                        | ~57.0.1  | Drizzle driver `drizzle-orm/expo-sqlite`                                                                                 |
| expo-font / expo-localization / expo-splash-screen | ~57.0.x  | fonts at runtime + splash hold; locale detection for the typed catalog                                                   |
| expo-linking / expo-constants                      | ~57.0.x  | expo-router requirements                                                                                                 |
| expo-blur                                          | ~57.0.2  | glass panels (File 02 §3.1, 8–12 px blur, recommendation layer only)                                                     |
| react-native-safe-area-context                     | ~5.7.0   |                                                                                                                          |
| react-native-screens                               | ~4.26.2  |                                                                                                                          |
| react-native-reanimated                            | 4.5.1    | + react-native-worklets 0.10.1 (v4 peer)                                                                                 |
| react-native-gesture-handler                       | ~2.32.0  |                                                                                                                          |
| @expo-google-fonts/inter                           | ^0.4.2   | static instances of Inter (see spec-conflicts L12 — RN has no variable-axis API)                                         |
| @expo-google-fonts/jetbrains-mono                  | ^0.4.1   | numerals/timers (File 02 §3.3)                                                                                           |
| drizzle-orm                                        | 0.45.2   | pinned exact; TS 5.9 verified (ADR-0004)                                                                                 |
| drizzle-kit (dev)                                  | 0.31.10  | `driver: 'expo'` migration generation                                                                                    |
| babel-plugin-inline-import (dev)                   | 3.0.0    | inlines generated `.sql` migrations (Drizzle Expo guide)                                                                 |
| react-native-mmkv                                  | 3.3.3    | 4.x deferred: requires react-native-nitro-modules; 3.x is the plan-pinned line                                           |
| zustand                                            | 5.0.15   | ephemeral UI state only (invariant: no domain state)                                                                     |
| @sentry/react-native                               | 7.11.0   | SDK-57-validated line (expo-doctor pins ~7.11.0; 8.x rejected); env-gated init; EU org + DSN = end-of-P2 ACTION REQUIRED |
| @testing-library/react-native (dev)                | 14.0.1   | + test-renderer 1.2.0 (React-19-compatible universal renderer)                                                           |

## Mobile — P3 additions (verified 2026-08-24)

| Package                                           | Version | Notes                                                                                                    |
| ------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------- |
| chrono-node                                       | 2.10.1  | FR-11 NL quick-add; pinned exact (File 03 §2.1); duration grammar is ours — chrono owns dates only       |
| @shopify/flash-list                               | 2.0.2   | first real list (Inbox); v2 = New-Arch-only line per File 03 stack table                                 |
| better-sqlite3 (dev)                              | 13.0.3  | DAO tests run the committed drizzle bundle against real SQLite in jest                                   |
| posthog-react-native                              | 4.63.9  | pinned exact; env-gated init, EU host from env only (NFR-S2); no PostHogProvider → no autocapture/replay |
| expo-application / expo-device / expo-file-system | ~57.0.x | posthog-react-native's documented Expo support packages (installed via `npx expo install`)               |

Deferred installs (first consumer): FlashList v2 → P3 (first real list); react-native-skia →
P7/P9 (timer ring, heatmap); supabase-js v2 → P4 (auth); chrono-node → P3.

## Mobile — P4 additions (verified 2026-08-26)

| Package                        | Version | Notes                                                                                        |
| ------------------------------ | ------- | -------------------------------------------------------------------------------------------- |
| @supabase/supabase-js          | 2.112.4 | auth + PostgREST; PKCE flow, `processLock`, AppState auto-refresh per official RN quickstart |
| expo-secure-store              | ~57.0.1 | AES key storage for the session (official LargeSecureStore pattern, ADR-0006)                |
| expo-web-browser               | ~57.0.2 | `openAuthSessionAsync` for the browser OAuth flow                                            |
| react-native-get-random-values | ~1.11.0 | `crypto.getRandomValues` for AES key generation (documented Supabase Expo pattern)           |
| react-native-url-polyfill      | ^4.0.0  | supabase-js RN requirement (official quickstart import)                                      |
| aes-js (+ @types/aes-js dev)   | 3.1.2   | AES-256-CTR for session ciphertext (documented Supabase Expo pattern)                        |

APIs verified against Supabase docs via ctx7 on 2026-08-26 (`/supabase/supabase`): LargeSecureStore,
PKCE `exchangeCodeForSession`, `signInAnonymously` + `enable_anonymous_sign_ins` in config.toml,
`updateUser({email})` conversion, `supabase config push`, deep-link redirect allow-listing.

## RecSys service — P5 additions (verified 2026-08-26)

| Package              | Version       | Notes                                                                                 |
| -------------------- | ------------- | ------------------------------------------------------------------------------------- |
| fastapi              | 0.141.1       | `/plan` `/feedback` `/insights` `/parse-preview` `/healthz`; OpenAPI → `api.ts`       |
| pydantic             | 2.13.4        | strict request/response models (`extra="forbid"`), `AwareDatetime`                    |
| uvicorn[standard]    | 0.52.4        | serves on `$PORT` (HF Spaces 7860)                                                    |
| ortools              | 9.15.6755     | CP-SAT: `new_optional_interval_var`, `add_no_overlap`, `add_element`, `add_hint`      |
| numpy                | 2.5.2         | LinUCB/TS state, Sherman–Morrison, Cholesky TS sampling                               |
| scipy                | 1.18.1        | Beta quantiles for `/insights` CI (scipy-stubs 1.18.1.0 dev)                          |
| psycopg[binary,pool] | 3.3.4 / 3.3.1 | Supabase pooler connection pool (PostgresRepo)                                        |
| pyjwt[crypto]        | 2.13.0        | `PyJWKClient` ES256 verification against the project JWKS (cryptography 50.0.1)       |
| mabwiser (dev)       | 2.7.4         | CI oracle only (File 03 §2.2): LinUCB expectation equality, LinTS moments             |
| pytest-cov (dev)     | 7.1.0         | domain coverage gate (NFR-M1)                                                         |
| httpx (dev)          | 0.28.1        | FastAPI TestClient                                                                    |
| openapi-typescript   | 7.13.0        | `packages/shared/scripts/gen-api-types.sh` → `packages/shared/src/api.ts` (CI-diffed) |

APIs verified via ctx7 on 2026-08-26: `/google/or-tools` (CP-SAT Python snake_case API, optional
intervals, hints, time limit), `/fidelity/mabwiser` (LinUCB/LinTS `fit`/`predict_expectations`),
`/jpadilla/pyjwt` (`PyJWKClient.get_signing_key_from_jwt`, `jwt.decode` audience/require).
Project JWKS confirmed ES256 (asymmetric) — specs/07 §7's verification model applies unchanged.

## CI actions (verified 2026-08-24)

| Action             | Version |
| ------------------ | ------- |
| actions/checkout   | v4      |
| pnpm/action-setup  | v4      |
| actions/setup-node | v4      |
| astral-sh/setup-uv | v5      |

## Verified compatible, adopted later (verified 2026-08-24)

| Package            | Version | Notes                                                                            |
| ------------------ | ------- | -------------------------------------------------------------------------------- |
| openapi-typescript | 7.13.0  | peer `typescript@^5.x` — the reason for the TS 5.9 pin (ADR-0004); adopted in P1 |
| drizzle-orm        | 0.45.2  | strict-compile verified under TS 5.9.3 (ADR-0004); adopted in P2                 |

## TODOs (revisit on upstream releases)

- **jest 29.7 → 30** when jest-expo ships jest-30 support (ADR-0003).
- **TypeScript 5.9 → 6** when openapi-typescript widens its peer range (ADR-0004).

## To pin in later phases

FlashList v2 (P3, first real list) · chrono-node 2.x (P3) · PostHog SDK (P3, EU instance) ·
supabase-js v2 (P4) · River (P7) · react-native-skia (P7/P9) · expo-notifications (P10) ·
implicit 0.7.x (P11) · sentence-transformers ≥3 (roadmap).
