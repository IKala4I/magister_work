/**
 * SDK opt-outs (ADR-0014 §12; NFR-S2): two MMKV flags read at init. Analytics stops at once
 * (the client is dropped); crash reporting follows at the next launch (Sentry is initialised
 * before React renders). Defaults keep the study's instrumentation on — the consent clause
 * discloses it and the toggles are one tap away in Settings → Privacy.
 */
import { appStorage, StorageKeys } from '../storage/mmkv';

export function isAnalyticsOptedOut(): boolean {
  return appStorage.getString(StorageKeys.analyticsOptOut) === '1';
}

export function isCrashReportsOptedOut(): boolean {
  return appStorage.getString(StorageKeys.crashReportsOptOut) === '1';
}

export function setAnalyticsOptedOut(optedOut: boolean): void {
  if (optedOut) appStorage.set(StorageKeys.analyticsOptOut, '1');
  else appStorage.delete(StorageKeys.analyticsOptOut);
}

export function setCrashReportsOptedOut(optedOut: boolean): void {
  if (optedOut) appStorage.set(StorageKeys.crashReportsOptOut, '1');
  else appStorage.delete(StorageKeys.crashReportsOptOut);
}
