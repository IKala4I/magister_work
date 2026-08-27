/**
 * Cross-boundary pins: the EF constants equal `packages/shared/src/params.ts` (the client and
 * the pre-registration read those) AND the service's `params.py` (H1: identical ε, m,
 * eligibility across arms; L16: the service rejects a mismatch at runtime).
 */
import { assertEquals } from '@std/assert';
import * as ef from './params.ts';
import * as shared from '../../../packages/shared/src/params.ts';

const PY_PARAMS = new URL(
  '../../../services/recsys/src/hourwell_recsys/params.py',
  import.meta.url,
);

function pyConst(source: string, name: string): number {
  const m = new RegExp(`^${name}\\s*=\\s*([0-9_.]+)`, 'm').exec(source);
  if (m === null) throw new Error(`${name} not found in params.py`);
  return Number(m[1].replaceAll('_', ''));
}

Deno.test('EF params == packages/shared params (client side of the boundary)', () => {
  assertEquals(ef.EPSILON, shared.EPSILON);
  assertEquals(ef.TOP_M, shared.TOP_M);
  assertEquals(ef.PLAN_FALLBACK_BUDGET_MS, shared.PLAN_FALLBACK_BUDGET_MS);
  assertEquals(ef.PLAN_RATE_LIMIT_PER_DAY, shared.PLAN_RATE_LIMIT_PER_DAY);
  // P7 reward mapping + duration estimator (H2: PAR anchors are one source on the TS side)
  assertEquals(ef.PAR_GRACE_MINUTES, shared.PAR_GRACE_MINUTES);
  assertEquals(ef.PAR_MIN_FRACTION, shared.PAR_MIN_FRACTION);
  assertEquals(ef.REWARD_OFF_SLOT, shared.REWARD_OFF_SLOT);
  assertEquals(ef.REWARD_OVERRIDE_OUT, shared.REWARD_OVERRIDE_OUT);
  assertEquals(ef.REWARD_OVERRIDE_IN, shared.REWARD_OVERRIDE_IN);
  assertEquals(ef.CORRECTION_WINDOW_DAYS, shared.CORRECTION_WINDOW_DAYS);
  assertEquals(ef.DURATION_EWMA_ALPHA, shared.DURATION_EWMA_ALPHA);
  assertEquals(ef.DURATION_MIN_SESSIONS, shared.DURATION_MIN_SESSIONS);
  assertEquals([...ef.DURATION_RATIO_CLIP], [...shared.DURATION_RATIO_CLIP]);
});

Deno.test('EF params == services/recsys params.py (service side of the boundary)', async () => {
  const py = await Deno.readTextFile(PY_PARAMS);
  const pins: Array<[keyof typeof ef, string]> = [
    ['TICK_MINUTES', 'TICK_MINUTES'],
    ['BUFFER_TICKS', 'BUFFER_TICKS'],
    ['D_MIN_TICKS', 'D_MIN_TICKS'],
    ['MAX_CHUNKS', 'MAX_CHUNKS'],
    ['ETA_TICKS', 'ETA_TICKS'],
    ['EPSILON', 'EPSILON'],
    ['TOP_M', 'TOP_M'],
    ['EXPERIMENT_MAX_DURATION_TICKS', 'EXPERIMENT_MAX_DURATION_TICKS'],
    ['EXPERIMENT_MIN_BUCKETS', 'EXPERIMENT_MIN_BUCKETS'],
    ['FATIGUE_RUN_MINUTES', 'FATIGUE_RUN_MINUTES'],
    ['FATIGUE_GAP_MINUTES', 'FATIGUE_GAP_MINUTES'],
    ['PRECEDING_LOAD_WINDOW_MINUTES', 'PRECEDING_LOAD_WINDOW_MINUTES'],
    ['LOG_DURATION_REF_MINUTES', 'LOG_DURATION_REF_MINUTES'],
    ['POSTPONE_CAP', 'POSTPONE_CAP'],
    ['FEATURE_DIM', 'FEATURE_DIM'],
    ['BETA_HALF_LIFE_DAYS', 'BETA_HALF_LIFE_DAYS'],
    ['PLAN_RATE_LIMIT_PER_DAY', 'PLAN_RATE_LIMIT_PER_DAY'],
    ['DURATION_EWMA_ALPHA', 'DURATION_EWMA_ALPHA'],
  ];
  for (const [efName, pyName] of pins) {
    assertEquals(ef[efName], pyConst(py, pyName), `${efName} drifted from params.py`);
  }
  // URGENCY_RATIONALE_THRESHOLD is written as a parenthesised expression in params.py
  assertEquals(ef.URGENCY_RATIONALE_THRESHOLD, 0.5);
  assertEquals(/URGENCY_RATIONALE_THRESHOLD = \(\s*0\.5/.test(py), true);
  assertEquals(ef.FALLBACK_PRIOR_N0, pyConst(py, 'N0_IN_HOURS') * 0.5);
});
