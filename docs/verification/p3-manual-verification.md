# P3 manual verification — tasks (FR-10, FR-11, UC-02, NFR-R1 local half)

Build: `SENTRY_DISABLE_AUTO_UPLOAD=true npx expo run:ios --configuration Release` in
`apps/mobile`. Automated walk: `maestro test apps/mobile/e2e/p3-tasks-flow.yaml`.

## Quick add (FR-11, UC-02)

- [ ] Inbox shows the quick-add bar; typing "report draft 2h by fri" renders a preview
      with the cleaned title, a "120 min" chip, and a "by Fri …" chip before confirming.
- [ ] Add: the row appears instantly (optimistic — it IS the local truth, no network).
- [ ] Typing only structure ("2h") disables Add and shows the title hint.
- [ ] A bare weekday equal to today ("gym mon" on Monday) shows Today / Next week chips;
      picking one sets the deadline (UC-02 A1 — ambiguity is asked, never guessed).

## Task sheet (FR-10 — every field)

- [ ] Header "+" opens the New-task sheet; every FR-10 field present: title, category,
      estimated minutes (presets + free input), priority 1–3, splittable, deadline,
      earliest start. Add is disabled until title + valid minutes.
- [ ] Tapping a row opens Edit prefilled; saving updates the row in place.

## Delete + undo (File 02 §3)

- [ ] Row delete removes it from the list and shows the undo bar; Undo restores.
- [ ] Without Undo the bar disappears after ~6 s; the task stays deleted.

## Offline-first evidence (NFR-R1 local half — sync-queue inspection)

No network path exists in P3 (push arrives in P8), so every write is local by
construction; the queue is the evidence. After the Maestro flow, dump the app's DB:

```bash
APP=$(xcrun simctl get_app_container booted com.hourwell.app data)
sqlite3 "$APP/Documents/SQLite/hourwell.db" \
  'select seq, op_type, base_version from op_outbox order by seq;
   select type, local_day from events;'
```

Expected: `task_upsert(base null)` + `event_append` from create, `task_upsert(base 1)`
from edit, `task_delete(base 2)`, `task_upsert(base 3)` from undo, `task_delete(base 4)`;
`events` holds exactly one `task_created`. Airplane-mode spot check on a physical device
repeats in P8 when a server actually exists to be offline from.

## Results — 2026-08-24 (Release build, iPhone 17 Pro simulator, clean install)

`apps/mobile/e2e/p3-tasks-flow.yaml`: **22/22 steps green.** Quick-add parsed
"report draft 2h by fri" into a 120-min chip + a "by Fri, Aug 28" chip, the row appeared
**live** (asserted together with `Inbox is clear` disappearing, so the list is genuinely
reactive and not re-mounted), the sheet edit to Deep work round-tripped, delete → Undo
restored, and the second delete let the 6 s window expire on its own.

Sync-queue dump after the walk (the NFR-R1 local-half evidence):

| seq | op_type      | base_version | state  |
| --- | ------------ | ------------ | ------ |
| 1   | task_upsert  | –            | unsent |
| 2   | event_append | –            | unsent |
| 3   | task_upsert  | 1            | unsent |
| 4   | task_delete  | 2            | unsent |
| 5   | task_upsert  | 3            | unsent |
| 6   | task_delete  | 4            | unsent |

6 ops / 6 distinct `op_id`s; `events` holds exactly one `task_created` on local day
2026-08-24; the task ends tombstoned at version 5. The `base_version` chain is unbroken
(1→2→3→4), which is what `sync-resolve` will replay against in P8.

### Bugs this walk caught (all fixed here, all now covered by tests)

1. **First tap after quick-add was swallowed.** `FlashList` is a ScrollView and defaults to
   `keyboardShouldPersistTaps="never"`, so with the quick-add keyboard up the first tap on a
   row only dismissed the keyboard — a user had to tap a freshly added task twice to open it.
2. **The undo bar rendered behind the keyboard.** Deleting while the keyboard was up left a
   destructive action with no reachable undo, violating the File 02 §3 6-second rule.
   `handleDelete` now dismisses the keyboard first.
3. **Side effect inside a `setState` updater.** `handleUndo` called `restoreTaskAction`
   from within the updater; updaters must be pure and React may re-run them, which would
   replay the write. It now reads state, then writes.

### Harness notes (not product issues)

- A task row is **one** accessibility element with a composed label
  (`"<title>, <category>, <minutes> minutes"`); its inner `Text` nodes are not separately
  exposed, so assertions must match the composed label. An earlier assertion on the bare
  title failed for this reason alone and briefly looked like a stale-list bug — worth
  remembering before diagnosing product behaviour from a red Maestro step.
- `tapOn: 'Undo'` cannot win against the 6 s window: Maestro spends most of it dumping the
  hierarchy to locate the element. The flow uses a **point tap** for Undo instead.
