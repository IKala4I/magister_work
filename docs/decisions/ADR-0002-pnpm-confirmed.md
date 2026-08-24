# ADR-0002 — pnpm workspaces confirmed for the Expo monorepo

- **Date:** 2026-08-24
- **Status:** accepted
- **Phase:** P0
- **Spec anchors:** PLAN.md §5 decision 3; specs/03 §2.1 (client stack)

## Context

Decision 3 approved pnpm + a P0 `expo-doctor` compatibility check, with silent fallback to npm
workspaces if it objected.

## Decision

Keep pnpm 10 workspaces with `node-linker=hoisted` in `.npmrc` — the setting `create-expo-app`
itself writes for pnpm projects (Expo SDK 54+ monorepo docs, verified via Context7 2026-08-24).
Metro ≥ SDK 52 auto-configures monorepo watch folders; no manual metro.config needed yet.

## Consequences

`expo-doctor` passed 21/21 on the scaffolded app — no fallback needed. One consequence of the
hoisted linker: single flat `node_modules`, so package version families must be kept aligned
(see ADR-0003, which this bit us with once already).
