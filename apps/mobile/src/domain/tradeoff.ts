/**
 * FR-24 / UC-05 trade-off sheet — pure helpers over the planner's `infeasible.options`
 * (specs/07 §5: "ranked by estimated utility loss; the EF relays them to the client sheet; the
 * user's pick returns as a new /plan call with the option applied"). The client never ranks or
 * re-scores — it renders the server's order and applies the chosen option as an ordinary task
 * edit (a class-2 op), then re-plans. The sentences here are the "consequences" the spec asks
 * for, from the closed metric vocabulary; unknown metrics degrade to a generic line.
 */
import type { PlanRow } from '../db/plans';
import { t } from '../i18n';

export type TradeOffKind = 'drop' | 'shrink' | 'move_past_deadline' | 'unpin';
export const TRADEOFF_KINDS: readonly TradeOffKind[] = [
  'drop',
  'shrink',
  'move_past_deadline',
  'unpin',
];

export interface TradeOffOption {
  kind: TradeOffKind;
  task_id: string;
  delta_minutes: number | null;
  consequence: { metric: string; value: number | string };
}

function isOption(v: unknown): v is TradeOffOption {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  const c = o.consequence as Record<string, unknown> | undefined;
  return (
    typeof o.kind === 'string' &&
    (TRADEOFF_KINDS as readonly string[]).includes(o.kind) &&
    typeof o.task_id === 'string' &&
    (o.delta_minutes === null ||
      o.delta_minutes === undefined ||
      typeof o.delta_minutes === 'number') &&
    typeof c === 'object' &&
    c !== null &&
    typeof c.metric === 'string'
  );
}

/** The ranked options the edge function stored in `plans.telemetry.infeasible` (server order). */
export function infeasibleOptionsOf(plan: PlanRow | undefined): TradeOffOption[] {
  const raw = (plan?.telemetry as { infeasible?: { options?: unknown } } | null)?.infeasible
    ?.options;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isOption).map((o) => ({ ...o, delta_minutes: o.delta_minutes ?? null }));
}

export function tradeoffOptionLabel(option: TradeOffOption, title: string): string {
  switch (option.kind) {
    case 'drop':
      return t('tradeoff.option.drop', { title });
    case 'shrink':
      return t('tradeoff.option.shrink', { title, minutes: option.delta_minutes ?? 0 });
    case 'move_past_deadline':
      return t('tradeoff.option.move_past_deadline', { title });
    case 'unpin':
      return t('tradeoff.option.unpin', { title });
  }
}

export function tradeoffConsequence(option: TradeOffOption): string {
  const value = Number(option.consequence.value);
  switch (option.consequence.metric) {
    case 'value_forfeited':
      return t('tradeoff.consequence.value_forfeited', {
        value: Number.isFinite(value) ? value.toFixed(1) : '?',
      });
    case 'est_completion_drop':
      return t('tradeoff.consequence.est_completion_drop', {
        percent: Number.isFinite(value) ? Math.round(value * 100) : '?',
      });
    case 'deadline_slip_minutes':
      return t('tradeoff.consequence.deadline_slip_minutes', {
        minutes: Number.isFinite(value) ? Math.round(value) : '?',
      });
    case 'pinned_conflict':
      return t('tradeoff.consequence.pinned_conflict');
    default:
      return t('tradeoff.consequence.generic');
  }
}
