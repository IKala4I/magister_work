/**
 * Coarse "how long ago" wording for sync stamps (Settings). Deliberately coarse — a sync
 * timestamp is reassurance, not a clock — and pure, so the catalog keys are pinned by a test.
 */
import { t } from '../i18n';

export function formatRelative(atMs: number, nowMs: number = Date.now()): string {
  const diff = Math.max(0, nowMs - atMs);
  if (diff < 60_000) return t('common.justNow');
  if (diff < 3_600_000) return t('common.minutesAgo', { count: Math.floor(diff / 60_000) });
  return t('common.hoursAgo', { count: Math.floor(diff / 3_600_000) });
}
