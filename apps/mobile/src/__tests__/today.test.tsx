/**
 * Today screen (FR-20/21/22 UI half): empty states, the optimistic planning banner (NFR-P1),
 * blocks with title/time/rationale/experiment tag, the NFR-R2 fallback label (and its absence
 * for arm-A plans), the deferred line, and the manual re-plan button. DB, live rows and the
 * plan bridge are mocked — the write path is covered in src/db/__tests__/plansDao.test.ts.
 */
jest.mock('../db/client', () => ({ db: {} }));

const mockUseLiveRows = jest.fn();
jest.mock('../db/useLiveRows', () => ({
  useLiveRows: (build: unknown, tables: readonly string[]) => mockUseLiveRows(build, tables),
}));

const mockRequestManual = jest.fn();
jest.mock('../sync/usePlanTrigger', () => ({
  usePlanTrigger: () => ({ requestManual: mockRequestManual }),
}));

import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import TodayScreen from '../../app/(tabs)/index';
import type { PlanRow, RecommendationRow } from '../db/plans';
import type { TaskRow } from '../db/tasks';
import { en } from '../i18n/en';
import { usePlanStore } from '../state/plan';

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const withSafeArea = (ui: ReactElement) => (
  <SafeAreaProvider initialMetrics={initialMetrics}>{ui}</SafeAreaProvider>
);

const today = new Date();
const planDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

function plan(over: Partial<PlanRow> = {}): PlanRow {
  return {
    id: 'plan-1',
    userId: 'local:u',
    planDate,
    horizon: 'day',
    engine: 'learned',
    modelVersion: 'recsys-p5.0',
    arm: null,
    solverStatus: 'OPTIMAL',
    telemetry: { ef: { reason: 'learned' }, unplaced: [] },
    generatedAt: new Date(),
    serverSeq: 1,
    ...over,
  };
}

function rec(over: Partial<RecommendationRow> = {}): RecommendationRow {
  const start = new Date(today);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start);
  end.setHours(10, 30, 0, 0);
  return {
    id: 'rec-1',
    userId: 'local:u',
    planId: 'plan-1',
    taskId: 't-1',
    chunkIndex: 0,
    slotStart: start,
    slotEnd: end,
    contextBucket: 'MO.wd.fresh',
    features: [],
    qHat: 0.6,
    confidence: 0.8,
    rationaleKey: 'energy_peak',
    rationaleParams: { category: 'deep', daypart: 'MO', factor: 1.3 },
    isExperiment: false,
    engine: 'learned',
    modelVersion: 'recsys-p5.0',
    status: 'shown',
    attributedAt: null,
    propensity: null,
    conflictFlag: false,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    serverSeq: 2,
    ...over,
  };
}

function task(over: Partial<TaskRow> = {}): TaskRow {
  return {
    id: 't-1',
    userId: 'local:u',
    title: 'write report',
    category: 'deep',
    estMinutes: 90,
    deadline: null,
    value: 2,
    splittable: false,
    earliestStart: null,
    recurrence: null,
    status: 'scheduled',
    doneAt: null,
    postponeCount: 0,
    deletedAt: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    serverSeq: null,
    ...over,
  };
}

function rows(input: { plans?: PlanRow[]; recs?: RecommendationRow[]; tasks?: TaskRow[] }) {
  mockUseLiveRows.mockImplementation((_build: unknown, tables: readonly string[]) => {
    if (tables[0] === 'plans') return input.plans ?? [];
    if (tables[0] === 'recommendations') return input.recs ?? [];
    return input.tasks ?? [];
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  usePlanStore.setState({ status: 'idle', lastRequestedDay: null, emptyInbox: false });
  rows({});
});

describe('Today', () => {
  it('shows the empty state and a "Plan my day" button that triggers a manual request', async () => {
    await render(withSafeArea(<TodayScreen />));
    expect(screen.getByText(en['today.empty.title'])).toBeTruthy();
    fireEvent.press(screen.getByText(en['today.plan']));
    expect(mockRequestManual).toHaveBeenCalledTimes(1);
  });

  it('shows the optimistic planning banner while a request runs (NFR-P1) and the empty-inbox copy (UC-03 A2)', async () => {
    usePlanStore.setState({ status: 'planning' });
    await render(withSafeArea(<TodayScreen />));
    expect(screen.getByText(en['today.planning'])).toBeTruthy();
    usePlanStore.setState({ status: 'idle', emptyInbox: true });
    await render(withSafeArea(<TodayScreen />));
    expect(screen.getByText(en['today.emptyInbox.title'])).toBeTruthy();
  });

  it('renders blocks with title, time, rationale sentence and the experiment tag (FR-21/22)', async () => {
    rows({
      plans: [plan()],
      recs: [
        rec(),
        rec({
          id: 'rec-2',
          taskId: 't-2',
          isExperiment: true,
          confidence: null,
          propensity: 0.25,
          rationaleKey: 'experiment',
          rationaleParams: { category: 'admin', daypart: 'AF' },
        }),
      ],
      tasks: [task(), task({ id: 't-2', title: 'expense sheet', category: 'admin' })],
    });
    await render(withSafeArea(<TodayScreen />));
    expect(screen.getByText('write report')).toBeTruthy();
    expect(screen.getByText('expense sheet')).toBeTruthy();
    expect(screen.getByText('You finish Deep work best in the morning (+30%).')).toBeTruthy();
    expect(
      screen.getByText('Experiment: trying Admin in the afternoon to learn what works for you.'),
    ).toBeTruthy();
    expect(screen.getByText(en['block.experiment'])).toBeTruthy();
    expect(screen.getByText(en['today.replan'])).toBeTruthy();
    expect(screen.queryByText(en['today.fallback'])).toBeNull();
  });

  it('labels an NFR-R2 fallback plan but never an arm-A plan (H1 blinding)', async () => {
    rows({
      plans: [
        plan({
          engine: 'heuristic',
          telemetry: { ef: { reason: 'fallback:timeout' }, unplaced: [] },
        }),
      ],
      recs: [rec({ engine: 'heuristic', confidence: null })],
      tasks: [task()],
    });
    await render(withSafeArea(<TodayScreen />));
    expect(screen.getByText(en['today.fallback'])).toBeTruthy();
    rows({
      plans: [
        plan({
          engine: 'heuristic',
          arm: 'A',
          telemetry: { ef: { reason: 'arm_a' }, unplaced: [] },
        }),
      ],
      recs: [rec({ engine: 'heuristic', confidence: null })],
      tasks: [task()],
    });
    await render(withSafeArea(<TodayScreen />));
    expect(screen.queryByText(en['today.fallback'])).toBeNull();
  });

  it('lists deferred tasks calmly and surfaces the rate-limit / error notices', async () => {
    rows({
      plans: [
        plan({
          telemetry: {
            ef: { reason: 'learned' },
            unplaced: [
              { task_id: 'x', reason: 'deferred' },
              { task_id: 'y', reason: 'deferred' },
            ],
          },
        }),
      ],
      recs: [rec()],
      tasks: [task()],
    });
    await render(withSafeArea(<TodayScreen />));
    expect(screen.getByText('No room today for 2 tasks — they stay in your Inbox.')).toBeTruthy();
    usePlanStore.setState({ status: 'rate_limited' });
    await render(withSafeArea(<TodayScreen />));
    expect(screen.getByText(en['today.rateLimited'])).toBeTruthy();
    usePlanStore.setState({ status: 'error' });
    await render(withSafeArea(<TodayScreen />));
    expect(screen.getByText(en['today.error'])).toBeTruthy();
  });
});
