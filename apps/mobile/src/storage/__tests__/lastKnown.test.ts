/**
 * The last-known tri-state (hardware pass 2026-09-07 item 44): a reading persisted by name,
 * account-scoped when it is account data, read back on the next open before the fetch resolves.
 */
import { forgetLastKnown, readLastKnown, writeLastKnown } from '../lastKnown';

function memStore() {
  const map = new Map<string, string>();
  return {
    map,
    getString: (k: string) => map.get(k),
    set: (k: string, v: string) => void map.set(k, v),
    delete: (k: string) => void map.delete(k),
  };
}

describe('readLastKnown / writeLastKnown / forgetLastKnown', () => {
  it('nothing known reads as null; a reading round-trips; a corrupt value reads as null', () => {
    const store = memStore();
    expect(readLastKnown('permission', null, store)).toBeNull();
    writeLastKnown('permission', 'granted', null, store);
    expect(readLastKnown('permission', null, store)).toBe('granted');
    store.set('lastKnown.permission', '{not json');
    expect(readLastKnown('permission', null, store)).toBeNull();
  });

  it('account-scoped readings never leak between accounts and are forgotten per account', () => {
    const store = memStore();
    writeLastKnown('gcal', { connected: true }, 'user-a', store);
    expect(readLastKnown('gcal', 'user-a', store)).toEqual({ connected: true });
    expect(readLastKnown('gcal', 'user-b', store)).toBeNull();
    expect(readLastKnown('gcal', null, store)).toBeNull();
    forgetLastKnown('gcal', 'user-a', store);
    expect(readLastKnown('gcal', 'user-a', store)).toBeNull();
  });
});
