/**
 * Pull-cursor semantics (invariant 8): max-only advance, idempotent on replay, explicit
 * reset. MMKV is the in-memory test double (moduleNameMapper).
 */
import { appStorage } from '../../storage/mmkv';
import { getSyncCursor, advanceSyncCursor, resetSyncCursor } from '../cursor';

beforeEach(() => {
  appStorage.clearAll();
});

describe('sync cursor', () => {
  it('starts at 0 (never synced)', () => {
    expect(getSyncCursor()).toBe(0);
  });

  it('advances to the max server_seq seen', () => {
    expect(advanceSyncCursor(41)).toBe(41);
    expect(advanceSyncCursor(97)).toBe(97);
    expect(getSyncCursor()).toBe(97);
  });

  it('never rewinds: replaying an older pull is a no-op', () => {
    advanceSyncCursor(97);
    expect(advanceSyncCursor(41)).toBe(97);
    expect(advanceSyncCursor(97)).toBe(97);
    expect(getSyncCursor()).toBe(97);
  });

  it('rejects non-integers, negatives, and unsafe integers', () => {
    expect(() => advanceSyncCursor(1.5)).toThrow(RangeError);
    expect(() => advanceSyncCursor(-1)).toThrow(RangeError);
    expect(() => advanceSyncCursor(Number.MAX_SAFE_INTEGER + 2)).toThrow(RangeError);
    expect(() => advanceSyncCursor(Number.NaN)).toThrow(RangeError);
    expect(getSyncCursor()).toBe(0);
  });

  it('reset returns to the never-synced state', () => {
    advanceSyncCursor(12);
    resetSyncCursor();
    expect(getSyncCursor()).toBe(0);
  });
});
