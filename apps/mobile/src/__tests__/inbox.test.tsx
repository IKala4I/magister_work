/**
 * Inbox interaction tests (FR-10/FR-11 UI half): live rows render; NL quick-add submits
 * the parsed draft with quick_add provenance; delete shows the 6 s undo window whose
 * Undo restores and whose expiry is exactly UNDO_WINDOW_MS (File 02 §3 undoable rule).
 * DB and actions are mocked — the write path itself is covered in src/db/__tests__.
 */
jest.mock('../db/client', () => {
  const chain: Record<string, unknown> = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
  };
  return { db: { select: () => chain } };
});

const mockUseLiveQuery = jest.fn();
jest.mock('drizzle-orm/expo-sqlite', () => ({
  useLiveQuery: (...args: unknown[]) => mockUseLiveQuery(...args),
}));

jest.mock('../domain/taskActions', () => ({
  createTaskAction: jest.fn(),
  updateTaskAction: jest.fn(),
  deleteTaskAction: jest.fn(),
  restoreTaskAction: jest.fn(),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));

import { render, fireEvent, screen, act } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ReactElement } from 'react';

import InboxScreen from '../../app/(tabs)/inbox';
import type { TaskRow } from '../db/tasks';
import { createTaskAction, deleteTaskAction, restoreTaskAction } from '../domain/taskActions';
import { en } from '../i18n/en';

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function withSafeArea(ui: ReactElement) {
  return <SafeAreaProvider initialMetrics={initialMetrics}>{ui}</SafeAreaProvider>;
}

function taskRow(overrides: Partial<TaskRow>): TaskRow {
  return {
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
    status: 'inbox',
    doneAt: null,
    postponeCount: 0,
    deletedAt: null,
    version: 1,
    createdAt: new Date(2026, 7, 24, 9, 0),
    updatedAt: new Date(2026, 7, 24, 9, 0),
    serverSeq: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseLiveQuery.mockReturnValue({ data: [] });
});

describe('inbox list', () => {
  it('shows the empty state with no tasks', async () => {
    await render(withSafeArea(<InboxScreen />));
    expect(screen.getByText(en['inbox.empty.title'])).toBeTruthy();
  });

  it('renders live rows and opens the edit sheet on tap', async () => {
    mockUseLiveQuery.mockReturnValue({
      data: [taskRow({ id: 'a', title: 'write report' }), taskRow({ id: 'b', title: 'call bank' })],
    });
    await render(withSafeArea(<InboxScreen />));
    expect(screen.getByText('write report')).toBeTruthy();
    expect(screen.getByText('call bank')).toBeTruthy();
    await fireEvent.press(screen.getByText('write report'));
    expect(mockPush).toHaveBeenCalledWith('/task/a');
  });
});

describe('quick add (FR-11)', () => {
  it('submits the parsed draft with quick_add provenance', async () => {
    await render(withSafeArea(<InboxScreen />));
    const input = screen.getByLabelText(en['inbox.quickAdd.input.a11y']);
    await fireEvent.changeText(input, 'report draft 2h');
    await fireEvent.press(screen.getByLabelText(en['inbox.quickAdd.add']));
    expect(createTaskAction).toHaveBeenCalledTimes(1);
    const [draft, meta] = (createTaskAction as jest.Mock).mock.calls[0];
    expect(draft).toMatchObject({
      title: 'report draft',
      estMinutes: 120,
      category: 'admin',
      value: 2,
      splittable: false,
      deadline: null,
    });
    expect(meta).toEqual({ source: 'quick_add', nlParseUsed: true });
  });

  it('does not submit when only structure was typed (no title)', async () => {
    await render(withSafeArea(<InboxScreen />));
    const input = screen.getByLabelText(en['inbox.quickAdd.input.a11y']);
    await fireEvent.changeText(input, '2h');
    await fireEvent.press(screen.getByLabelText(en['inbox.quickAdd.add']));
    expect(createTaskAction).not.toHaveBeenCalled();
    expect(screen.getByText(en['inbox.quickAdd.noTitleHint'])).toBeTruthy();
  });
});

describe('delete with undo (File 02 §3 — 6 s window)', () => {
  it('delete soft-deletes immediately; Undo restores', async () => {
    mockUseLiveQuery.mockReturnValue({ data: [taskRow({ id: 'a', title: 'write report' })] });
    await render(withSafeArea(<InboxScreen />));
    await fireEvent.press(screen.getByLabelText('Delete write report'));
    expect(deleteTaskAction).toHaveBeenCalledWith('a');
    expect(screen.getByText(en['inbox.undo.deleted'])).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(en['inbox.undo.action']));
    expect(restoreTaskAction).toHaveBeenCalledWith('a');
    expect(screen.queryByText(en['inbox.undo.deleted'])).toBeNull();
  });

  it('the undo window closes by itself after 6 seconds', async () => {
    jest.useFakeTimers();
    try {
      mockUseLiveQuery.mockReturnValue({ data: [taskRow({ id: 'a', title: 'write report' })] });
      await render(withSafeArea(<InboxScreen />));
      await fireEvent.press(screen.getByLabelText('Delete write report'));
      expect(screen.getByText(en['inbox.undo.deleted'])).toBeTruthy();
      await act(async () => {
        jest.advanceTimersByTime(6000);
      });
      expect(screen.queryByText(en['inbox.undo.deleted'])).toBeNull();
      expect(restoreTaskAction).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
