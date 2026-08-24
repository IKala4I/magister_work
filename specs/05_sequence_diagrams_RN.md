# 05 — Sequence Diagrams (React Native Revision)

> **Project:** Kairos — Personal Time Optimization via Recommendation Systems
> **Document:** Mermaid.js sequence diagrams for the two highest-complexity interactions
> **Status:** v1.1-RN — supersedes `05_sequence_diagrams.md` v1.0. **Change scope: participant naming only** (React Native/Expo client, Expo SQLite + Drizzle outbox replace Flutter/Drift). The logic, sync protocol, domain rules, and reward semantics are byte-for-byte identical to v1.0.

---

## 1. UC-04 — The Forgiveness Loop (missed block → model update → demoted score)

**Normative design decisions (unchanged):** lapse detection is **lazy** — computed on next app foreground and, authoritatively, by the end-of-day attribution job; no correctness depends on background execution (this constraint was OS-driven, not framework-driven — `expo-task-manager` background scheduling is exactly as unreliable on iOS as Dart isolates were, so the design carries over untouched). Feedback is **two-phase**: instant signals update the bandit immediately via `/feedback`; lapses are finalized once per local day; late corrections trigger a per-user state **rebuild** from stored reward tuples, never a rank-one downdate.

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant App as RN App (Expo)
    participant DB as Expo SQLite (Drizzle outbox)
    participant SB as Supabase Postgres
    participant EF as Edge Fn attribute-rewards
    participant API as FastAPI RecSys
    participant MS as user_model_state

    Note over U,DB: Block "Report draft" (rec 7f3a, Tue 14:00-15:30, deep_work) passes with no focus session
    U->>App: opens app at 17:30 (foreground event)
    App->>DB: lazy lapse scan (now > slot_end AND no completion event)
    DB-->>App: rec 7f3a -> local status lapsed (useLiveQuery re-renders)
    App->>DB: enqueue op 118 event type=skip rec=7f3a ctx=snapshot
    App-->>U: block restyled neutral, task returns to Inbox (no guilt UI)
    App->>SB: sync push queued ops via supabase-js (idempotent op_ids)
    SB-->>App: ack + server timestamps

    Note over EF,SB: 23:55 local (pg_cron) - authoritative end-of-day attribution
    EF->>SB: SELECT recommendations WHERE status IN (shown, accepted) AND day = today
    EF->>SB: INSERT feedback_rewards (rec 7f3a, r=0.0, reason=lapsed)
    Note over EF: external-conflict displacements emit NO reward (rule 3.4)
    EF->>API: POST /feedback batch [(rec_id, features x, category, r)]
    API->>MS: load linucb state for deep_work and beta_cells
    API->>API: Sherman-Morrison rank-1 update of (A, b) with (x, r=0)
    API->>API: beta cell (weekday, AF, deep_work) failures += 1 (decayed counts, half-life 28d)
    API->>API: River SGD step on blend weights w
    API->>MS: UPSERT state, idempotency key = rec_id (safe re-runs)
    API-->>EF: 200 updated=1
    EF->>SB: mark rec 7f3a attributed

    Note over U,MS: next morning - the demotion becomes visible
    App->>SB: plan request via Edge Fn plan-request (JWT)
    SB->>API: POST /plan with user context
    API->>MS: load updated state
    API->>API: score contexts - q(deep_work, AF) fell 0.61 -> 0.44
    API->>API: build weights w and CP-SAT solve (File 4 sec 1)
    API-->>App: plan - Report draft now at 09:30 + rationale
    App-->>U: "Afternoons have not worked for this one - trying your morning peak"

    opt UC-04 A1 - user marks "actually did it" at 21:00 next day
        App->>SB: correction event for rec 7f3a
        SB->>API: POST /feedback correction rec=7f3a r=1.0 replaces r=0.0
        API->>MS: REBUILD (A, b) and beta cell from stored reward tuples (no downdate)
    end
```

## 2. Offline-First Sync & Semantic Conflict Resolution

**Protocol summary (unchanged).** The Drizzle-managed outbox in Expo SQLite keeps an ordered log of operations, each with a client-monotonic `op_id` and the `base_version` of any mutated row; the sync cursor lives in MMKV. Sync is **push-then-pull against a server cursor**. Three conflict classes: (1) `events` are append-only — never conflict; (2) plain state rows use optimistic version checks with last-write-wins on user-owned settings; (3) **semantic** conflicts (plan vs. reality) are resolved by domain rules in the `sync-resolve` Edge Function — governing rule: **facts beat plans**. Rewards whose context became ambiguous are flagged and **excluded** from bandit updates (File 3 §3.4), never guessed.

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant App as RN App (Expo)
    participant DB as Expo SQLite (Drizzle outbox)
    participant GCal as Google Calendar
    participant WH as Edge Fn gcal-webhook
    participant SB as Supabase Postgres
    participant SR as Edge Fn sync-resolve

    par device offline (13:55 - 16:10)
        U->>App: starts focus on "Slides" (rec 9c1d, 14:00-15:00)
        App->>DB: op 41 focus_start rec=9c1d
        U->>App: finishes at 14:55, taps done + energy rating
        App->>DB: op 42 focus_end + completed, base_version(task)=7
    and server side, same window
        GCal->>WH: push channel notification
        WH->>GCal: incremental sync fetch
        GCal-->>WH: new meeting 14:00-15:00 Tue
        WH->>SB: UPSERT calendar_events (unique source+external_id)
        WH->>SB: rec 9c1d -> status displaced_pending (external conflict)
    end

    Note over App,SR: 16:10 connectivity restored - push phase
    App->>SR: POST /sync push [op 41, op 42] + MMKV cursor
    SR->>SB: append events (class 1 - append-only, no conflict)
    SR->>SB: read rec 9c1d -> displaced_pending  (semantic conflict detected)
    Note over SR: DOMAIN RULE - facts beat plans: completion outranks displacement
    SR->>SB: rec 9c1d -> status completed, flag concurrent_external_conflict
    SR->>SB: task "Slides" status=done (version check passes 7 -> 8)
    Note over SR: reward attribution: flagged ambiguous -> EXCLUDED from bandit update
    SR-->>App: push ack + pull payload (changes since cursor: new meeting, rec statuses)
    App->>DB: merge pull payload in one transaction, advance cursor
    App-->>U: toast "Meeting imported - your completed Slides session is kept"

    alt counterfactual branch - task was NOT completed offline
        SR->>SB: rec 9c1d -> status displaced, task back to Inbox
        SR->>SB: no reward emitted (external displacement, rule 3.4)
        Note over SR: replacement suggested at next planning event (UC-09)
    end

    opt version check fails (row edited on both sides)
        SR-->>App: 409 + server row
        App->>App: field-level merge, user-owned fields LWW, replay op
    end
```

## 3. Diagram-to-Spec Traceability

| Diagram element | Spec anchor |
|---|---|
| Lazy lapse scan on foreground (no background timers) | UC-04 (File 2); OS constraint holds identically for Expo — normative |
| End-of-day attribution job as authority | File 3 §3.4 attribution window; NFR-O1 |
| Two-phase feedback + rebuild-on-correction | File 3 §3.5 as amended by Phase 4 audit |
| Sherman–Morrison update, decayed Beta counts | File 3 §3.2 Stage 2/4; File 4 §1.4 |
| Facts-beat-plans rule; ambiguous-reward exclusion | File 3 §3.4; UC-09 (File 2) |
| Push-then-pull, op_id idempotency, version checks | NFR-R1 (File 2); outbox = Drizzle tables, cursor = MMKV (File 3 v1.1-RN §2.1) |
| Reactive UI updates after local writes | Drizzle `useLiveQuery` (replaces Drift streams 1:1) |
| displaced_pending / concurrent flag | Schema migration M-02 (unchanged) |
