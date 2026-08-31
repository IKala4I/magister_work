# ADR-0016 — UC-10 erasure confirmation: e-mail vs in-app (reword the spec)

- **Date:** 2026-08-31
- **Status:** **proposed — owner decision** (claim-level: it changes what UC-10's text
  promises participants, and it is on the pre-enrollment gate list)
- **Spec anchors:** UC-10 (specs/02 L183: "deletion cascades … ≤ 30 days, **confirmed by
  email**"); FR-42; ADR-0014 §9 (P10 built the in-app confirmation); spec-conflicts L35
  (normative errata: in-app, no mail); thesis-corrections #43; privacy README **G8** (the
  open owner question this ADR answers); consent clause §3 ("no e-mail is sent").

## Context

P10 implemented erasure as a synchronous cascade with an **in-app confirmation carrying the
`deletion_audit` reference** (ADR-0014 §9), and the errata layer already reads UC-10's
"confirmed by email" as satisfied that way (L35). G8 kept the question open for the owner:
add a real e-mail before enrollment, or keep the reworded spec? This ADR is the requested
comparison — built-in mailer vs free EU providers, Art. 28 / Chapter V, and the anonymous-
account problem — with a recommendation.

## Facts (verified 2026-08-31)

1. **Supabase's built-in mailer cannot do this, categorically.** Per its own docs
   (auth-smtp): the default SMTP service "restricts message delivery to pre-authorized
   email addresses belonging to the project's team members", is rate-limited to **two
   messages per hour**, and carries no SLA. It exists for AUTH template mail (magic link,
   confirm, recovery) during development; there is no API for arbitrary transactional
   sending. Even "custom SMTP" in Supabase only re-routes the auth templates. An erasure
   confirmation to a participant therefore requires an **external transactional provider**
   called from an edge function — a new moving part, not a toggle.
2. **A large slice of accounts has no address at all.** FR-01's anonymous trial users (and
   the 30-day retention purges of ADR-0014 §10) have no e-mail. E-mail can never be the
   universal confirmation mechanism for this system; the in-app path has to exist anyway.
3. **The GDPR does not ask for e-mail.** Art. 12(3) requires informing the data subject
   about action taken "without undue delay". Erasure here completes synchronously and the
   confirmation (with an auditable reference) is displayed at the moment of the request —
   earlier than any mail would arrive. UC-10's "confirmed by email" was a UX assumption
   from before the anonymous-auth design, not a legal requirement.
4. **If e-mail were added anyway,** the workable free EU option is **Brevo** (French
   company, EU hosting, DPA; free tier ≈ 300 mails/day — far above study scale). SMTP2GO
   (NZ — an adequacy country — with optional EU sending servers, free 1 000/mo) is the
   runner-up. Either is a **new Art. 28 processor**: privacy README §2 row, DPIA entry,
   consent-clause change ("you receive an e-mail"), sub-processor review. Chapter V is
   clean with an EU-hosted provider (no transfer). One genuine wrinkle: the confirmation
   must be sent AFTER the cascade, so the address has to be held transiently
   post-erasure just to send to it — a purpose-limitation oddity that itself needs a DPIA
   sentence. All of that buys nothing the participant hasn't already seen on screen.

## Options

|                        | In-app only (reword the spec — status quo) | Add e-mail (Brevo)                              |
| ---------------------- | ------------------------------------------ | ----------------------------------------------- |
| Covers anonymous users | ✅ (the only mechanism that can)           | ❌ never                                        |
| Art. 12(3) timing      | immediate, at request time                 | minutes later, deliverability-dependent         |
| New Art. 28 processor  | none                                       | Brevo (+ DPIA, consent text, §2 row)            |
| Chapter V              | n/a                                        | clean if EU-hosted                              |
| Engineering            | done (P10, live-verified 25/25)            | new EF + secret + post-erasure address handling |
| Thesis text            | corrections #43 already written            | revert #43, amend consent + DPIA                |
| Cost                   | 0 €                                        | 0 € (free tier) but a standing dependency       |

## Recommendation

**Reword the spec — keep the in-app confirmation. That is the honest answer, not a
compromise.** The e-mail promise is impossible for anonymous users, adds a processor and a
post-erasure address-handling wrinkle for participants who already saw the confirmation,
and satisfies no requirement the in-app path doesn't. UC-10's text is already covered by
the errata (L35) and the draft-correction (#43); accepting this ADR closes **G8** as
"in-app, by decision" and ticks that pre-enrollment box. If the ethics board later asks
for e-mail regardless, the pre-wired fallback is Brevo (free, EU, DPA) + one edge function
— a one-day change, decided here so it never needs re-research.

## Consequences (once the owner accepts)

- privacy README G8 → closed ("in-app by decision, ADR-0016; Brevo pre-wired as fallback").
- Consent clause §3 unchanged ("no e-mail is sent" stays true).
- No DPIA processor row, no new secret, no code.
