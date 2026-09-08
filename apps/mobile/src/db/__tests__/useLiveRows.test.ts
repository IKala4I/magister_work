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

import { useLiveRows, useLiveRowsState } from '../useLiveRows';

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
  it('reads in the first render, once more after subscribing (the gap between the render read and the listener), and subscribes', async () => {
    const build = jest.fn(() => ({ all: () => [{ id: 'a' }] }));
    const { result } = await renderHook(() => useLiveRows(build, ['tasks']));
    expect(result.current).toEqual([{ id: 'a' }]);
    expect(build).toHaveBeenCalledTimes(2);
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
    expect(build).toHaveBeenCalledTimes(3);
  });

  it('builds a fresh query per refresh (never re-awaits one prepared statement)', async () => {
    const alls = [jest.fn(() => []), jest.fn(() => []), jest.fn(() => [{ id: 'a' }])];
    let call = 0;
    const build = jest.fn(() => ({ all: alls[call++]! }));
    await renderHook(() => useLiveRows(build, ['tasks']));
    await emit('tasks');
    expect(build).toHaveBeenCalledTimes(3);
    for (const all of alls) expect(all).toHaveBeenCalledTimes(1);
  });

  it('ignores change events for tables it does not watch', async () => {
    const build = jest.fn(() => ({ all: () => [] }));
    await renderHook(() => useLiveRows(build, ['tasks']));
    await emit('op_outbox');
    await emit('events');
    expect(build).toHaveBeenCalledTimes(2); // the mount's two reads, nothing since
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
    expect(build).toHaveBeenCalledTimes(2); // the mount's two reads only
  });
});

describe('useLiveRowsState — the first render carries the rows (hardware pass 2026-09-07 item 44; #15)', () => {
  it('the first render already holds the rows and is ready — no empty frame before the read', async () => {
    const seen: Array<{ rows: unknown[]; ready: boolean }> = [];
    const build = jest.fn(() => ({ all: () => [{ id: 'a' }] }));
    const { result } = await renderHook(() => {
      const state = useLiveRowsState(build, ['plans']);
      seen.push(state);
      return state;
    });
    expect(seen[0]).toEqual({ rows: [{ id: 'a' }], ready: true });
    expect(result.current).toEqual({ rows: [{ id: 'a' }], ready: true });
    // the synchronous render read, then one more once the listener is attached
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('an empty table still reports ready after the read (empty ≠ unread)', async () => {
    const build = jest.fn(() => ({ all: () => [] }));
    const { result } = await renderHook(() => useLiveRowsState(build, ['plans']));
    expect(result.current).toEqual({ rows: [], ready: true });
  });

  it('stays ready and re-reads on a watched change', async () => {
    let rows: Array<{ id: string }> = [];
    const build = jest.fn(() => ({ all: () => rows }));
    const { result } = await renderHook(() => useLiveRowsState(build, ['plans']));
    rows = [{ id: 'p1' }];
    await emit('plans');
    expect(result.current).toEqual({ rows: [{ id: 'p1' }], ready: true });
  });

  it('useLiveRows is the same subscription, rows only', async () => {
    const build = jest.fn(() => ({ all: () => [{ id: 'a' }] }));
    const { result } = await renderHook(() => useLiveRows(build, ['plans']));
    expect(result.current).toEqual([{ id: 'a' }]);
    expect(listeners).toHaveLength(1);
  });

  it("a deps change re-reads synchronously in the same render — never a frame with the previous inputs' rows (review F1e, item 44)", async () => {
    const seen: Array<{ rows: Array<{ id: string }>; ready: boolean }> = [];
    const readFor = jest.fn((user: string) => ({ all: () => [{ id: `plan-of-${user}` }] }));
    const { result, rerender } = await renderHook(
      ({ user }: { user: string }) => {
        const state = useLiveRowsState(() => readFor(user), ['plans'], [user]);
        seen.push(state);
        return state;
      },
      { initialProps: { user: 'u1' } },
    );
    expect(result.current).toEqual({ rows: [{ id: 'plan-of-u1' }], ready: true });
    seen.length = 0;
    await rerender({ user: 'u2' });
    // the render that first sees the new user already holds u2's rows
    expect(seen[0]).toEqual({ rows: [{ id: 'plan-of-u2' }], ready: true });
    expect(result.current).toEqual({ rows: [{ id: 'plan-of-u2' }], ready: true });
    expect(readFor).toHaveBeenLastCalledWith('u2');
    expect(listeners).toHaveLength(1); // the old subscription was removed, one new one
  });

  it('a re-render with the SAME inputs stays ready (element-wise comparison, not identity)', async () => {
    const build = jest.fn(() => ({ all: () => [{ id: 'a' }] }));
    const { result, rerender } = await renderHook(
      ({ day }: { day: string }) => useLiveRowsState(build, ['plans'], [day]),
      { initialProps: { day: '2026-09-02' } },
    );
    await rerender({ day: '2026-09-02' });
    expect(result.current).toEqual({ rows: [{ id: 'a' }], ready: true });
    expect(build).toHaveBeenCalledTimes(2); // the mount's two reads; a same-input re-render reads nothing
  });
});
