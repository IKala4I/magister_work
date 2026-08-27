# Privacy & Data-Protection Notes (NFR-S2/S3; FR-42)

Working notes toward the DPIA (full document due P12; this file accumulates evidence per phase).

## Hosting regions (NFR-S2: EU region hosting)

| Service                                   | Region                                                                                         | Evidence / status                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase (Postgres, Auth, Edge Functions) | **eu-west-1 (Ireland)**                                                                        | `supabase projects list` 2026-08-24: project `magister_work`, region `eu-west-1`, linked ✔                                                                                                                                                                                                                                                                                                                                                                                          |
| PostHog (product analytics)               | **EU Cloud (eu.posthog.com) — REQUIRED**                                                       | Account not yet created (SDK lands P2/P3 → ACTION REQUIRED gate). Config constant must point at the EU ingestion host; the US default is a violation of decision 7 / NFR-S2. Documented here so the P3 wiring cannot silently default to US.                                                                                                                                                                                                                                        |
| Sentry (crash reporting)                  | EU org region required at signup                                                               | SDK scaffolded P2, **env-gated**: without `EXPO_PUBLIC_SENTRY_DSN` it initializes disabled (tested), so no data leaves the device until the EU org exists (end-of-P2 ACTION REQUIRED). Init pins `sendDefaultPii: false`, tracing off; stack traces + device context only, never task text.                                                                                                                                                                                         |
| Hugging Face Spaces (RecSys service)      | **US only on free/PRO plans — VERIFIED 2026-08-27**; EU runtime exists on Team/Enterprise only | Free Docker Spaces were withdrawn by the provider in July 2026 (spec-conflicts H4). The service was never deployed. The P1 hedge ("not guaranteed") is now a verified absence: the tier as specified would not have met NFR-S2. Replacement host and its region are the open owner decision in ADR-0009; this row is rewritten when it lands. Data-at-rest position unchanged: per-user model state lives only in Postgres (eu-west-1); the service processes requests transiently. |

## Data-minimization commitments already enforced in schema (P1)

- Cross-user training export: **categorical/behavioral columns only, never task text** (NFR-S3);
  CI test lands with the export query (P11).
- `calendar_events.title` is display-only; excluded from every export/training path (specs/07 §7).
- Erasure: `on delete cascade` from `auth.users` through every user-owned table (FR-42);
  `deletion_audit` keeps proof-of-erasure with a user hash, no FK — survives the cascade.
- `recommendations.features` snapshots are numeric arrays (no text) by contract (specs/07 §5).

## Retention (defaults, fixed by ADR in P10)

Raw `events`: 24 months → pseudonymized Parquet archive (File 06 §5). Unconverted anonymous
accounts: purged after 30 days. Account deletion completes ≤30 days with email confirmation
(UC-10).
