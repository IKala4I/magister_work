/**
 * In-app dialog request queue (ADR-0021). Ephemeral UI state in Zustand (File 03 §2.1): a screen
 * asks for a confirmation and awaits the answer; DialogHost (mounted once in the root layout)
 * renders whatever is `current`. Single slot: a request arriving while one is open resolves
 * `cancelled` at once — the two-step erasure never overlaps because step 2 is asked only after
 * step 1 resolved. Resolution is idempotent per request id (a double tap, or the Android back
 * button after a press, is a no-op).
 *
 * Hosts: RN Modal presents from the NEAREST native view controller (both renderers — adversarial
 * pass 2026-09-06), so a host beside the root Stack is refused by UIKit while a native modal
 * screen (Settings, the task sheets) is up. Every presentation context therefore mounts its own
 * DialogHost, and only the most recently mounted one renders — the registry below.
 */
import { create } from 'zustand';

export interface DialogAction {
  readonly label: string;
  readonly role: 'confirm' | 'cancel';
  /** Renders the label in `dangerText` (File 02 §3.2 danger = destructive actions). */
  readonly destructive?: boolean;
}

export interface DialogSpec {
  readonly title: string;
  readonly body: string;
  /** Rendered stacked, in order — put the confirm first and the cancel last. */
  readonly actions: readonly DialogAction[];
  readonly testID?: string;
}

export type DialogResult = 'confirmed' | 'cancelled';

export interface DialogRequest extends DialogSpec {
  readonly id: number;
  readonly resolve: (result: DialogResult) => void;
}

interface DialogState {
  current: DialogRequest | null;
  /** Mounted hosts in mount order; the last one is the active presentation context. */
  hosts: readonly number[];
}

export const useDialogStore = create<DialogState>(() => ({ current: null, hosts: [] }));

let seq = 0;
let hostSeq = 0;

/** A host's identity — allocated once per instance (pure; no store write during render). */
export function newHostId(): number {
  hostSeq += 1;
  return hostSeq;
}

export function registerHost(id: number): void {
  useDialogStore.setState((s) => ({ hosts: [...s.hosts.filter((h) => h !== id), id] }));
}

export function unregisterHost(id: number): void {
  useDialogStore.setState((s) => ({ hosts: s.hosts.filter((h) => h !== id) }));
}

export function activeHostId(hosts: readonly number[]): number | null {
  return hosts.length === 0 ? null : (hosts[hosts.length - 1] ?? null);
}

export function requestDialog(spec: DialogSpec): Promise<DialogResult> {
  return new Promise((resolve) => {
    if (useDialogStore.getState().current !== null) {
      // never stack: the open dialog keeps the screen; the newcomer is answered as a cancel
      resolve('cancelled');
      return;
    }
    seq += 1;
    useDialogStore.setState({ current: { ...spec, id: seq, resolve } });
  });
}

/** Answer the open request `id`; ignored when it is no longer the current one. */
export function resolveDialog(id: number, result: DialogResult): void {
  const current = useDialogStore.getState().current;
  if (current === null || current.id !== id) return;
  useDialogStore.setState({ current: null });
  current.resolve(result);
}

export interface ConfirmOptions {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  /** The confirm action is destructive (label in `dangerText`). */
  readonly destructive?: boolean;
  readonly testID?: string;
}

/** The two-action confirmation every current site uses. Resolves true only on the confirm. */
export async function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  const result = await requestDialog({
    title: options.title,
    body: options.body,
    testID: options.testID,
    actions: [
      { label: options.confirmLabel, role: 'confirm', destructive: options.destructive === true },
      { label: options.cancelLabel, role: 'cancel' },
    ],
  });
  return result === 'confirmed';
}
