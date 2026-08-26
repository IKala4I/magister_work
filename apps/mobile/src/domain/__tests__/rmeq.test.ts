/**
 * Dedicated cold-start math tests, client half (P4 acceptance; File 04 §3.1).
 * Every expected value below is copied from the SPEC (score range [4,25]; cutoffs
 * 22/18/12/8; skipped ⇒ INT), never derived from the implementation.
 */
import {
  classFromScore,
  emptyRmeqAnswers,
  RMEQ_ITEMS,
  RMEQ_SCORE_MAX,
  RMEQ_SCORE_MIN,
  scoreRmeq,
  SKIPPED_SURVEY_CLASS,
} from '../rmeq';
import type { RmeqAnswers } from '../rmeq';

describe('rMEQ instrument shape (Adan & Almirall 1991; File 04 §3.1)', () => {
  it('has 5 items with the published option score sets', () => {
    expect(RMEQ_ITEMS.map((i) => [...i.optionScores])).toEqual([
      [5, 4, 3, 2, 1], // MEQ 1
      [1, 2, 3, 4], // MEQ 7
      [5, 4, 3, 2, 1], // MEQ 10
      [5, 4, 3, 2, 1], // MEQ 18
      [6, 4, 2, 0], // MEQ 19
    ]);
  });

  it('sum range is exactly [4, 25]', () => {
    const min = RMEQ_ITEMS.reduce((s, i) => s + Math.min(...i.optionScores), 0);
    const max = RMEQ_ITEMS.reduce((s, i) => s + Math.max(...i.optionScores), 0);
    expect([min, max]).toEqual([RMEQ_SCORE_MIN, RMEQ_SCORE_MAX]);
  });
});

describe('rMEQ → class boundary values (File 04 §3.1 table)', () => {
  it.each([
    [25, 'DM'],
    [22, 'DM'],
    [21, 'MM'],
    [18, 'MM'],
    [17, 'INT'],
    [12, 'INT'],
    [11, 'ME'],
    [8, 'ME'],
    [7, 'DE'],
    [4, 'DE'],
  ] as const)('score %i maps to %s', (score, expected) => {
    expect(classFromScore(score)).toBe(expected);
  });

  it.each([3, 26, 0, -1, 14.5])('rejects out-of-instrument score %p', (score) => {
    expect(() => classFromScore(score as number)).toThrow(RangeError);
  });
});

describe('scoring and skip semantics (FR-02 + ADR-0005)', () => {
  const allFirst = (): RmeqAnswers => ({
    wakeTime: 0,
    morningFeel: 0,
    eveningSleepy: 0,
    bestTime: 0,
    selfType: 0,
  });

  it('max-morningness answers give DM at 25', () => {
    // first options score 5,1,5,5,6 — max requires morningFeel index 3 ("very refreshed")
    const answers = { ...allFirst(), morningFeel: 3 };
    expect(scoreRmeq(answers)).toEqual({ skipped: false, score: 25, chronotypeClass: 'DM' });
  });

  it('max-eveningness answers give DE at 4', () => {
    const answers: RmeqAnswers = {
      wakeTime: 4,
      morningFeel: 0,
      eveningSleepy: 4,
      bestTime: 4,
      selfType: 3,
    };
    expect(scoreRmeq(answers)).toEqual({ skipped: false, score: 4, chronotypeClass: 'DE' });
  });

  it('any single skipped item makes the whole survey skipped => INT, no score', () => {
    for (const item of RMEQ_ITEMS) {
      const answers = { ...allFirst(), morningFeel: 3, [item.id]: null };
      expect(scoreRmeq(answers)).toEqual({
        skipped: true,
        score: null,
        chronotypeClass: SKIPPED_SURVEY_CLASS,
      });
    }
  });

  it('a fully skipped survey is skipped', () => {
    expect(scoreRmeq(emptyRmeqAnswers()).skipped).toBe(true);
  });

  it('rejects an out-of-range option index', () => {
    expect(() => scoreRmeq({ ...allFirst(), morningFeel: 9 })).toThrow(RangeError);
  });
});
