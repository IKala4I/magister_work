jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));

import { formatRelative } from '../relativeTime';

describe('formatRelative', () => {
  const now = Date.parse('2026-09-01T12:00:00Z');
  it('is coarse: just now / minutes / hours', () => {
    expect(formatRelative(now - 5_000, now)).toBe('just now');
    expect(formatRelative(now - 3 * 60_000, now)).toBe('3 min ago');
    expect(formatRelative(now - 2 * 3_600_000 - 1, now)).toBe('2 h ago');
    expect(formatRelative(now + 60_000, now)).toBe('just now'); // clock skew never goes negative
  });
});
