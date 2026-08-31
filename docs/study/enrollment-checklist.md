# Enrollment checklist — one participant (File 06 §1.3; ADR-0011; ADR-0015 §12)

> Operator-run, one pass per participant, in order. Nothing here shows participant rows
> (privacy README §7): identification is by e-mail → `diagnose_user`, enrollment is one RPC.
> Prerequisites (once per wave): ethics-board approval on file; OSF pre-registration frozen;
> the sequence list from `training/scripts/randomize_sequences.py --n <recruit> --seed <wave>`
> printed and stored with the study records (the seed is the audit trail).

## 1. Consent + eligibility (before touching the system)

- [ ] Signed consent form (incl. the Art. 49(1)(a) clause and the FR-42 erasure text —
      `docs/privacy/consent-clause.md`); voucher terms stated (€20 on completion, paid
      regardless of outcomes).
- [ ] ≥ 18 y; own smartphone (iOS 16+ / Android 12+); self-reports ≥ 5 schedulable tasks/week.
- [ ] NOT currently using an auto-scheduling tool (Motion / Reclaim / SkedPal — contamination).
- [ ] NOT a shift worker with employer-dictated hours (no scheduling latitude).
- [ ] **"Are you resident in the EU/EEA?" — record the answer** (G6, Art. 27 trigger).
      ⚠️ If YES and no Union representative is designated yet: **STOP — do not enroll** until
      the owner designates one (privacy README G6; this cannot be fixed retroactively).

## 2. Install + run-in (week 0, not analyzed)

- [ ] Participant installs the app, completes onboarding (rMEQ or skip) with their own account.
- [ ] Confirm the profile exists and onboarding completed — from the VM or via the RPC:
      `select public.diagnose_user('<their-email>');` → `profile.onboarding_completed = true`.
      (Counts only; never open their rows — privacy README §7.)
- [ ] Run-in: they use the app normally for 7 days. Schedule the phase-1 start date =
      run-in day 8.

## 3. Enroll (one RPC, service key — from the VM or the SQL editor as service role)

- [ ] Take the NEXT free row of the wave's sequence list (in enrollment order) — never skip,
      never re-draw.
- [ ] Enroll (uuid via `select id from auth.users where email = '<their-email>'` — one
      column, one row):

  ```sql
  select public.enroll_participant('<user-uuid>', '<ABAB|BABA>', <eu_eea true|false>,
                                   date '<phase-1 start>');
  ```

- [ ] Verify: `diagnose_user` now shows `study.enrolled = true`, `first_phase`/`last_phase`
      spanning 8 weeks, and `profile.research_cohort = true`.
- [ ] Record in the study log: participant code (their hash from `diagnose_user`), sequence
      row number, phase-1 date, EU/EEA answer. Never store the e-mail in the log.

## 4. During the study

- [ ] The arm switches are automatic (`plan-request` reads `study_assignments` by date);
      no operator action at phase boundaries.
- [ ] Withdrawal at any time: run the FR-42 erasure (operator mode of `delete-account`,
      privacy README §7 item 1) and mark the sequence row as spent (it is NOT reused).

## 5. Wave close

- [ ] After the last phase 4 ends + the 7-day correction window: freeze the wave's rows in
      the study log; the analysis runs on the VM (`hourwell-train` + the frozen File 06
      script); the archive is `hourwell-train --archive` (ADR-0015 §17).
