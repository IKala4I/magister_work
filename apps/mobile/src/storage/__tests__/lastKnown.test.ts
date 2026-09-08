/**
 * The last-known tri-state (hardware pass 2026-09-07 item 44): the first render carries the
 * last persisted reading, the fetch refreshes and persists, `null` from the fetch never erases.
 */
import { act, renderHook } from '@testing-library/react-native';

import { forgetLastKnown, readLastKnown, useLastKnown, writeLastKnown } from '../lastKnown';

function memStore() {
  const map = new Map<string, string>();
  return {
    map,
    getString: (k: string) => map.get(k),
    set: (k: string, v: string) => void map.set(k, v),
    delete: (k: string) => void map.delete(k),
  };
}

describe('useLastKnown', () => {
  it('starts from nothing known, persists the first reading, and serves it on the next mount before the fetch resolves', async () => {
    const store = memStore();
    let resolve: (v: { connected: boolean }) => void = () => undefined;
    const fetch = jest.fn(() => new Promise<{ connected: boolean }>((r) => (resolve = r)));
    const seen: Array<{ connected: boolean } | null> = [];
    const first = await renderHook(() => {
      const [v] = useLastKnown('gcal', fetch, store);
      seen.push(v);
      return v;
    });
    expect(seen[0]).toBeNull();
    await act(async () => resolve({ connected: true }));
    expect(first.result.current).toEqual({ connected: true });
    expect(readLastKnown('gcal', store)).toEqual({ connected: true });
    await first.unmount();
    // the next open: the persisted reading is there on the FIRST render
    const pending = jest.fn(() => new Promise<{ connected: boolean }>(() => undefined));
    const seen2: Array<{ connected: boolean } | null> = [];
    await renderHook(() => {
      const [v] = useLastKnown('gcal', pending, store);
      seen2.push(v);
      return v;
    });
    expect(seen2[0]).toEqual({ connected: true });
  });

  it('a fetch that resolves null keeps the last reading; refresh re-fetches; forget clears', async () => {
    const store = memStore();
    writeLastKnown('permission', 'granted', store);
    let answer: string | null = null;
    const fetch = jest.fn(() => Promise.resolve(answer));
    const seen: Array<string | null> = [];
    const { result } = await renderHook(() => {
      const state = useLastKnown<string>('permission', fetch, store);
      seen.push(state[0]);
      return state;
    });
    expect(seen[0]).toBe('granted'); // the FIRST render, from the persisted reading
    expect(result.current[0]).toBe('granted'); // the null fetch did not erase it
    answer = 'denied';
    await act(async () => {
      result.current[1]();
    });
    expect(result.current[0]).toBe('denied');
    expect(readLastKnown('permission', store)).toBe('denied');
    forgetLastKnown('permission', store);
    expect(readLastKnown('permission', store)).toBeNull();
  });
});
