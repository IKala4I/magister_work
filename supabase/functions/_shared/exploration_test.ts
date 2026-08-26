import { assert, assertEquals, assertThrows } from '@std/assert';
import {
  drawExperiment,
  eligibleTasks,
  type ExperimentCandidate,
  propensity,
  topMBuckets,
} from './exploration.ts';
import { EPSILON, EXPERIMENT_MIN_BUCKETS, TOP_M } from './params.ts';
import { seededRng } from './rng.ts';

const BUCKETS = ['MO.wd.fresh', 'AF.wd.fresh', 'MD.wd', 'EV.wd', 'EM.wd'];
const cand = (taskId: string, over: Partial<ExperimentCandidate> = {}): ExperimentCandidate => ({
  taskId,
  duration: 4,
  critical: false,
  pinned: false,
  feasibleBucketIds: BUCKETS,
  ...over,
});

Deno.test('propensity is ε/|A_m(x)| exactly', () => {
  assertEquals(propensity(EPSILON, TOP_M), 0.25);
  assertEquals(propensity(1, 3), 1 / 3);
  assertEquals(propensity(0.5, 2), 0.25);
  assertThrows(() => propensity(1.5, 4), RangeError);
  assertThrows(() => propensity(1, 0), RangeError);
});

Deno.test('eligibility mirrors the service (test_exploration.py::test_eligibility_rules)', () => {
  const cands = [
    cand('ok'),
    cand('crit', { critical: true }),
    cand('pin', { pinned: true }),
    cand('long', { duration: 9 }),
    cand('three', { feasibleBucketIds: ['MO.wd.fresh', 'AF.wd.fresh', 'MD.wd'] }),
    cand('two', { feasibleBucketIds: ['MO.wd.fresh', 'MO.wd.fresh', 'MD.wd'] }),
    cand('one', { feasibleBucketIds: ['MO.wd.fresh'] }),
    cand('edge', { duration: 8 }),
  ];
  assertEquals(EXPERIMENT_MIN_BUCKETS, 2);
  assertEquals(eligibleTasks(cands), ['edge', 'ok', 'three', 'two']);
  assertEquals(eligibleTasks(cands, { minBuckets: 4 }), ['edge', 'ok']);
});

Deno.test('top-m is deterministic with the id tie-break (service: ("c","a","b","e"))', () => {
  const ranking: Array<readonly [string, number]> = [
    ['b', 0.5],
    ['a', 0.5],
    ['c', 0.9],
    ['d', 0.1],
    ['e', 0.5],
  ];
  assertEquals(topMBuckets(ranking, 4), ['c', 'a', 'b', 'e']);
  assertEquals(topMBuckets(ranking.slice(0, 2), 4), ['a', 'b']);
});

function chi2(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  const expected = total / counts.length;
  return counts.reduce((acc, c) => acc + ((c - expected) ** 2) / expected, 0);
}

Deno.test('draw is uniform over eligible tasks and over the top-m buckets; 5th bucket never drawn', () => {
  const rng = seededRng(2026);
  const eligible = ['t1', 't2', 't3'];
  const rankings = new Map(
    eligible.map((t) => [t, BUCKETS.map((b, i) => [b, 0.9 - i * 0.1] as const)]),
  );
  const taskCounts = new Map(eligible.map((t) => [t, 0]));
  const bucketCounts = new Map(BUCKETS.slice(0, 4).map((b) => [b, 0]));
  for (let i = 0; i < 6000; i++) {
    const d = drawExperiment(rng, { eligible, rankings });
    assert(d !== null);
    assertEquals(d.propensity, 0.25);
    assertEquals(d.topM, BUCKETS.slice(0, 4));
    assert(d.topM.includes(d.bucketId));
    taskCounts.set(d.taskId, (taskCounts.get(d.taskId) ?? 0) + 1);
    bucketCounts.set(d.bucketId, (bucketCounts.get(d.bucketId) ?? 0) + 1);
  }
  assert(chi2([...taskCounts.values()]) < 13.82); // χ²₂(0.999)
  assert(chi2([...bucketCounts.values()]) < 16.27); // χ²₃(0.999)
  assertEquals(bucketCounts.has(BUCKETS[4]), false);
});

Deno.test('|A_m(x)| ∈ {2, 3}: p = ε/|A_m(x)| and uniform within the smaller set', () => {
  const rng = seededRng(7);
  for (const k of [2, 3]) {
    const rankings = new Map([[
      't',
      BUCKETS.slice(0, k).map((b, i) => [b, 0.9 - i * 0.1] as const),
    ]]);
    const counts = new Map(BUCKETS.slice(0, k).map((b) => [b, 0]));
    for (let i = 0; i < 3000; i++) {
      const d = drawExperiment(rng, { eligible: ['t'], rankings });
      assert(d !== null);
      assertEquals(d.propensity, EPSILON / k);
      assertEquals(d.topM, BUCKETS.slice(0, k));
      counts.set(d.bucketId, (counts.get(d.bucketId) ?? 0) + 1);
    }
    assert(chi2([...counts.values()]) < (k === 2 ? 10.83 : 13.82));
  }
});

Deno.test('ε = 0 never draws; no eligible never draws; Bernoulli(ε) rate; < min buckets is fatal', () => {
  const rng = seededRng(9);
  const rankings = new Map([['t', BUCKETS.map((b) => [b, 0.5] as const)]]);
  for (let i = 0; i < 200; i++) {
    assertEquals(drawExperiment(rng, { eligible: ['t'], rankings, epsilon: 0 }), null);
  }
  assertEquals(drawExperiment(rng, { eligible: [], rankings }), null);
  let hits = 0;
  for (let i = 0; i < 5000; i++) {
    if (drawExperiment(rng, { eligible: ['t'], rankings, epsilon: 0.3 }) !== null) hits++;
  }
  assert(hits / 5000 > 0.27 && hits / 5000 < 0.33);
  assertThrows(
    () =>
      drawExperiment(rng, {
        eligible: ['t'],
        rankings: new Map([['t', [['MO.wd.fresh', 0.5] as const]]]),
      }),
    RangeError,
  );
});
