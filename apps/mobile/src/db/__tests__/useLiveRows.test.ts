/**
 * useLiveRows (the reactive read path that replaced drizzle's useLiveQuery on this stack —
 * see the module docstring and docs/verification/p3-manual-verification.md for the on-device
 * evidence). Pins the contract the Inbox depends on: read once on mount, re-read on a
 * change event for a watched table, ignore other tables, build a FRESH query each refresh
 * (a re-awaited prepared statement is exactly what failed before), and unsubscribe on
 * unmount so a backgrounded screen cannot keep querying.
 */
type ChangeListener = (event: { tableName: string }) => void;

const listeners: ChangeListener[] = [];
const mockRemove = jest.fn();

// remove() actually detaches, like the real expo-sqlite subscription — otherwise an
// unmounted screen's listener keeps firing into the next test.
jest.mock('expo-sqlite', () => ({
  addDatabaseChangeListener: (listener: ChangeListener) => {
    listeners.push(listener);
    return {
      remove: () => {
        mockRemove();
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      },
    };
  },
}));

import { act, renderHook } from '@testing-library/react-native';

import { useLiveRows } from '../useLiveRows';

/** RNTL v14 / React 19: state updates flush only inside an awaited async act. */
async function emit(tableName: string): Promise<void> {
  await act(async () => {
    for (const listener of [...listeners]) listener({ tableName });
  });
}

beforeEach(() => {
  listeners.length = 0;
  jest.clearAllMocks();
});

describe('useLiveRows', () => {
  it('reads once on mount and subscribes', async () => {
    const build = jest.fn(() => ({ all: () => [{ id: 'a' }] }));
    const { result } = await renderHook(() => useLiveRows(build, ['tasks']));
    expect(result.current).toEqual([{ id: 'a' }]);
    expect(build).toHaveBeenCalledTimes(1);
    expect(listeners).toHaveLength(1);
  });

  it('re-reads when a watched table changes', async () => {
    let rows = [{ id: 'a' }];
    const build = jest.fn(() => ({ all: () => rows }));
    const { result } = await renderHook(() => useLiveRows(build, ['tasks']));
    expect(result.current).toEqual([{ id: 'a' }]);

    rows = [{ id: 'a' }, { id: 'b' }];
    await emit('tasks');
    expect(result.current).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('builds a fresh query per refresh (never re-awaits one prepared statement)', async () => {
    const alls = [jest.fn(() => []), jest.fn(() => [{ id: 'a' }])];
    let call = 0;
    const build = jest.fn(() => ({ all: alls[call++]! }));
    await renderHook(() => useLiveRows(build, ['tasks']));
    await emit('tasks');
    expect(build).toHaveBeenCalledTimes(2);
    expect(alls[0]).toHaveBeenCalledTimes(1);
    expect(alls[1]).toHaveBeenCalledTimes(1);
  });

  it('ignores change events for tables it does not watch', async () => {
    const build = jest.fn(() => ({ all: () => [] }));
    await renderHook(() => useLiveRows(build, ['tasks']));
    await emit('op_outbox');
    await emit('events');
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('refreshes from an empty result set (the failure mode that broke the Inbox)', async () => {
    let rows: Array<{ id: string }> = [];
    const build = jest.fn(() => ({ all: () => rows }));
    const { result } = await renderHook(() => useLiveRows(build, ['tasks']));
    expect(result.current).toEqual([]);
    rows = [{ id: 'first' }];
    await emit('tasks');
    expect(result.current).toEqual([{ id: 'first' }]);
  });

  it('unsubscribes on unmount and stops reading', async () => {
    const build = jest.fn(() => ({ all: () => [] }));
    const { unmount } = await renderHook(() => useLiveRows(build, ['tasks']));
    await unmount();
    expect(mockRemove).toHaveBeenCalledTimes(1);
    await emit('tasks');
    expect(build).toHaveBeenCalledTimes(1); // mount read only
  });
});
