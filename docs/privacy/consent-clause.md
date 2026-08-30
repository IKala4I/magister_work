# Consent-form clauses (draft, P8) — for the study information sheet

> Status: **draft for the owner's review** (ADR-0011 Decision 2 and Consequences "P8: draft the
> consent clause with the FR-42 texts"). English master; the Ukrainian version is produced
> from this text once the owner has approved it. Wording that names a legal basis is marked
> `[legal]`; wording that names a system behaviour is marked `[system]` and is tested or
> measured in the phase named.

## 1. What Hourwell stores about you

`[system]` Hourwell keeps the tasks you enter (their titles and the categories, durations,
deadlines and priorities you give them), the plans it proposes, and what you do with them —
when you start, pause, finish, skip or move a planned block, and the optional one-tap rating
after a focus session. From these it learns which hours of the day work for you. It never
records screen contents, keystrokes, location or contacts. (P3–P7; specs/07 §4.1.)

`[system]` If you connect a Google Calendar, Hourwell reads the times and titles of your
calendar events so plans avoid your meetings. Titles are shown only to you on your device; they
are never used for learning, never shared and never exported. Hourwell writes nothing to your
calendar unless you switch on "Write my blocks to Google Calendar", which you can switch off
at any time; disconnecting removes the imported events from the app and revokes Hourwell's
access at Google. (P8; ADR-0012 §10.)

## 2. Where your data is processed

`[legal]` Your data is stored and processed in the European Union: the database and
authentication service run in Ireland (Supabase, AWS eu-west-1) and the planning and learning
service runs on a server in France (Oracle Cloud, eu-marseille-1). The study's analysis and
model training also run on that server. The researcher is established in Ukraine and receives
only aggregated results; individual records are not transferred to Ukraine as part of the
study. (ADR-0011 option A.)

`[legal]` In exceptional cases — a support request from you, a data-deletion request, or a
software fault that can only be diagnosed on your account — the researcher may need to look at
individual records from a computer outside the EU. Because Ukraine does not hold an EU
adequacy decision, that access is a transfer of your personal data to a third country without
the safeguards of Articles 45–46 GDPR. **By ticking this box you explicitly consent to such
access, limited to these purposes, under Article 49(1)(a) GDPR.** You can withdraw this
consent at any time by contacting the researcher; withdrawal does not affect the study
otherwise. (privacy README §7 — the operator access rule; every such access is logged.)

`[legal]` Product analytics (PostHog EU, Germany) and error reports (Sentry, Germany) receive
pseudonymous technical events only — never the text of your tasks or calendar.

## 3. Your rights and how to exercise them (FR-42)

`[system]` **Export.** In Settings → My data you can export everything Hourwell holds about you
as a JSON file: your tasks, plans, events, calendar times (never the titles of your meetings),
the learned parameters and the study assignments — and share or save it as you like. (P10:
`export-data` edge function, live.)

`[system]` **Deletion.** In Settings → My data you can delete your account and all its data.
Deletion removes your records from the database — in practice within seconds, and in any case
within 30 days — and revokes any calendar access; the app shows a confirmation with a reference
number you can keep as proof (no e-mail is sent). Aggregated study results computed before your
deletion cannot be un-computed, but they do not identify you. An anonymous trial account that is
not used for 30 days is deleted automatically. (P10 — UC-10; ADR-0014.)

`[system]` **Withdrawal from the study** is deletion plus a note to the researcher; no reason
is needed.

`[legal]` Data retention: raw behavioural events are kept for 24 months after the study, then
reduced to a pseudonymised research archive that is deposited with restricted access on EU
storage (OSF, Frankfurt) under a data-use agreement; only a synthetic dataset is published.
(ADR-0011 Decision 3; thesis-corrections #36.)

## 4. Residence question (enrollment checklist, study mode — P11)

`[legal]` "Do you currently live in the European Union or the European Economic Area?" —
yes / no. Asked once at enrollment, stored as a yes/no flag (`profiles.eu_eea_resident`),
never inferred from your network address or language. A "yes" triggers the researcher's
obligation to designate a representative in the Union before your participation starts
(Art. 27 GDPR; ADR-0011 Decision 1).

## 5. Contact

`[legal]` Controller and researcher: <name, university, e-mail — owner to fill in>. Data
protection questions: <e-mail>. Supervisory authority: <the participant's national DPA>.

---

_Owner decisions still open on this text: the exact contact block; whether to name the
consent-form version number in the app's enrollment screen; the Ukrainian translation review._
