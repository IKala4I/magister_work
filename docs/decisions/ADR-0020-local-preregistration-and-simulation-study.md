# ADR-0020 — No OSF registration; local pre-registration in git; the simulation evaluation is the study

- **Date:** 2026-09-05
- **Status:** accepted (owner decision, 2026-09-05 — a thesis-claim decision, CLAUDE.md stop
  condition 3; supersedes the 2026-09-01 decision "register the unexecuted protocol on OSF
  after the hardware pass", revisit.md, thesis-corrections #49)
- **Phase:** post-P12
- **Spec anchors:** File 06 §1.5 (hypotheses), §1.6 (analysis plan), §2.3 (pre-registered
  simulation-based power), §4 ("researcher degrees of freedom"), §5 (artifact statement);
  File 04 §2 (OPE, RQ4); spec-conflicts "Post-P12 status overlay (2026-09-01)"; ADR-0011 §3
  (release); ADR-0015 §8/§16 (OPE harness, synthetic mode); thesis-corrections #8, #21, #36, #49.

## Context

File 06 was written as a full research project: hypotheses, exclusions and the analysis
script were to be frozen as an OSF pre-registration before the first participant enrolled
(§4, §5). Two facts changed the picture. First, the field study is out of scope of the
master's project (owner, 2026-09-01: a resource boundary — developer accounts, a recruitment
budget, eight weeks of volunteer retention). Second, no requirement of the thesis calls for an
external pre-registration: the freeze existed to protect a field study's results from
hypothesis-fitting, and the only evaluation that will be run is the simulation evaluation.
The 2026-09-01 follow-up ("register the unexecuted protocol on OSF anyway, after the hardware
pass") therefore bought nothing the thesis needs, on a platform the owner has no use for.

What the freeze protected still matters. The simulation evaluation is itself a study — it
has hypotheses with directions, a method and results — and the same protection against
fitting hypotheses to results applies to it.

## Decision

1. **No OSF registration.** The OSF freeze is removed from every pending-step list (PLAN,
   HANDOFF, revisit, the corrections worklist and rollup, the enrollment checklist, privacy
   G5). The registration material that was assembled for it (the H1 / M9 / #34–36 / G5
   wording in `docs/thesis/corrections-rollup.md` and the items it references) stays in the
   repository as an artifact of the designed protocol; it is not submitted anywhere. The
   thesis text keeps "pre-registration-ready" for the field protocol — never
   "pre-registered".
2. **The discipline moves into git.** Before the simulation evaluation runs, its hypotheses,
   expected directions, parameters and analysis plan are committed as their own file,
   `docs/study/preregistration.md`. The commit that adds that file predates every commit
   that adds study code and results; the git history (commit hashes and author dates, both
   in the PR that merges them) is the timestamp evidence. The evaluation is then run once at
   the registered configuration, and the report compares each pre-registered prediction with
   its outcome — including everything that came out differently — in
   `docs/study/simulation-results.md`. Changing a hypothesis after the results exist is
   visible in the history and is reported as a deviation, exactly as File 06 §4 prescribes.
3. **Wording rule for the thesis and every document that describes the evaluation.** The
   field study is **out of scope**; the evaluation **was performed in simulation** and is a
   study in its own right (hypotheses, method, results). Nothing may read as "no study was
   conducted", "the study is not executed" or "no evaluation exists". The standing phrase is
   _"field study out of scope; evaluation performed in simulation"_. What the simulation
   cannot establish — behavioural claims about people, H1–H4 as statements about humans —
   is still stated explicitly (thesis-corrections #49's boundary bullet is unchanged).
4. **Release artefacts (ADR-0011 §3, G5) are re-read under this decision.** The public
   artefact is the synthetic dataset + replay harness, published in this repository (no OSF
   project). The restricted-access deposit clause for a real event log stays in the design
   as a conditional: it applies only if a field study is ever run, and the platform is chosen
   then. Nothing exists to deposit today.

## Consequences

- `docs/study/preregistration.md` (commit B of the implementing PR) is the frozen
  specification of the simulation study; `training/src/hourwell_training/simstudy/` (commit
  C) implements exactly its analysis plan; `docs/study/simulation-results.md` and
  `docs/study/results/` (commit D) carry the outcomes and the prediction-vs-outcome
  comparison. Thesis text: corrections #54 (this decision + the wording rule) and #55 (the
  simulation study as §5 content).
- Documents that said "at/before the OSF freeze" now say "before any field study" (design
  conditions that only bite if the field study is ever run) or "in the pre-registration
  file" (conditions the simulation study inherits). The historical entries (CHANGELOG,
  dated decisions) are left as written; ADR-0008, ADR-0010, ADR-0011 and ADR-0015 carry a
  one-line amendment pointer.
- The enrollment checklist's prerequisite "OSF pre-registration frozen" becomes "the
  pre-registration file for the field protocol committed and the analysis script frozen" —
  the protocol keeps its own freeze discipline if it is ever run, in git.
- Not changed: the DPIA's signed status note (a dated statement of the owner at signing);
  the store decision; the device-checklist scope.
