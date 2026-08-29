/**
 * The Insights tab's read path (P9, ADR-0013): one `insights` edge-function call (region-pinned,
 * user session) → the document is cached in MMKV so the tab renders offline and during a service
 * outage (NFR-R1: the last known beliefs are better than a spinner). The client never talks to
 * the model service (invariant 1) and never computes a belief — it renders what the server says.
 */
import { supabase } from '../auth/client';
import { type InsightsDocument, isInsightsDocument } from '../domain/heatmap';
import { appStorage, StorageKeys } from '../storage/mmkv';

import { invokeFunction } from './invoke';

export interface CachedInsights {
  doc: InsightsDocument;
  fetchedAt: number;
}

export type InsightsOutcome =
  | { kind: 'ok'; doc: InsightsDocument; fetchedAt: number }
  | { kind: 'no-session' }
  | { kind: 'offline' }
  | { kind: 'unavailable' }
  | { kind: 'profile_missing' }
  | { kind: 'failed'; detail: string };

export function cachedInsights(): CachedInsights | null {
  try {
    const raw = appStorage.getString(StorageKeys.insightsCache);
    if (raw === undefined) return null;
    const parsed = JSON.parse(raw) as { doc?: unknown; fetchedAt?: unknown };
    if (!isInsightsDocument(parsed.doc) || typeof parsed.fetchedAt !== 'number') return null;
    return { doc: parsed.doc, fetchedAt: parsed.fetchedAt };
  } catch {
    return null;
  }
}

export function clearInsightsCache(): void {
  appStorage.delete(StorageKeys.insightsCache);
}

export async function fetchInsights(now: Date = new Date()): Promise<InsightsOutcome> {
  if (!supabase) return { kind: 'no-session' };
  const { data } = await supabase.auth.getSession();
  if (!data.session) return { kind: 'no-session' };
  const res = await invokeFunction<unknown>('insights', { action: 'get' });
  if (res.kind === 'ok') {
    if (!isInsightsDocument(res.data)) return { kind: 'failed', detail: 'malformed document' };
    const cached: CachedInsights = { doc: res.data, fetchedAt: now.getTime() };
    appStorage.set(StorageKeys.insightsCache, JSON.stringify(cached));
    return { kind: 'ok', ...cached };
  }
  if (res.kind === 'offline') return { kind: 'offline' };
  if (res.kind === 'no-session') return { kind: 'no-session' };
  if (res.kind === 'http' && res.status === 503) return { kind: 'unavailable' };
  if (res.kind === 'http' && res.status === 404) return { kind: 'profile_missing' };
  return { kind: 'failed', detail: res.message };
}
