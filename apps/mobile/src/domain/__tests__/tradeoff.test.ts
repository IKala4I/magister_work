/** FR-24 option parsing (server order kept, malformed rows dropped) and consequence copy. */
import type { PlanRow } from '../../db/plans';
import { infeasibleOptionsOf, tradeoffConsequence, tradeoffOptionLabel } from '../tradeoff';

function plan(telemetry: unknown): PlanRow {
  return {
    id: 'p',
    userId: 'u',
    planDate: '2026-09-02',
    horizon: 'day',
    engine: 'learned',
    modelVersion: 'v',
    arm: null,
    solverStatus: 'INFEASIBLE',
    telemetry: telemetry as Record<string, unknown>,
    generatedAt: new Date(),
    serverSeq: null,
  };
}

describe('infeasibleOptionsOf', () => {
  it('keeps the server order and drops rows outside the closed vocabulary', () => {
    const opts = infeasibleOptionsOf(
      plan({
        infeasible: {
          options: [
            {
              kind: 'shrink',
              task_id: 't1',
              delta_minutes: 30,
              consequence: { metric: 'est_completion_drop', value: 0.18 },
            },
            { kind: 'drop', task_id: 't2', consequence: { metric: 'value_forfeited', value: 1.2 } },
            { kind: 'explode', task_id: 't3', consequence: { metric: 'x', value: 1 } },
            { kind: 'unpin', task_id: 't4' },
          ],
        },
      }),
    );
    expect(opts.map((o) => o.kind)).toEqual(['shrink', 'drop']);
    expect(opts[1]!.delta_minutes).toBeNull();
  });
  it('is empty without telemetry / infeasible / options', () => {
    expect(infeasibleOptionsOf(undefined)).toEqual([]);
    expect(infeasibleOptionsOf(plan({}))).toEqual([]);
    expect(infeasibleOptionsOf(plan({ infeasible: null }))).toEqual([]);
  });
});

describe('copy', () => {
  it('labels name the task and the delta; consequences follow the metric vocabulary', () => {
    const shrink = {
      kind: 'shrink' as const,
      task_id: 't',
      delta_minutes: 30,
      consequence: { metric: 'est_completion_drop', value: 0.18 },
    };
    expect(tradeoffOptionLabel(shrink, 'Report')).toBe('Shorten "Report" by 30 min');
    expect(tradeoffConsequence(shrink)).toBe('about 18% lower chance of finishing');
    expect(
      tradeoffConsequence({
        ...shrink,
        kind: 'drop',
        consequence: { metric: 'value_forfeited', value: 1.234 },
      }),
    ).toBe('gives up about 1.2 points of expected value today');
    expect(
      tradeoffConsequence({
        ...shrink,
        kind: 'move_past_deadline',
        consequence: { metric: 'deadline_slip_minutes', value: 45 },
      }),
    ).toBe('finishes 45 min after the deadline');
    expect(
      tradeoffConsequence({
        ...shrink,
        kind: 'unpin',
        consequence: { metric: 'pinned_conflict', value: 1 },
      }),
    ).toBe('frees the pinned slot that overlaps another pin');
    expect(tradeoffConsequence({ ...shrink, consequence: { metric: 'novel', value: 1 } })).toBe(
      'a smaller change to the day',
    );
    expect(tradeoffOptionLabel({ ...shrink, kind: 'unpin' }, 'Gym')).toBe('Unpin "Gym"');
    expect(tradeoffOptionLabel({ ...shrink, kind: 'drop' }, 'Gym')).toBe(
      'Leave "Gym" for another day',
    );
  });
});
