# Pinned Versions

Every entry lists the version in use and the date it was verified against real docs/registries.
Spec File 03 mandates: "pin exact versions at implementation time". Deviations from the spec's
indicative versions are footnoted and, where architectural, recorded as ADRs.

## Toolchain (verified 2026-08-24)

| Tool                            | Version | Notes                                                                                     |
| ------------------------------- | ------- | ----------------------------------------------------------------------------------------- |
| Node                            | 24.13.1 | Active LTS. Spec-era PLAN said 22 LTS → ADR-0001                                          |
| pnpm                            | 10.33.2 | pinned via `packageManager`; expo-doctor 21/21 → ADR-0002                                 |
| TypeScript                      | 5.9.3   | strict everywhere; 6.0 reverted → ADR-0004 (openapi-typescript peer `^5.x`)               |
| ESLint                          | 10.9.0  | flat config (File 03 §6 said "ESLint 9"; 10 is the current line, same flat-config system) |
| typescript-eslint               | 8.67.0  |                                                                                           |
| eslint-plugin-react-hooks       | 7.1.1   | rules registered manually (version-stable form)                                           |
| eslint-config-prettier          | 10.1.8  |                                                                                           |
| @eslint/js                      | 10.0.1  |                                                                                           |
| Prettier                        | 3.9.6   |                                                                                           |
| uv                              | 0.12.5  | Homebrew install                                                                          |
| Python (service/training venvs) | 3.12.14 | spec-pinned line (File 03 §2.2); system 3.14 unused                                       |
| ruff                            | 0.16.4  |                                                                                           |
| mypy                            | 2.3.1   |                                                                                           |
| pytest                          | 9.1.1   |                                                                                           |

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

Drizzle ORM + expo-sqlite (P2) · MMKV 3.x (P2) · Zustand 5.x (P2) · Reanimated 4 / Gesture
Handler 2 (P2) · FlashList v2 (P2) · react-native-skia (P2/P9) · chrono-node 2.x (P3) ·
supabase-js v2 + supabase CLI (P1/P4) · expo-notifications (P10) · FastAPI 0.11x + Pydantic v2
(P5) · OR-Tools ≥9.x (P5) · NumPy (P5) · River (P7) · implicit 0.7.x (P11) · MABWiser (P5, CI
oracle) · sentence-transformers ≥3 (roadmap) · PostHog / Sentry SDKs (P2/P3).
