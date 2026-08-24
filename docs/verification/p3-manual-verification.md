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

## Results — 2026-08-24

_(recorded after the run below)_
