/**
 * FR-21 rationale sentences from the closed key + params vocabulary (specs/07 §5; ADR-0007
 * §10; the heuristic uses a subset — ADR-0008 §2). The server never sends free text: the
 * client owns the wording (i18n decision 6), so every key maps to a catalog entry here and an
 * unknown key degrades to the generic sentence instead of crashing the timeline.
 */
import { t, type MessageKey } from '../i18n';
import type { TaskCategory } from '../db/tasks';

const CATEGORY_KEYS: Record<TaskCategory, MessageKey> = {
  deep: 'task.category.deep',
  admin: 'task.category.admin',
  physical: 'task.category.physical',
  learning: 'task.category.learning',
};

const DAYPART_KEYS: Record<string, MessageKey> = {
  EM: 'daypart.EM',
  MO: 'daypart.MO',
  MD: 'daypart.MD',
  AF: 'daypart.AF',
  EV: 'daypart.EV',
  NT: 'daypart.NT',
};

export const RATIONALE_KEYS = [
  'pinned',
  'experiment',
  'deadline_pressure',
  'energy_peak',
  'fresh_slot',
  'earliest_feasible',
  'best_available',
] as const;
export type RationaleKey = (typeof RATIONALE_KEYS)[number];

function categoryLabel(params: Record<string, unknown>): string {
  const c = params.category;
  return typeof c === 'string' && c in CATEGORY_KEYS
    ? t(CATEGORY_KEYS[c as TaskCategory])
    : t('rationale.category.generic');
}

function daypartLabel(params: Record<string, unknown>): string {
  const d = params.daypart;
  const key = typeof d === 'string' ? DAYPART_KEYS[d] : undefined;
  return key === undefined ? t('rationale.daypart.generic') : t(key);
}

export function rationaleSentence(key: string, params: Record<string, unknown> | null): string {
  const p = params ?? {};
  switch (key as RationaleKey) {
    case 'pinned':
      return t('rationale.pinned');
    case 'experiment':
      return t('rationale.experiment', { category: categoryLabel(p), daypart: daypartLabel(p) });
    case 'deadline_pressure': {
      const hours = typeof p.hours_to_deadline === 'number' ? p.hours_to_deadline : null;
      return hours === null
        ? t('rationale.deadline_pressure.generic')
        : t('rationale.deadline_pressure', { hours: hours < 1 ? '<1' : String(Math.round(hours)) });
    }
    case 'energy_peak': {
      const factor = typeof p.factor === 'number' ? p.factor : null;
      return t('rationale.energy_peak', {
        category: categoryLabel(p),
        daypart: daypartLabel(p),
        percent: factor === null ? '' : ` (+${Math.round((factor - 1) * 100)}%)`,
      });
    }
    case 'fresh_slot':
      return t('rationale.fresh_slot', { category: categoryLabel(p), daypart: daypartLabel(p) });
    case 'earliest_feasible':
      return t('rationale.earliest_feasible', { category: categoryLabel(p) });
    case 'best_available':
      return t('rationale.best_available', {
        category: categoryLabel(p),
        daypart: daypartLabel(p),
      });
    default:
      return t('rationale.generic');
  }
}
