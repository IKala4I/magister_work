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
| Prettier                        | 3.9.6   | `supabase/functions/` excluded — `deno fmt` owns it                                                    |
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

## Edge Functions — P6 additions (verified 2026-08-26)

| Tool / package                | Version | Notes                                                                                            |
| ----------------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| Deno                          | 2.9.5   | Homebrew locally; CI `denoland/setup-deno@v2` pinned to v2.9.5; `config.toml` `deno_version = 2` |
| @supabase/supabase-js (Deno)  | 2.112.4 | `npm:` specifier in `supabase/functions/deno.json`; `auth.getClaims` JWKS verification           |
| @std/assert (jsr)             | 1.0.19  | Deno test assertions (resolved in `supabase/functions/deno.lock`)                                |
| supabase CLI functions config | 2.115.0 | `[functions.plan-request]` `verify_jwt = false`, `import_map = ./functions/deno.json`            |

APIs verified via ctx7 on 2026-08-26: `/supabase/supabase` (Edge Functions `Deno.serve`, npm/jsr
imports, `verify_jwt` in config.toml, `EdgeRuntime.waitUntil`), `/supabase/cli` (deploy entrypoint
and import-map resolution order: flag → config → `<fn>/deno.json` → fallback).

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

## P7 additions (verified 2026-08-27)

| Package / tool                         | Version                    | Notes                                                                                                                                                                                                              |
| -------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| river (recsys, dev)                    | 0.26.1                     | CI oracle only for the blend SGD step (File 03 §2.2 name kept; spec-conflicts L23); `LinearRegression(optimizer=optim.SGD(lr), intercept_lr=0, l2=0)`, Squared-loss gradient carries the factor 2 → pinned at lr/2 |
| pg_net (Supabase extension)            | hosted                     | `net.http_post(url:=, headers:=, body:=, timeout_milliseconds:=)` per supabase.com/docs/guides/database/extensions/pg_net (ctx7, 2026-08-27); cron→function pattern per docs/guides/functions/schedule-functions   |
| supabase_vault                         | hosted                     | `vault.decrypted_secrets` read by the cron tick (function is `security definer`, owner-set secrets)                                                                                                                |
| expo / expo-router / expo-sqlite / …   | 57.0.17 / 57.0.17 / 57.0.2 | SDK 57 patch alignment by `expo install --fix` (expo-doctor gate); react-native 0.86.3; jest-expo 57.0.5; `@expo/metro-runtime` ^57.0.14 pinned directly (doctor "overridden dependencies" check)                  |
| @react-native-community/datetimepicker | 9.1.0                      | already installed (P3); reused for the UC-07 Move picker (`mode="time"`, `minuteInterval={15}`)                                                                                                                    |

Gotcha recorded: RNTL 14 on the universal renderer makes `render` and post-press re-renders
asynchronous — assert after `await act(async () => { fireEvent.press(…) })` (the Inbox tests'
pattern); `findBy*` / `waitFor` hung the suite in P7.

## P8 additions (verified 2026-08-28)

| Package / tool                         | Version          | Notes                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| expo-network                           | ~57.0.1          | `addNetworkStateListener` → reconnect trigger for the sync engine (`npx expo install expo-network` from apps/mobile; expo-doctor 21/21)                                                                                                                                                                                                             |
| @supabase/supabase-js `FunctionRegion` | 2.112.4 (pinned) | `functions.invoke(name, { region: FunctionRegion.EuWest1 })` — enum members verified in `@supabase/functions-js` types (`EuWest1 = 'eu-west-1'`); the header `x-sb-edge-region` confirms the region live                                                                                                                                            |
| Google Calendar API v3 (REST, fetch)   | —                | `events.list` (`syncToken`, `singleEvents`, `showDeleted`, 410 → full resync), `events.watch` (`web_hook`, `params.ttl` default 604 800 s, `expiration` ms), `channels.stop`, `events.insert/patch/delete`; OAuth 2.0 web-server flow (`accounts.google.com/o/oauth2/v2/auth`, `oauth2.googleapis.com/token` + `/revoke`) — ctx7 2026-08-28; no SDK |
| drizzle-kit `generate`                 | 0.31.10          | `npx drizzle-kit generate --name p8_sync` from apps/mobile → `drizzle/0004_p8_sync.sql` + journal + `migrations.js` (expo driver)                                                                                                                                                                                                                   |
| supabase CLI `db query --linked`       | 2.115.0          | Management-API SQL against the linked project; one script = one implicit transaction; only the LAST statement's rows come back — `scripts/pgtap-linked.sh` uses it for rolled-back pgTAP runs (no Docker on the dev Mac)                                                                                                                            |

## P7.1 hosting additions (verified 2026-08-27)

| Component                                              | Version / value               | Notes                                                                                                 |
| ------------------------------------------------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| Oracle Cloud VM.Standard.A1.Flex                       | 2 OCPU / 12 GB, aarch64       | Always Free; Ubuntu 24.04 Minimal; `eu-marseille-1`; Docker 29.1.3, Compose v2.40.3 (owner-installed) |
| caddy (Docker image)                                   | `caddy:2`                     | automatic HTTPS (Let's Encrypt HTTP-01/TLS-ALPN-01), reverse proxy, JSON access log rotated           |
| python:3.12-slim / ghcr.io/astral-sh/uv                | multi-arch / 0.12.5           | both publish linux/arm64; the image builds natively on `ubuntu-24.04-arm`                             |
| docker/build-push-action · setup-buildx · login-action | v6 · v3 · v3                  | GHCR push with `GITHUB_TOKEN` (`packages: write`); `load: true` for the in-runner verification        |
| DuckDNS                                                | `hourwell-recsys.duckdns.org` | free; on the Public Suffix List (per-subdomain Let's Encrypt rate limits)                             |
| systemd timers (on the VM)                             | rollout 5 min · keep-busy 1 h | `services/recsys/deploy/systemd/`                                                                     |

## Mobile — P9 (verified 2026-08-29)

No new dependencies. The FR-40 heatmap uses native Views with an in-repo OKLCH module
(`src/ui/tokens/oklch.ts`, Ottosson 2020 constants — the CSS `oklch()` math); `react-native-skia`
stays a deferred install (ADR-0013 §5: no consumer yet). `@testing-library/react-native` 14
(`render` is async — `await render(...)`).

## Mobile — P10 (verified 2026-08-30)

| Package            | Version  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| expo-notifications | ~57.0.15 | Local notifications only (ADR-0011/0014): `scheduleNotificationAsync` with `SchedulableTriggerInputTypes.DATE`, categories with actions (FR-26 accept/adjust), Android channels, `useLastNotificationResponse` + listener. Config plugin in `app.json` (accent colour, default channel `reminders`). Installed via `npx expo install`; expo-doctor 21/21. Docs verified with ctx7 (`/websites/expo_dev_versions_sdk_notifications`) + the installed `.d.ts`. |
| expo-sharing       | ~57.0.16 | `isAvailableAsync` / `shareAsync(uri, { mimeType, UTI })` for the FR-42 export file; config plugin added by `expo install`.                                                                                                                                                                                                                                                                                                                                  |
| expo-file-system   | ~57.0.6  | (already installed) SDK 54+ `File` / `Paths.cache` API for the export file (`create`, `write`, `uri`, `exists`, `delete`).                                                                                                                                                                                                                                                                                                                                   |
| Maestro            | ≥ 2.8.0  | `e2e/p10-a11y-sweep.yaml`; driven by `scripts/device-pass.sh` on hardware (not pinned in the repo — a device-pass prerequisite).                                                                                                                                                                                                                                                                                                                             |

No new Python or Deno dependencies. `ANONYMOUS_RETENTION_DAYS = 30` added to the EF params mirror (pinned to `packages/shared` by `params_test.ts`).

## Training pipeline — P11 (verified 2026-08-31)

| Component                  | Version              | Notes                                                                                                                                                                                                                                |
| -------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| implicit                   | 0.7.3                | ALS (Hu et al. 2008) — the File 04 §3.4 stack pin; macOS arm64 wheel verified locally; **linux/arm64 wheel verified by the in-image ALS smoke in `deploy-training.yml`** (the ADR-0011 wheel check); needs `libgomp1` on slim images |
| scikit-learn               | 1.9.0                | k-means + silhouette (File 04 §3.4), logistic DM for DR (File 04 §2.3), interference-probe fit                                                                                                                                       |
| numpy / scipy              | 2.5.2 / 1.18.1       | same majors as `services/recsys` (path dependency keeps one resolution)                                                                                                                                                              |
| pyarrow                    | 25.0.1               | Parquet archive (ADR-0015 §17)                                                                                                                                                                                                       |
| psycopg[binary]            | 3.3.4                | same pin as the service                                                                                                                                                                                                              |
| hourwell-recsys (path dep) | `../services/recsys` | ONE scoring implementation for the MC backfill (bandit/blend/contexts/energy imported, `py.typed` added); uv `[tool.uv.sources]` path dependency, locked                                                                             |
| scipy-stubs (dev)          | ≥ 1.18.1.0           | mypy strict over scipy.sparse                                                                                                                                                                                                        |

## Release prep — P12 (verified 2026-08-31)

| Tool / fact             | Version / value                             | Notes                                                                                                                                                                                                                      |
| ----------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| eas-cli                 | 23.1.0                                      | `npm view eas-cli version` 2026-08-31; not a repo dependency — `eas.json` pins `cli.version >= 23.1.0`, `appVersionSource: remote`                                                                                         |
| Expo SDK 57 patch drift | expo 57.0.18 · RN 0.86.3 · jest-expo 57.0.5 | current `apps/mobile/package.json` as of 2026-08-31 (the P7 row recorded .17; `expo install --fix` drift since — expo-doctor 21/21 unchanged)                                                                              |
| Store listing limits    | Apple 30/30/100/4000/170 · Play 30/80/4000  | name/subtitle/keywords/description/promo (Apple), title/short/full (Play) — verified 2026-08-31, `docs/store/metadata.md`                                                                                                  |
| Store account economics | Play $25 one-time · Apple $99/yr            | decided 2026-08-31: buy neither (`docs/store/metadata.md` §7 decision block); Apple free tier (3 devices / 7-day builds) unusable as a study channel — moot since the field study is not executed (thesis-corrections #49) |

## Hardware pass — fixes (verified 2026-09-02)

| Tool / fact         | Version / value | Notes                                                                                                                                                                                                                                                                                                                     |
| ------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tzdata (PyPI wheel) | 2026.3          | `uv add tzdata` in `services/recsys` and `training` (2026-09-02); unconditional — the locks previously carried it only under win32/emscripten markers. Python's zoneinfo consults the wheel after TZPATH, so `Europe/Kiev` and every other backward link resolve inside `python:3.12-slim` images without `tzdata-legacy` |
