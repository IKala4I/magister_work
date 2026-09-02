/**
 * Ephemeral plan-request UI state (Zustand — UI only, invariant: SQLite stays the source of
 * truth for the plan itself). Drives the optimistic "Planning your day…" banner (NFR-P1) and
 * the calm status lines; never persisted. The once-per-plan-day dedup key is NOT here — it
 * must survive a cold start, so it lives in MMKV (src/sync/planRequestDay.ts).
 */
import { create } from 'zustand';

export type PlanUiStatus =
  'idle' | 'planning' | 'error' | 'offline' | 'no_session' | 'rate_limited';

export type PlanUiState = {
  status: PlanUiStatus;
  /** Set when the last request found an empty inbox (UC-03 A2 copy). */
  emptyInbox: boolean;
};

export const usePlanStore = create<PlanUiState>(() => ({
  status: 'idle',
  emptyInbox: false,
}));
