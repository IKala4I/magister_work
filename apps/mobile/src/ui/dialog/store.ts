/**
 * In-app dialog request queue (ADR-0021). Ephemeral UI state in Zustand (File 03 §2.1): a screen
 * asks for a confirmation and awaits the answer; DialogHost (mounted once in the root layout)
 * renders whatever is `current`. Single slot: a request arriving while one is open resolves
 * `cancelled` at once — the two-step erasure never overlaps because step 2 is asked only after
 * step 1 resolved. Resolution is idempotent per request id (a double tap, or the Android back
 * button after a press, is a no-op).
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
}

export const useDialogStore = create<DialogState>(() => ({ current: null }));

let seq = 0;

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
