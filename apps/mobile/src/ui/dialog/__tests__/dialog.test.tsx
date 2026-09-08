/**
 * The in-app dialog (ADR-0021; NFR-A1 / NFR-A2). What a screen reader, the Android back button
 * and the OS motion setting would meet is pinned here: roles and labels, every way out resolving
 * as a cancel except the confirm, the destructive label in `dangerText`, one announcement + focus
 * on show, the spring entrance settling under the 250 ms cap, and the same code path collapsing
 * to an instant show/hide under reduced motion.
 */
const mockMotion = { reduced: false };
jest.mock('../../useReducedMotion', () => ({ useReducedMotion: () => mockMotion.reduced }));

import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { getAnimatedStyle } from 'react-native-reanimated';

import {
  DIALOG_ARM_DELAY_MS,
  DIALOG_ENTER_SCALE,
  DIALOG_EXIT_GRACE_MS,
  DIALOG_FOCUS_DELAY_MS,
  DialogHost,
} from '../DialogHost';
import { confirmDialog, requestDialog, useDialogStore } from '../store';
import { lightColors } from '../../tokens/colors';
import { MOTION_MAX_MS, springs } from '../../tokens/motion';

function flatStyle(node: { props: { style?: unknown } }): Record<string, unknown> {
  return Object.assign({}, ...[node.props.style].flat(Infinity));
}

const spec = {
  title: 'Delete your account?',
  body: 'Everything goes.',
  confirmLabel: 'Delete everything',
  cancelLabel: 'Keep my account',
};

beforeEach(() => {
  mockMotion.reduced = false;
  useDialogStore.setState({ current: null, hosts: [] });
});

/**
 * A destructive confirm ignores presses for DIALOG_ARM_DELAY_MS after its request; the host reads
 * that window through `Date.now`. The tests pin that clock — frozen at the request, moved past the
 * window by `armed()` — so a slow runner cannot arm the dialog before the "too early" press (the CI
 * failure of 2026-09-06: 400 ms of real time had passed between the request and the first press).
 */
const clock = { now: 0, spy: null as jest.SpyInstance<number, []> | null };
function freezeClock() {
  clock.now = Date.now();
  clock.spy ??= jest.spyOn(Date, 'now').mockImplementation(() => clock.now);
}
afterEach(() => {
  clock.spy?.mockRestore();
  clock.spy = null;
});
const armed = () =>
  act(async () => {
    clock.now += DIALOG_ARM_DELAY_MS + 1;
  });

describe('DialogHost — roles, labels, outcomes (NFR-A1)', () => {
  it('renders nothing until asked, then the title as a header, the body, and the actions as buttons', async () => {
    await render(<DialogHost />);
    expect(screen.queryByTestId('dialog')).toBeNull();
    let answer: boolean | undefined;
    await act(async () => {
      freezeClock();
      void confirmDialog({ ...spec, destructive: true, testID: 'dialog-t' }).then((ok) => {
        answer = ok;
      });
    });
    expect(screen.getByTestId('dialog-t')).toBeTruthy();
    expect(screen.getByRole('header', { name: spec.title })).toBeTruthy();
    expect(screen.getByText(spec.body)).toBeTruthy();
    const confirm = screen.getByRole('button', { name: spec.confirmLabel });
    const cancel = screen.getByRole('button', { name: spec.cancelLabel });
    expect(confirm).toBeTruthy();
    expect(cancel).toBeTruthy();
    // confirm first, cancel last — stacked, never side by side
    const actions = screen.getByTestId('dialog-actions');
    expect(flatStyle(actions).flexDirection).toBeUndefined();
    expect(actions.props.children).toHaveLength(2);
    // a destructive confirm is not armed yet: a press inside the window is ignored
    await act(async () => {
      fireEvent.press(confirm);
    });
    expect(answer).toBeUndefined();
    await armed();
    await act(async () => {
      fireEvent.press(confirm);
    });
    expect(answer).toBe(true);
  });

  it('a neutral confirm needs no arming; a destructive one ignores presses for the arming window only', async () => {
    await render(<DialogHost />);
    let neutral: boolean | undefined;
    await act(async () => {
      void confirmDialog({ ...spec, confirmLabel: 'Continue' }).then((ok) => {
        neutral = ok;
      });
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    });
    expect(neutral).toBe(true);
    let destructive: boolean | undefined;
    await act(async () => {
      freezeClock();
      void confirmDialog({ ...spec, destructive: true }).then((ok) => {
        destructive = ok;
      });
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: spec.confirmLabel }));
    });
    expect(destructive).toBeUndefined(); // the double tap that would land on "Delete everything"
    await armed();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: spec.confirmLabel }));
    });
    expect(destructive).toBe(true);
  });

  it('the cancel button, the Android back button, the scrim, the VoiceOver escape and a native dismissal all resolve as a cancel — never as the destructive branch', async () => {
    await render(<DialogHost />);
    for (const way of ['cancel', 'back', 'scrim', 'escape', 'dismiss'] as const) {
      let answer: boolean | undefined;
      await act(async () => {
        freezeClock();
        void confirmDialog({ ...spec, destructive: true }).then((ok) => {
          answer = ok;
        });
      });
      await act(async () => {
        if (way === 'cancel')
          fireEvent.press(screen.getByRole('button', { name: spec.cancelLabel }));
        else if (way === 'back') fireEvent(screen.getByTestId('dialog'), 'requestClose');
        else if (way === 'escape')
          fireEvent(screen.getByTestId('dialog-card'), 'accessibilityAction', {
            nativeEvent: { actionName: 'escape' },
          });
        else if (way === 'dismiss') fireEvent(screen.getByTestId('dialog'), 'dismiss');
        else fireEvent.press(screen.getByTestId('dialog-scrim', { includeHiddenElements: true }));
      });
      expect(answer).toBe(false);
      expect(useDialogStore.getState().current).toBeNull();
    }
  });

  it('the scrim is not an accessibility element; the card is modal for VoiceOver', async () => {
    await render(<DialogHost />);
    await act(async () => {
      void confirmDialog(spec);
    });
    // hidden from the accessibility tree: the default query (a11y-visible elements) cannot see it
    expect(screen.queryByTestId('dialog-scrim')).toBeNull();
    const scrim = screen.getByTestId('dialog-scrim', { includeHiddenElements: true });
    expect(scrim.props.accessible).toBe(false);
    expect(scrim.props.importantForAccessibility).toBe('no');
    expect(scrim.props.accessibilityElementsHidden).toBe(true);
    expect(screen.getByTestId('dialog-card').props.accessibilityViewIsModal).toBe(true);
  });

  it('destructive labels use dangerText; a neutral confirm uses primary; the cancel is primary text too', async () => {
    await render(<DialogHost />);
    await act(async () => {
      freezeClock();
      void confirmDialog({ ...spec, destructive: true });
    });
    const label = (name: string) => flatStyle(screen.getByText(name));
    expect(label(spec.confirmLabel).color).toBe(lightColors.dangerText);
    expect(label(spec.cancelLabel).color).toBe(lightColors.primary);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: spec.cancelLabel }));
    });
    await act(async () => {
      void confirmDialog({ ...spec, confirmLabel: 'Continue' });
    });
    expect(label('Continue').color).toBe(lightColors.primary);
  });

  it('moves accessibility focus to the title once per request — the first via onShow, a replacement (erasure step 2) after the delay, never twice, never an extra announcement', async () => {
    jest.useFakeTimers();
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
    const send = jest
      .spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
      .mockImplementation(() => undefined);
    // the preset's AccessibilityInfo is already a jest.fn: drop the calls of earlier tests
    announce.mockClear();
    send.mockClear();
    try {
      await render(<DialogHost />);
      await act(async () => {
        void confirmDialog({ ...spec, confirmLabel: 'Continue' });
      });
      await act(async () => {
        fireEvent(screen.getByTestId('dialog'), 'show');
      });
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[1]).toBe('focus');
      // the delayed path must not focus the same request again
      await act(async () => {
        jest.advanceTimersByTime(DIALOG_FOCUS_DELAY_MS * 2);
      });
      expect(send).toHaveBeenCalledTimes(1);
      // step 2 replaces the content while the Modal stays visible: onShow never fires again
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
      });
      await act(async () => {
        void confirmDialog({ ...spec, title: 'This cannot be undone', destructive: true });
      });
      expect(send).toHaveBeenCalledTimes(1);
      await act(async () => {
        jest.advanceTimersByTime(DIALOG_FOCUS_DELAY_MS * 2);
      });
      expect(send).toHaveBeenCalledTimes(2);
      expect(announce).not.toHaveBeenCalled();
    } finally {
      announce.mockRestore();
      send.mockRestore();
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    }
  });

  it('only the most recently mounted host renders (a native modal screen is its own presentation context); unmounting it hands the open dialog back', async () => {
    const { unmount: unmountSheet } = await render(<DialogHost />);
    await render(<DialogHost />);
    expect(useDialogStore.getState().hosts).toHaveLength(2);
    await act(async () => {
      void confirmDialog(spec);
    });
    expect(screen.getAllByTestId('dialog')).toHaveLength(1);
    await unmountSheet();
    expect(useDialogStore.getState().hosts).toHaveLength(1);
    await act(async () => {});
    expect(screen.getAllByTestId('dialog')).toHaveLength(1);
    expect(useDialogStore.getState().current).not.toBeNull();
  });

  it('a second request while one is open is answered as a cancel at once; the open one keeps the screen', async () => {
    await render(<DialogHost />);
    let first: string | undefined;
    let second: string | undefined;
    await act(async () => {
      void requestDialog({
        title: 'A',
        body: 'a',
        actions: [
          { label: 'Yes', role: 'confirm' },
          { label: 'No', role: 'cancel' },
        ],
      }).then((r) => {
        first = r;
      });
      void requestDialog({
        title: 'B',
        body: 'b',
        actions: [
          { label: 'Ok', role: 'confirm' },
          { label: 'Nah', role: 'cancel' },
        ],
      }).then((r) => {
        second = r;
      });
    });
    expect(second).toBe('cancelled');
    expect(first).toBeUndefined();
    expect(screen.getByRole('header', { name: 'A' })).toBeTruthy();
    expect(screen.queryByText('B')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Yes' }));
    });
    expect(first).toBe('confirmed');
  });

  it('a double press resolves once (the second press is a no-op on a request that is gone)', async () => {
    await render(<DialogHost />);
    const resolve = jest.fn();
    await act(async () => {
      void confirmDialog(spec).then(resolve);
    });
    const confirm = screen.getByRole('button', { name: spec.confirmLabel });
    await armed();
    await act(async () => {
      fireEvent.press(confirm);
    });
    // the same button instance is still mounted while the card fades out — press it again
    await act(async () => {
      fireEvent.press(confirm);
    });
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('the body scrolls inside the card (200 % text never pushes the actions off screen — NFR-A2)', async () => {
    await render(<DialogHost />);
    await act(async () => {
      void confirmDialog(spec);
    });
    const card = screen.getByTestId('dialog-card');
    const scroll = screen.getByTestId('dialog-body-scroll');
    expect(scroll.type).toBe('RCTScrollView'); // a real ScrollView, as the Settings reachability test asserts
    expect(within(scroll).getByText(spec.body)).toBeTruthy();
    expect(flatStyle(card).maxHeight).toBe('80%');
  });
});

describe('DialogHost — motion (File 02 §3.4, NFR-A2)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  const FRAME_MS = 17;
  type Motion = { opacity: number; transform: { scale: number }[] };
  const cardStyle = () => getAnimatedStyle(screen.getByTestId('dialog-card')) as Motion;

  it('springs in on springs.standard and settles under the 250 ms cap; the exit keeps the card until springs.fast settles', async () => {
    expect(springs.standard.duration).toBeLessThanOrEqual(MOTION_MAX_MS);
    expect(springs.fast.duration).toBeLessThanOrEqual(MOTION_MAX_MS);
    await render(<DialogHost />);
    await act(async () => {
      void confirmDialog(spec);
    });
    // first frame: the spring has started from the settle pose, far from done
    await act(async () => {
      jest.advanceTimersByTime(FRAME_MS);
    });
    const first = cardStyle();
    expect(first.opacity).toBeGreaterThan(0);
    expect(first.opacity).toBeLessThan(0.5);
    expect(first.transform[0]?.scale).toBeGreaterThanOrEqual(DIALOG_ENTER_SCALE);
    expect(first.transform[0]?.scale).toBeLessThan(1);
    await act(async () => {
      jest.advanceTimersByTime(MOTION_MAX_MS - FRAME_MS);
    });
    const settled = cardStyle();
    expect(settled.opacity).toBeCloseTo(1, 1);
    expect(settled.transform[0]?.scale).toBeCloseTo(1, 1);
    // a second request while the first is open is answered as a cancel at once (single slot)
    let intruder: boolean | undefined;
    await act(async () => {
      void confirmDialog(spec).then((ok) => {
        intruder = ok;
      });
    });
    expect(intruder).toBe(false);
    // the real answer arrives on the press; the card is still there while it fades out
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: spec.cancelLabel }));
    });
    expect(useDialogStore.getState().current).toBeNull();
    expect(screen.getByTestId('dialog')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(FRAME_MS);
    });
    expect(screen.getByTestId('dialog')).toBeTruthy();
    expect(cardStyle().opacity).toBeLessThan(1);
    await act(async () => {
      jest.advanceTimersByTime(springs.fast.duration * 3);
    });
    expect(screen.queryByTestId('dialog')).toBeNull();
  });

  it('a replacement while the card is up springs on from where it is — no reset to 0 (no blink)', async () => {
    await render(<DialogHost />);
    await act(async () => {
      void confirmDialog({ ...spec, confirmLabel: 'Continue' });
    });
    await act(async () => {
      jest.advanceTimersByTime(MOTION_MAX_MS);
    });
    expect(cardStyle().opacity).toBeCloseTo(1, 1);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    });
    await act(async () => {
      void confirmDialog({ ...spec, title: 'Step two', destructive: true });
    });
    await act(async () => {
      jest.advanceTimersByTime(FRAME_MS);
    });
    expect(screen.getByRole('header', { name: 'Step two' })).toBeTruthy();
    expect(cardStyle().opacity).toBeGreaterThan(0.9);
  });

  it('a request arriving mid-exit cancels the exit and shows at once', async () => {
    await render(<DialogHost />);
    await act(async () => {
      void confirmDialog(spec);
    });
    await act(async () => {
      jest.advanceTimersByTime(MOTION_MAX_MS);
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: spec.cancelLabel }));
    });
    await act(async () => {
      jest.advanceTimersByTime(FRAME_MS);
    });
    await act(async () => {
      void confirmDialog({ ...spec, title: 'Second' });
    });
    await act(async () => {
      jest.advanceTimersByTime(springs.fast.duration * 3 + MOTION_MAX_MS);
    });
    expect(screen.getByRole('header', { name: 'Second' })).toBeTruthy();
    expect(cardStyle().opacity).toBeCloseTo(1, 1);
  });

  it('under reduced motion the same path is instant: fully shown on the first frame, gone on the press', async () => {
    mockMotion.reduced = true;
    await render(<DialogHost />);
    await act(async () => {
      void confirmDialog(spec);
    });
    await act(async () => {
      jest.advanceTimersByTime(FRAME_MS);
    });
    const first = cardStyle();
    expect(first.opacity).toBe(1);
    expect(first.transform[0]?.scale).toBe(1);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: spec.cancelLabel }));
    });
    // invisible at once; the Modal itself is torn down after the exit grace (below)
    expect(cardStyle().opacity).toBe(0);
    expect(screen.queryByTestId('dialog')).not.toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(DIALOG_EXIT_GRACE_MS);
    });
    expect(screen.queryByTestId('dialog')).toBeNull();
  });

  it('under reduced motion a replacement right after the confirm keeps the one Modal mounted — never an unmount + mount, which iOS drops mid-dismissal (hardware pass 2026-09-07 items 24, 36)', async () => {
    mockMotion.reduced = true;
    await render(<DialogHost />);
    let stepTwo: Promise<boolean> | null = null;
    await act(async () => {
      // the erasure flow: step 1 confirmed → (await) → step 2 requested in the next tick
      void confirmDialog({ ...spec, confirmLabel: 'Continue' }).then((ok) => {
        if (ok) stepTwo = confirmDialog({ ...spec, title: 'Step two', destructive: true });
      });
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    });
    // step 1 is answered; the Modal is still in the tree while the grace runs
    expect(screen.queryByTestId('dialog')).not.toBeNull();
    await act(async () => {
      await Promise.resolve();
    });
    expect(stepTwo).not.toBeNull();
    expect(screen.getByRole('header', { name: 'Step two' })).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(FRAME_MS); // one frame, well inside the grace
    });
    expect(cardStyle().opacity).toBe(1);
    await act(async () => {
      jest.advanceTimersByTime(DIALOG_EXIT_GRACE_MS * 2);
    });
    // the grace timer found a newer request and left the Modal alone
    expect(screen.getByRole('header', { name: 'Step two' })).toBeTruthy();
    expect(screen.queryByTestId('dialog')).not.toBeNull();
  });

  it('the arming window is a fixed timer, independent of motion: it applies under reduced motion too', async () => {
    mockMotion.reduced = true;
    await render(<DialogHost />);
    let answer: boolean | undefined;
    await act(async () => {
      freezeClock();
      void confirmDialog({ ...spec, destructive: true }).then((ok) => {
        answer = ok;
      });
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: spec.confirmLabel }));
    });
    expect(answer).toBeUndefined();
    await armed(); // the pinned clock, not the fake timers: the window is wall-clock, not a frame count
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: spec.confirmLabel }));
    });
    expect(answer).toBe(true);
  });
});
