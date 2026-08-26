/**
 * rMEQ — reduced Morningness–Eveningness Questionnaire (Adan & Almirall, 1991): MEQ items
 * 1, 7, 10, 18, 19 of Horne & Östberg (1976), summed score R ∈ [4, 25] (File 04 §3.1).
 * Wording is lightly paraphrased for mobile (i18n keys `onboarding.rmeq.*`; ADR-0005), but
 * option structure and scoring are the published instrument's — the score must stay
 * comparable to the validated cutoffs, which spec-conflicts L7 verified as standard.
 *
 * Class mapping (File 04 §3.1, enforced server-side by profiles_chronotype_matches_score):
 * 22–25 DM · 18–21 MM · 12–17 INT · 8–11 ME · 4–7 DE.
 *
 * Skip semantics (ADR-0005): FR-02 makes every answer skippable, but rMEQ has no published
 * prorating rule for missing items (the parent MEQ requires all items), so a survey with
 * ANY unanswered item counts as skipped: no score is stored, class is INT, and prior
 * strength is halved server-side (File 04 §3.1/§3.3) — which IS the wider-exploration
 * mechanism of UC-01 A1 (spec-conflicts L8; ε never changes per user).
 *
 * This module computes profile fields only. Priors themselves are instantiated server-side
 * (invariant 1: the client never touches model state).
 */

export const CHRONOTYPE_CLASSES = ['DM', 'MM', 'INT', 'ME', 'DE'] as const;
export type ChronotypeClass = (typeof CHRONOTYPE_CLASSES)[number];

export const RMEQ_SCORE_MIN = 4;
export const RMEQ_SCORE_MAX = 25;

/** Lower score bound per class (File 04 §3.1); DE is everything below ME's bound. */
export const RMEQ_CLASS_LOWER_BOUNDS = { DM: 22, MM: 18, INT: 12, ME: 8 } as const;

/** Class stored for a skipped survey (File 04 §3.1 "Skipped survey ⇒ c0 = INT"). */
export const SKIPPED_SURVEY_CLASS = 'INT' as const satisfies ChronotypeClass;

/**
 * The five items with the published per-option scores, in instrument order. Option i18n
 * keys are `onboarding.rmeq.<id>.o<n>`; question keys are `onboarding.rmeq.<id>.q`.
 * Score sets differ per item (5..1 / 1..4 / 5..1 / 5..1 / 6,4,2,0) — that asymmetry is
 * the instrument, not a bug; min sum 4, max sum 25.
 */
export const RMEQ_ITEMS = [
  { id: 'wakeTime', optionScores: [5, 4, 3, 2, 1] }, // MEQ 1: free-day ideal wake time
  { id: 'morningFeel', optionScores: [1, 2, 3, 4] }, // MEQ 7: first-half-hour tiredness
  { id: 'eveningSleepy', optionScores: [5, 4, 3, 2, 1] }, // MEQ 10: evening sleep pressure
  { id: 'bestTime', optionScores: [5, 4, 3, 2, 1] }, // MEQ 18: self-judged best hours
  { id: 'selfType', optionScores: [6, 4, 2, 0] }, // MEQ 19: self-labeled type
] as const;

export type RmeqItemId = (typeof RMEQ_ITEMS)[number]['id'];

/** Option index (into optionScores) per item, or null when the item was skipped. */
export type RmeqAnswers = Record<RmeqItemId, number | null>;

export function emptyRmeqAnswers(): RmeqAnswers {
  return { wakeTime: null, morningFeel: null, eveningSleepy: null, bestTime: null, selfType: null };
}

export function classFromScore(score: number): ChronotypeClass {
  if (!Number.isInteger(score) || score < RMEQ_SCORE_MIN || score > RMEQ_SCORE_MAX) {
    throw new RangeError(`rMEQ score must be an integer in [4, 25], got ${score}`);
  }
  if (score >= RMEQ_CLASS_LOWER_BOUNDS.DM) return 'DM';
  if (score >= RMEQ_CLASS_LOWER_BOUNDS.MM) return 'MM';
  if (score >= RMEQ_CLASS_LOWER_BOUNDS.INT) return 'INT';
  if (score >= RMEQ_CLASS_LOWER_BOUNDS.ME) return 'ME';
  return 'DE';
}

export type RmeqResult =
  | { skipped: false; score: number; chronotypeClass: ChronotypeClass }
  | { skipped: true; score: null; chronotypeClass: typeof SKIPPED_SURVEY_CLASS };

/** Sum a complete answer set; any skipped item makes the whole survey skipped (ADR-0005). */
export function scoreRmeq(answers: RmeqAnswers): RmeqResult {
  let score = 0;
  for (const item of RMEQ_ITEMS) {
    const optionIndex = answers[item.id];
    if (optionIndex === null) {
      return { skipped: true, score: null, chronotypeClass: SKIPPED_SURVEY_CLASS };
    }
    const optionScore = item.optionScores[optionIndex];
    if (optionScore === undefined) {
      throw new RangeError(`item ${item.id} has no option ${optionIndex}`);
    }
    score += optionScore;
  }
  return { skipped: false, score, chronotypeClass: classFromScore(score) };
}
