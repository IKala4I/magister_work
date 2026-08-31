# Hourwell Privacy Policy (draft — P12)

> **Draft for owner review.** This is the user-facing policy both app stores require a URL
> for. It restates, in plain language, what `docs/privacy/dpia.md` establishes formally.
> Placeholders in ⟨angle brackets⟩ are the owner's to fill (same contact block as
> `consent-clause.md` §5). Effective date is set at publication.

_Last updated: ⟨date at publication⟩_

## Who we are

Hourwell is operated by ⟨name⟩, ⟨university / address⟩, Ukraine ("we"). Contact:
⟨e-mail⟩. Hourwell is a research project: its recommendation engine is the subject of a
Master's thesis. **Using the app never enrolls you in the research study** — study
participation is separate, opt-in, and covered by its own consent form.

## What we store

- **Account**: your e-mail address (if you sign in by magic link or Google), or nothing —
  Hourwell works with an anonymous account.
- **Your content**: the tasks you enter (titles, categories, durations, deadlines,
  priorities) and, only if you connect Google Calendar, the times and titles of your
  calendar events.
- **Activity**: the plans Hourwell proposes and what you do with them — start, pause,
  finish, skip, move, ratings — plus the learned parameters derived from them (for example,
  which hours tend to work for you).
- **Technical**: pseudonymous product analytics (PostHog) and crash reports (Sentry) —
  never the text of your tasks or calendar. You can switch analytics off in Settings →
  Privacy.

We do **not** collect your location, contacts, photos, keystrokes, or anything from other
apps. There are no ads and no advertising or tracking SDKs.

## Where and how it is processed

Your data is stored and processed in the European Union: the database and authentication
run in Ireland (Supabase, AWS eu-west-1); planning and learning run on a server in France
(Oracle Cloud, eu-marseille-1). Traffic is encrypted in transit (TLS). Learning that
combines data across users only ever uses broad task categories and behaviour counts — **never the text of your
tasks or calendar events**. Calendar event titles are shown only to you, on your device.

Our processors (under GDPR Art. 28 agreements): Supabase (database/auth), Oracle Cloud
(server hosting), PostHog EU (analytics), Sentry EU (crash reporting). Google is your own
provider when you choose to sign in with Google or connect Google Calendar; you can
disconnect the calendar at any time in Settings, which also revokes Hourwell's access at
Google.

## Legal bases

Operating the app for you: performance of the service you request (GDPR Art. 6(1)(b)).
Optional features (Google Calendar): your consent, withdrawable at any time. Analytics and
crash reporting: our legitimate interest in keeping the service reliable — you can switch
analytics off at any time in Settings → Privacy.
Research study processing: the separate study consent form.

## Your rights

- **Export** everything Hourwell holds about you as a JSON file: Settings → My data →
  Export.
- **Delete** your account and all its data: Settings → My data → Delete account. Deletion
  is immediate (legally, within 30 days), removes your records from the database, and shows
  a confirmation with a reference number. No e-mail is needed — which also means anonymous
  accounts can always delete themselves.
- Rectification is ordinary editing; for anything else, contact ⟨e-mail⟩. You can lodge a
  complaint with your national data-protection authority.

## Retention

An anonymous account that is not used for 30 days is deleted automatically. If you take
part in the research study, raw behavioural events are kept for 24 months after the study
ends and are then reduced to a pseudonymised research archive held on EU storage with
restricted access; only a synthetic dataset is ever published.

## Children

Hourwell is not directed at children under 16 and the study enrolls adults (18+) only.

## Changes

We will update this policy here and note material changes in the app's release notes.
