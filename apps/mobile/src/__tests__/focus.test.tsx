/**
 * Focus tab (FR-30/31 UI half): the running session with pause/finish/stop, the elapsed clock,
 * and the post-session 1-tap rating that is inline (never modal-blocking), optional (skippable)
 * and at most two taps. DB, live rows and the action layer are mocked — the write path is
 * covered in src/db/__tests__/feedbackDao.test.ts.
 */
jest.mock('../db/client', () => ({ db: {} }));

const mockUseLiveRows = jest.fn();
jest.mock('../db/useLiveRows', () => ({
  useLiveRows: (build: unknown, tables: readonly string[]) => mockUseLiveRows(build, tables),
}));

const mockActions = {
  pauseFocusAction: jest.fn(),
  resumeFocusAction: jest.fn(),
  endFocusAction: jest.fn(),
  rateSessionAction: jest.fn(),
};
jest.mock('../domain/blockActions', () => ({
  pauseFocusAction: (...a: unknown[]) => mockActions.pauseFocusAction(...a),
  resumeFocusAction: (...a: unknown[]) => mockActions.resumeFocusAction(...a),
  endFocusAction: (...a: unknown[]) => mockActions.endFocusAction(...a),
  rateSessionAction: (...a: unknown[]) => mockActions.rateSessionAction(...a),
}));

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import FocusScreen, { formatElapsed } from '../../app/(tabs)/focus';
import type { FocusSessionRow } from '../db/feedback';
import type { TaskRow } from '../db/tasks';
import { en } from '../i18n/en';

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const withSafeArea = (ui: ReactElement) => (
  <SafeAreaProvider initialMetrics={initialMetrics}>{ui}</SafeAreaProvider>
);

function session(over: Partial<FocusSessionRow> = {}): FocusSessionRow {
  const startedAt = new Date(Date.now() - 5 * 60_000);
  return {
    id: 's-1',
    userId: 'local:u',
    recommendationId: 'rec-1',
    taskId: 't-1',
    state: 'running',
    startedAt,
    endedAt: null,
    focusedMs: 0,
    lastResumedAt: startedAt,
    plannedMinutes: 90,
    estMinutes: 60,
    ratedEnergy: null,
    ratedDifficulty: null,
    createdAt: startedAt,
    updatedAt: startedAt,
    ...over,
  };
}

const task: TaskRow = {
  id: 't-1',
  userId: 'local:u',
  title: 'write report',
  category: 'deep',
  estMinutes: 60,
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
};

function rows(input: { active?: FocusSessionRow[]; ended?: FocusSessionRow[] }) {
  let sessionCalls = 0;
  mockUseLiveRows.mockImplementation((_build: unknown, tables: readonly string[]) => {
    if (tables[0] === 'focus_sessions') {
      // the screen subscribes twice in order: active first, then the last ended session
      sessionCalls += 1;
      return sessionCalls % 2 === 1 ? (input.active ?? []) : (input.ended ?? []);
    }
    return [task];
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  rows({});
});

describe('Focus', () => {
  it('formats elapsed time in mm:ss and h:mm:ss', () => {
    expect(formatElapsed(0)).toBe('00:00');
    expect(formatElapsed(65_000)).toBe('01:05');
    expect(formatElapsed(3_725_000)).toBe('1:02:05');
  });

  it('shows the empty state when nothing runs and nothing is waiting for a rating', async () => {
    await render(withSafeArea(<FocusScreen />));
    expect(screen.getByText(en['focus.empty.title'])).toBeTruthy();
  });

  it('renders the running session with the task title, a progress bar, and Pause / Finish / Stop actions', async () => {
    rows({ active: [session()] });
    await render(withSafeArea(<FocusScreen />));
    expect(screen.getByText(en['focus.running'])).toBeTruthy();
    expect(screen.getByText('write report')).toBeTruthy();
    expect(screen.getByRole('progressbar')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText(en['focus.pause']));
    });
    expect(mockActions.pauseFocusAction).toHaveBeenCalledWith('s-1');
    await act(async () => {
      fireEvent.press(screen.getByText(en['focus.finish']));
    });
    expect(mockActions.endFocusAction).toHaveBeenCalledWith('s-1', 'finished');
    await act(async () => {
      fireEvent.press(screen.getByText(en['focus.abandon']));
    });
    expect(mockActions.endFocusAction).toHaveBeenCalledWith('s-1', 'abandoned');
  });

  it('offers Resume while paused', async () => {
    rows({ active: [session({ state: 'paused', lastResumedAt: null, focusedMs: 120_000 })] });
    await render(withSafeArea(<FocusScreen />));
    expect(screen.getByText(en['focus.paused'])).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText(en['focus.resume']));
    });
    expect(mockActions.resumeFocusAction).toHaveBeenCalledWith('s-1');
  });

  it('after a session ends: the 1-tap energy rating is inline with the empty state still visible, then an optional difficulty tap', async () => {
    rows({
      ended: [
        session({
          state: 'finished',
          endedAt: new Date(),
          focusedMs: 50 * 60_000,
          lastResumedAt: null,
        }),
      ],
    });
    await render(withSafeArea(<FocusScreen />));
    expect(screen.getByText(en['focus.rate.title'])).toBeTruthy();
    expect(screen.getByText(en['focus.empty.title'])).toBeTruthy(); // not modal — the screen stays usable
    await act(async () => {
      fireEvent.press(screen.getByText(en['focus.rate.high']));
    });
    expect(mockActions.rateSessionAction).toHaveBeenCalledWith('s-1', 3); // one tap already counts
    await act(async () => {
      await act(async () => {
        fireEvent.press(screen.getByText(en['focus.rate.difficulty.hard']));
      });
    });
    expect(mockActions.rateSessionAction).toHaveBeenLastCalledWith('s-1', 3, 3);
    expect(screen.getByText(en['focus.rate.thanks'])).toBeTruthy();
  });

  it('the rating can be skipped and is never shown for an already-rated session', async () => {
    rows({ ended: [session({ state: 'abandoned', endedAt: new Date(), lastResumedAt: null })] });
    await render(withSafeArea(<FocusScreen />));
    await act(async () => {
      fireEvent.press(screen.getByText(en['focus.rate.skip']));
    });
    expect(mockActions.rateSessionAction).not.toHaveBeenCalled();
    expect(screen.queryByText(en['focus.rate.title'])).toBeNull();
    rows({
      ended: [
        session({ state: 'finished', endedAt: new Date(), ratedEnergy: 2, lastResumedAt: null }),
      ],
    });
    await render(withSafeArea(<FocusScreen />));
    expect(screen.queryByText(en['focus.rate.title'])).toBeNull();
  });
});
