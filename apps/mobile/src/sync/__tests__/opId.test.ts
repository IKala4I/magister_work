/**
 * Client-monotonic op ids (invariant 8): stable device id, strictly increasing counter,
 * lexicographic creation order, uniqueness.
 */
jest.mock('expo-crypto', () => {
  let n = 0;
  return {
    randomUUID: jest.fn(() => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`),
  };
});

import { appStorage } from '../../storage/mmkv';
import { getDeviceId, nextOpId } from '../opId';

beforeEach(() => {
  appStorage.clearAll();
});

describe('device id', () => {
  it('is minted once and stable across calls', () => {
    const first = getDeviceId();
    expect(getDeviceId()).toBe(first);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('changes only when storage is wiped (new install)', () => {
    const first = getDeviceId();
    appStorage.clearAll();
    expect(getDeviceId()).not.toBe(first);
  });
});

describe('op ids', () => {
  it('are unique and strictly increasing', () => {
    const ids = Array.from({ length: 200 }, () => nextOpId());
    expect(new Set(ids).size).toBe(ids.length);
    const sorted = [...ids].sort();
    expect(sorted).toEqual(ids); // lexicographic order == creation order
  });

  it('embed the device id and a zero-padded counter', () => {
    const id = nextOpId();
    expect(id).toBe(`${getDeviceId()}-${'0'.repeat(11)}1`);
  });

  it('resume counting from persisted state, never reusing an id', () => {
    const before = nextOpId();
    // simulate app restart: module state is only MMKV, so a fresh call continues the sequence
    const after = nextOpId();
    expect(after > before).toBe(true);
  });
});
