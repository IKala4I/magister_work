/**
 * Ephemeral sync UI state (Zustand — UI only; SQLite/MMKV hold the truth: the outbox, the cursor,
 * the last-sync stamp). Drives the Settings sync section, the Today notices that File 05 §2
 * shows as toasts, and the deferred-wipe banner (ADR-0012 §11).
 */
import { create } from 'zustand';

export type SyncUiStatus = 'idle' | 'syncing' | 'offline' | 'no_session' | 'error';

export type SyncNotice =
  { kind: 'meeting_kept'; at: number } | { kind: 'displaced'; count: number; at: number };

export interface SyncUiState {
  status: SyncUiStatus;
  /** Epoch ms of the last completed round trip (null = never on this install). */
  lastSyncAt: number | null;
  /** Unacked ops for the signed-in identity after the last sync. */
  pendingOps: number;
  notice: SyncNotice | null;
  /** A previous account left unacked changes on this device (deferred wipe, ADR-0012 §11). */
  pendingWipe: { userId: string; ops: number } | null;
}

export const useSyncStore = create<SyncUiState>(() => ({
  status: 'idle',
  lastSyncAt: null,
  pendingOps: 0,
  notice: null,
  pendingWipe: null,
}));
