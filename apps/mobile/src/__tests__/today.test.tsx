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
const mockLapse = { diagnosticTask: null as unknown, dismissDiagnostic: jest.fn() };
jest.mock('../sync/useLapseScan', () => ({ useLapseScan: () => mockLapse }));
const mockBlockActions = {
  startFocusAction: jest.fn(),
  doneBlockAction: jest.fn(),
  skipBlockAction: jest.fn((): { task: TaskRow | null; diagnosticDue: boolean } => ({
    task: null,
    diagnosticDue: false,
  })),
  moveBlockAction: jest.fn(),
  correctLapseAction: jest.fn(),
  skipDiagnosticAction: jest.fn(),
};
// factories run when the module is first required (before this file's consts exist), so the
// mocked functions delegate lazily — the same pattern as mockUseLiveRows above
jest.mock('../domain/blockActions', () => ({
  startFocusAction: (...a: unknown[]) => mockBlockActions.startFocusAction(...a),
  doneBlockAction: (...a: unknown[]) => mockBlockActions.doneBlockAction(...a),
  skipBlockAction: () => mockBlockActions.skipBlockAction(),
  moveBlockAction: (...a: unknown[]) => mockBlockActions.moveBlockAction(...a),
  correctLapseAction: (...a: unknown[]) => mockBlockActions.correctLapseAction(...a),
  skipDiagnosticAction: (...a: unknown[]) => mockBlockActions.skipDiagnosticAction(...a),
}));
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: () => null,
}));
const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ navigate: mockNavigate }) }));
const mockWipe = { discard: jest.fn(), keep: jest.fn() };
jest.mock('../auth/accountTransition', () => ({
  discardPendingWipe: (...a: unknown[]) => mockWipe.discard(...a),
  keepPendingWipe: () => mockWipe.keep(),
}));

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import TodayScreen from '../../app/(tabs)/index';
import type { PlanRow, RecommendationRow } from '../db/plans';
import type { TaskRow } from '../db/tasks';
import { en } from '../i18n/en';
import type { CalendarEventRow } from '../db/calendar';
import { usePlanStore } from '../state/plan';
import { useSyncStore } from '../state/sync';

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
    skipStreak: 0,
    deletedAt: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    serverSeq: null,
    ...over,
  };
}

function rows(input: {
  plans?: PlanRow[];
  recs?: RecommendationRow[];
  tasks?: TaskRow[];
  sessions?: Array<{ recommendationId: string }>;
  busy?: CalendarEventRow[];
}) {
  mockUseLiveRows.mockImplementation((_build: unknown, tables: readonly string[]) => {
    if (tables[0] === 'plans') return input.plans ?? [];
    if (tables[0] === 'recommendations') return input.recs ?? [];
    if (tables[0] === 'focus_sessions') return input.sessions ?? [];
    if (tables[0] === 'calendar_events') return input.busy ?? [];
    return input.tasks ?? [];
  });
}

function busyEvent(over: Partial<CalendarEventRow> = {}): CalendarEventRow {
  const start = new Date(today);
  start.setHours(11, 0, 0, 0);
  const end = new Date(start);
  end.setHours(12, 0, 0, 0);
  return {
    id: 'cal-1',
    userId: 'local:u',
    source: 'google',
    externalId: 'meet1',
    startAt: start,
    endAt: end,
    title: 'Design review',
    busy: true,
    deletedAt: null,
    updatedAt: new Date(),
    serverSeq: 3,
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  useSyncStore.setState({
    status: 'idle',
    lastSyncAt: null,
    pendingOps: 0,
    notice: null,
    pendingWipe: null,
  });
  mockLapse.diagnosticTask = null;
  mockBlockActions.skipBlockAction.mockImplementation(() => ({ task: null, diagnosticDue: false }));
  usePlanStore.setState({ status: 'idle', lastRequestedDay: null, emptyInbox: false });
  rows({});
});

describe('Today', () => {
  it('shows the empty state and a "Plan my day" button that triggers a manual request', async () => {
    await render(withSafeArea(<TodayScreen />));
    expect(screen.getByText(en['today.empty.title'])).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText(en['today.plan']));
    });
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

  // --- P7 block actions (FR-23/25/30, UC-04/06/07) ---------------------------------------------

  it('a shown block offers Start / Done / Skip / Move; Start logs the fact and opens the Focus tab', async () => {
    rows({ plans: [plan()], recs: [rec()], tasks: [task()] });
    await render(withSafeArea(<TodayScreen />));
    for (const key of [
      'block.action.start',
      'block.action.done',
      'block.action.skip',
      'block.action.move',
    ] as const) {
      expect(screen.getByText(en[key])).toBeTruthy();
    }
    await act(async () => {
      await act(async () => {
        fireEvent.press(screen.getByText(en['block.action.start']));
      });
    });
    expect(mockBlockActions.startFocusAction).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/(tabs)/focus');
    await act(async () => {
      fireEvent.press(screen.getByText(en['block.action.done']));
    });
    expect(mockBlockActions.doneBlockAction).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.press(screen.getByText(en['block.action.skip']));
    });
    expect(mockBlockActions.skipBlockAction).toHaveBeenCalledTimes(1);
  });

  it('Move… opens the inline picker; confirming logs the move with a 15-min-snapped start', async () => {
    rows({ plans: [plan()], recs: [rec()], tasks: [task()] });
    await render(withSafeArea(<TodayScreen />));
    await act(async () => {
      await act(async () => {
        fireEvent.press(screen.getByText(en['block.action.move']));
      });
    });
    await act(async () => {
      await act(async () => {
        fireEvent.press(screen.getByText(en['block.move.confirm']));
      });
    });
    expect(mockBlockActions.moveBlockAction).toHaveBeenCalledTimes(1);
    const picked = mockBlockActions.moveBlockAction.mock.calls[0]![1] as Date;
    expect(picked.getMinutes() % 15).toBe(0);
    expect(screen.queryByText(en['block.move.confirm'])).toBeNull();
  });

  it('a lapsed block reads neutrally, offers "I did it", and never shows Skip', async () => {
    rows({ plans: [plan()], recs: [rec({ status: 'lapsed' })], tasks: [task()] });
    await render(withSafeArea(<TodayScreen />));
    expect(screen.getByText(en['block.status.lapsed'])).toBeTruthy();
    expect(screen.queryByText(en['block.action.skip'])).toBeNull();
    await act(async () => {
      await act(async () => {
        fireEvent.press(screen.getByText(en['block.action.didIt']));
      });
    });
    expect(mockBlockActions.correctLapseAction).toHaveBeenCalledTimes(1);
  });

  it('a completed block shows "Done" with no actions; a running block shows "In progress" and blocks Start elsewhere', async () => {
    rows({
      plans: [plan()],
      recs: [
        rec({ id: 'rec-1', status: 'completed' }),
        rec({ id: 'rec-2', taskId: 't-2' }),
        rec({ id: 'rec-3', taskId: 't-3' }),
      ],
      tasks: [task(), task({ id: 't-2', title: 'second' }), task({ id: 't-3', title: 'third' })],
      sessions: [{ recommendationId: 'rec-2' }],
    });
    await render(withSafeArea(<TodayScreen />));
    expect(screen.getByText(en['block.status.completed'])).toBeTruthy();
    expect(screen.getByText(en['block.status.active'])).toBeTruthy();
    // only the third block has a Start button, and it is disabled while another session runs
    const starts = screen.getAllByText(en['block.action.start']);
    expect(starts).toHaveLength(1);
    await act(async () => {
      fireEvent.press(starts[0]!);
    });
    expect(mockBlockActions.startFocusAction).not.toHaveBeenCalled();
  });

  it('the third consecutive skip asks the one-question diagnostic; an answer routes and shows the result line', async () => {
    mockBlockActions.skipBlockAction.mockImplementation(() => ({
      task: task({ skipStreak: 3 }),
      diagnosticDue: true,
    }));
    rows({ plans: [plan()], recs: [rec()], tasks: [task()] });
    await render(withSafeArea(<TodayScreen />));
    await act(async () => {
      await act(async () => {
        fireEvent.press(screen.getByText(en['block.action.skip']));
      });
    });
    await act(async () => {
      await act(async () => {
        fireEvent.press(screen.getByText(en['diagnostic.tooBig']));
      });
    });
    expect(mockBlockActions.skipDiagnosticAction).toHaveBeenCalledWith('t-1', 'too_big');
    expect(screen.getByText(en['diagnostic.tooBig.result'])).toBeTruthy();
    expect(screen.queryByText(en['diagnostic.title'])).toBeNull();
  });

  it('the diagnostic surfaced by the foreground lapse scan can be deferred ("ask me later")', async () => {
    mockLapse.diagnosticTask = task({ skipStreak: 3 });
    rows({ plans: [plan()], recs: [rec()], tasks: [task()] });
    await render(withSafeArea(<TodayScreen />));
    await act(async () => {
      await act(async () => {
        fireEvent.press(screen.getByText(en['diagnostic.later']));
      });
    });
    expect(mockLapse.dismissDiagnostic).toHaveBeenCalledTimes(1);
    expect(mockBlockActions.skipDiagnosticAction).not.toHaveBeenCalled();
  });
});

describe('Today — P8 sync surfaces', () => {
  it('renders imported busy rows between blocks with title and time (FR-03)', async () => {
    rows({ plans: [plan()], recs: [rec()], tasks: [task()], busy: [busyEvent()] });
    await render(withSafeArea(<TodayScreen />));
    expect(screen.getByText('Design review')).toBeTruthy();
    expect(screen.getByLabelText(/^Busy: Design review/)).toBeTruthy();
    expect(screen.getByText('write report')).toBeTruthy();
  });

  it('an untitled busy row reads "Busy"; a plan with only meetings still renders the timeline', async () => {
    rows({ plans: [plan()], recs: [], tasks: [], busy: [busyEvent({ title: null })] });
    await render(withSafeArea(<TodayScreen />));
    expect(screen.getByText(en['today.busy.untitled'])).toBeTruthy();
    expect(screen.queryByText(en['today.empty.title'])).toBeNull();
  });

  it('shows the File 05 §2 notices from the sync store and dismisses on tap', async () => {
    useSyncStore.setState({ notice: { kind: 'meeting_kept', at: Date.now() } });
    await render(withSafeArea(<TodayScreen />));
    expect(screen.getByText(en['today.notice.meetingKept'])).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText(en['today.notice.dismiss']));
    });
    expect(screen.queryByText(en['today.notice.meetingKept'])).toBeNull();
    useSyncStore.setState({ notice: { kind: 'displaced', count: 2, at: Date.now() } });
    await render(withSafeArea(<TodayScreen />));
    expect(
      screen.getByText(
        'Meetings now overlap 2 planned blocks — they return to your Inbox for the next plan.',
      ),
    ).toBeTruthy();
  });

  it('a stale notice (older than a minute) is not shown', async () => {
    useSyncStore.setState({ notice: { kind: 'meeting_kept', at: Date.now() - 120_000 } });
    await render(withSafeArea(<TodayScreen />));
    expect(screen.queryByText(en['today.notice.meetingKept'])).toBeNull();
  });

  it('the deferred-wipe banner offers Keep / Discard (ADR-0012 §11)', async () => {
    useSyncStore.setState({ pendingWipe: { userId: 'prev', ops: 4 } });
    await render(withSafeArea(<TodayScreen />));
    expect(
      screen.getByText('Another account left 4 unsynced changes on this device.'),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText(en['today.wipe.keep']));
    });
    expect(mockWipe.keep).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.press(screen.getByText(en['today.wipe.discard']));
    });
    expect(mockWipe.discard).toHaveBeenCalledTimes(1);
  });

  it('a displaced block shows the neutral caption, never an error state', async () => {
    rows({ plans: [plan()], recs: [rec({ status: 'displaced' })], tasks: [task()] });
    await render(withSafeArea(<TodayScreen />));
    expect(screen.getByText(en['block.status.displaced'])).toBeTruthy();
  });
});
