# ADR-0003 — Jest 29.7, not the spec's "Jest 30", while on jest-expo 57

- **Date:** 2026-08-24
- **Status:** accepted (revisit when jest-expo supports jest 30)
- **Phase:** P0
- **Spec anchors:** specs/03 §6 ("Jest 30 + React Native Testing Library")

## Context

specs/03 §6 names Jest 30, with the file-wide caveat "pin exact versions at implementation
time". jest-expo 57.0.4's internals (jest-snapshot, jest-environment-jsdom) are pinned to the
`^29.x` line. Installing jest 30 alongside produced a real runtime failure under the hoisted
linker: `this._moduleMocker.clearMocksOnScope is not a function` (jest-30 runtime calling into a
jest-29 ModuleMocker).

## Decision

Pin jest **29.7.0** + `@types/jest` 29.5.x to match jest-expo's generation.

## Consequences

Test suites run correctly. Track jest-expo releases; when a jest-30-compatible jest-expo ships,
upgrade in a dedicated `chore(mobile)` commit and update versions.md.
