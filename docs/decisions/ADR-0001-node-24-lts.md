# ADR-0001 — Pin Node 24 LTS instead of the approved "Node 22 LTS"

- **Date:** 2026-08-24
- **Status:** accepted (flagged for owner veto in the P0 report)
- **Phase:** P0
- **Spec anchors:** PLAN.md §5 decision 3

## Context

The approved decision named "Node 22 LTS". At execution time: Node 24 has been Active LTS since
2025-10; Node 22 is in maintenance; the development machine already runs 24.13.1; Expo SDK 57
supports it. Pinning 22 would force a second local Node install and pin the project to a
maintenance-only line for its whole life.

## Decision

Pin Node **24.13.1** via `.nvmrc` + `engines`; CI reads `.nvmrc`, so local and CI always match.

## Consequences

Serves the intent of the decision (a pinned, current LTS) at the cost of deviating from its
letter. Cheap to revert: change `.nvmrc` and reinstall. Owner may veto at the P0 gate.
