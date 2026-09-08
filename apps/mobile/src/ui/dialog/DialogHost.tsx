/**
 * The one in-app dialog (ADR-0021) — replaces every `Alert.alert` so Android and iOS show the
 * same File 02 §3 surface: elevated card (full opacity — glass is reserved for the recommendation
 * layer, GlassPanel header), h2 title, body, actions stacked full-width with the confirm first and
 * the cancel last, destructive labels in `dangerText`.
 *
 * Why RN Modal: it is its own window on Android — TalkBack cannot reach the app beneath, and the
 * hardware back button arrives as `onRequestClose` (= cancel; `BackHandler` is suppressed while
 * the Modal is open, so the router never pops the screen under a dialog). On iOS it presents from
 * the NEAREST view controller (RCTModalHostViewComponentView.mm: `[self reactViewController]`), so
 * a host beside the root Stack would be refused by UIKit while a native modal screen is up: every
 * presentation context (the root layout, Settings, the task sheets) mounts a host, and only the
 * most recently mounted one renders (`hosts` registry in the store). `onDismiss` answers a
 * request whose native surface was torn down underneath it (a notification tap dismissing the
 * sheet), so the single slot can never jam.
 *
 * Motion (File 02 §3.4): the Modal is presented without its own animation (RN's fade is neither
 * tunable under 250 ms nor reduced-motion aware); the scrim and card animate inside it on
 * `springs.standard` in / `springs.fast` out through `resolveMotion(useReducedMotion())` — under
 * reduced motion the durations are 0 and the values are assigned outright (Reanimated derives
 * spring stiffness from 1/duration², so zero is instant by assignment, not by a spring). A
 * replacement (erasure step 2, a request mid-exit) springs on from the current value — no reset
 * to 0, no blink. The action's promise resolves on the press, before the exit — nothing depends
 * on an animation completing (NFR-A2); a stale exit callback never clears a newer request.
 *
 * Arming: a destructive confirm ignores presses for DIALOG_ARM_DELAY_MS after its request
 * appears — a double tap on step 1's "Continue" would otherwise land on step 2's "Delete
 * everything" at the same spot (adversarial pass 2026-09-06). A fixed timer, independent of the
 * motion, so reduced motion changes nothing.
 *
 * NFR-A1: the title is a `header` and receives accessibility focus for every request (readers
 * speak the focused header; the body is next in swipe order) — via `onShow` on the Modal's first
 * presentation, and after a short delay when the content is replaced while the Modal stays up
 * (`onShow` never fires again then). No separate announcement: it would compete with the focus
 * event. The card is `accessibilityViewIsModal` (iOS ignores siblings — the scrim) and answers
 * the VoiceOver escape gesture (two-finger Z) with a cancel; the scrim is hidden from readers.
 * NFR-A2: ThemedText (200 % cap), title/body scroll inside a bounded card, actions wrap.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
} from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { Button, ThemedText } from '../primitives';
import { useTheme } from '../theme';
import { resolveMotion, type SpringSpec } from '../tokens/motion';
import { useReducedMotion } from '../useReducedMotion';

import {
  activeHostId,
  newHostId,
  registerHost,
  resolveDialog,
  unregisterHost,
  useDialogStore,
  type DialogRequest,
} from './store';

export const DIALOG_SCRIM = 'rgba(0, 0, 0, 0.5)';
/** Card scale at progress 0 — a settle, not a zoom (File 02 §3.4 "physics, not flourish"). */
export const DIALOG_ENTER_SCALE = 0.96;
/** Focus delay for a request the Modal did not just present (its presentation is async). */
export const DIALOG_FOCUS_DELAY_MS = 100;
/** A destructive confirm ignores presses this long after its request appears. */
export const DIALOG_ARM_DELAY_MS = 400;
/**
 * Under reduced motion the exit is instant (progress 0 at once) but the Modal stays MOUNTED this
 * long before it is torn down — the length the fast spring gives it with motion on. A request
 * that replaces the closing one inside this window (the erasure's step 2 after step 1's
 * "Continue") reuses the same presentation. Without the grace, iOS was asked to present a new
 * Modal while still dismissing the old one and dropped the request: on the iPhone 12 with the
 * system Reduce Motion switch on, the second erasure dialog never appeared (hardware pass
 * 2026-09-07 items 24, 36 — MAJOR). Android's Dialog tolerated the sequence.
 */
export const DIALOG_EXIT_GRACE_MS = 120;

const ESCAPE_ACTIONS = [{ name: 'escape' }];

export function DialogHost() {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const motionRef = useRef(resolveMotion(reduceMotion));
  motionRef.current = resolveMotion(reduceMotion);

  // one host per presentation context; the last mounted renders (registered before paint,
  // never during render — a render may be discarded and re-run)
  const [hostId] = useState(newHostId);
  useLayoutEffect(() => {
    registerHost(hostId);
    return () => unregisterHost(hostId);
  }, [hostId]);
  const active = useDialogStore((s) => activeHostId(s.hosts) === hostId);
  const current = useDialogStore((s) => (active ? s.current : null));

  // what is rendered: lags `current` by the exit animation, never by more
  const [shown, setShown] = useState<DialogRequest | null>(null);
  // the same, readable from the spring's completion callback (which arrives asynchronously —
  // a stale exit must never clear a newer request)
  const shownRef = useRef<DialogRequest | null>(null);
  const progress = useSharedValue(0);
  const titleRef = useRef<View>(null);
  const focusedId = useRef<number | null>(null);
  const armedAt = useRef<number>(0);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (exitTimer.current !== null) clearTimeout(exitTimer.current);
    },
    [],
  );

  const animateTo = useCallback(
    (target: 0 | 1, spring: SpringSpec, onDone?: () => void) => {
      if (spring.duration <= 0) {
        progress.value = target;
        if (onDone === undefined) return;
        // instant, but not torn down at once: see DIALOG_EXIT_GRACE_MS
        if (exitTimer.current !== null) clearTimeout(exitTimer.current);
        exitTimer.current = setTimeout(() => {
          exitTimer.current = null;
          onDone();
        }, DIALOG_EXIT_GRACE_MS);
        return;
      }
      progress.value = withSpring(target, spring, (finished) => {
        if (finished === true && onDone !== undefined) runOnJS(onDone)();
      });
    },
    [progress],
  );

  useEffect(() => {
    const { springs } = motionRef.current;
    if (current !== null) {
      // show; a replacement (step 2, a request mid-exit) springs on from where it is
      if (shownRef.current === null) progress.value = 0;
      shownRef.current = current;
      armedAt.current = Date.now() + DIALOG_ARM_DELAY_MS;
      setShown(current);
      animateTo(1, springs.standard);
      return;
    }
    const exiting = shownRef.current;
    if (exiting === null) return; // nothing on screen (mount, or already gone)
    // hide: keep rendering until the exit spring settles — unless a newer request took over
    animateTo(0, springs.fast, () => {
      if (shownRef.current === exiting) {
        shownRef.current = null;
        setShown(null);
      }
    });
  }, [current, animateTo, progress]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: DIALOG_ENTER_SCALE + (1 - DIALOG_ENTER_SCALE) * progress.value }],
  }));

  const focusTitle = useCallback((request: DialogRequest) => {
    if (focusedId.current === request.id) return;
    if (useDialogStore.getState().current?.id !== request.id) return; // already answered
    focusedId.current = request.id;
    const node = titleRef.current;
    if (node !== null) AccessibilityInfo.sendAccessibilityEvent(node, 'focus');
  }, []);

  // every request gets the title focused: on the Modal's first presentation via onShow,
  // otherwise (content replaced while the Modal stays up) after a short delay from this effect
  useEffect(() => {
    if (shown === null) return undefined;
    const timer = setTimeout(() => focusTitle(shown), DIALOG_FOCUS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [shown, focusTitle]);

  const onShow = useCallback(() => {
    if (shown !== null) focusTitle(shown);
  }, [shown, focusTitle]);

  if (shown === null) return null;
  const { id, title, body, actions, testID } = shown;
  const cancel = () => resolveDialog(id, 'cancelled');
  // the native surface went away under an unanswered request (iOS: the sheet beneath dismissed)
  const onDismiss = () => {
    if (useDialogStore.getState().current?.id === id) resolveDialog(id, 'cancelled');
  };
  const onAccessibilityAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'escape') cancel();
  };
  const press = (action: (typeof actions)[number]) => {
    if (action.role === 'cancel') {
      cancel();
      return;
    }
    if (action.destructive === true && Date.now() < armedAt.current) return; // not armed yet
    resolveDialog(id, 'confirmed');
  };

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={cancel}
      onDismiss={onDismiss}
      onShow={onShow}
      testID={testID ?? 'dialog'}
    >
      <View style={styles.root}>
        <Animated.View style={[styles.fill, { backgroundColor: DIALOG_SCRIM }, scrimStyle]}>
          <Pressable
            accessibilityRole="none"
            accessible={false}
            importantForAccessibility="no"
            accessibilityElementsHidden
            onPress={cancel}
            style={styles.fill}
            testID="dialog-scrim"
          />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          accessibilityActions={ESCAPE_ACTIONS}
          onAccessibilityAction={onAccessibilityAction}
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surfaceElevated.color,
              borderRadius: theme.radii.card,
            },
            cardStyle,
          ]}
          testID="dialog-card"
        >
          <ScrollView
            style={styles.textScroll}
            contentContainerStyle={styles.text}
            testID="dialog-body-scroll"
          >
            <View ref={titleRef} accessibilityRole="header" accessible testID="dialog-title">
              <ThemedText variant="h2">{title}</ThemedText>
            </View>
            <ThemedText variant="body">{body}</ThemedText>
          </ScrollView>
          <View style={styles.actions} testID="dialog-actions">
            {actions.map((action) => (
              <Button
                key={`${action.role}-${action.label}`}
                kind={action.destructive === true ? 'destructive' : 'secondary'}
                label={action.label}
                onPress={() => press(action)}
                style={[
                  styles.action,
                  action.role === 'cancel' && { borderTopColor: theme.colors.primaryContainer },
                ]}
              />
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  fill: { ...StyleSheet.absoluteFill },
  card: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    paddingTop: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  textScroll: { flexShrink: 1 },
  text: { paddingHorizontal: 20, gap: 8 },
  actions: { paddingTop: 12, paddingBottom: 8, paddingHorizontal: 8 },
  action: {
    width: '100%',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent',
  },
});
