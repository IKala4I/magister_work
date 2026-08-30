import { appStorage, StorageKeys } from '../../storage/mmkv';
import {
  isAnalyticsOptedOut,
  isCrashReportsOptedOut,
  setAnalyticsOptedOut,
  setCrashReportsOptedOut,
} from '../state';

beforeEach(() => {
  appStorage.delete(StorageKeys.analyticsOptOut);
  appStorage.delete(StorageKeys.crashReportsOptOut);
});

describe('privacy opt-out flags (ADR-0014 §12)', () => {
  it('default is on (not opted out); flags round-trip and clear', () => {
    expect(isAnalyticsOptedOut()).toBe(false);
    expect(isCrashReportsOptedOut()).toBe(false);
    setAnalyticsOptedOut(true);
    setCrashReportsOptedOut(true);
    expect(isAnalyticsOptedOut()).toBe(true);
    expect(isCrashReportsOptedOut()).toBe(true);
    setAnalyticsOptedOut(false);
    setCrashReportsOptedOut(false);
    expect(isAnalyticsOptedOut()).toBe(false);
    expect(isCrashReportsOptedOut()).toBe(false);
    expect(appStorage.getString(StorageKeys.analyticsOptOut)).toBeUndefined();
  });
});
