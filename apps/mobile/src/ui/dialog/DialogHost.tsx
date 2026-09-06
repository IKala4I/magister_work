/**
 * The one in-app dialog (ADR-0021) — replaces every `Alert.alert` so Android and iOS show the
 * same File 02 §3 surface: elevated card (full opacity — glass is reserved for the recommendation
 * layer, GlassPanel header), h2 title, body, actions stacked full-width with the confirm first and
 * the cancel last, destructive labels in `dangerText`.
 *
 * Why RN Modal: it presents from the topmost native controller, so the dialog lands ABOVE the
 * `presentation: 'modal'` Settings/Task screens on iOS (a JS overlay in the root layout renders
 * behind them) and is its own window on Android — TalkBack cannot reach the app beneath, and the
 * hardware back button arrives as `onRequestClose` (= cancel; `BackHandler` is suppressed while
 * the Modal is open, so the router never pops the screen under a dialog).
 *
 * Motion (File 02 §3.4): the Modal is presented without its own animation (RN's fade is neither
 * tunable under 250 ms nor reduced-motion aware); the scrim and card animate inside it on
 * `springs.standard` in / `springs.fast` out through `resolveMotion(useReducedMotion())` — under
 * reduced motion the durations are 0 and the values are assigned outright (Reanimated derives
 * spring stiffness from 1/duration², so zero is instant by assignment, not by a spring). The
 * action's promise resolves on the press, before the exit — nothing depends on an animation
 * completing (NFR-A2); a request arriving mid-exit cancels the exit and shows immediately.
 *
 * NFR-A1: title `header` and focused on show, one announcement of title + body, the card is
 * `accessibilityViewIsModal` (iOS ignores siblings — the scrim), the scrim itself hidden from
 * readers. NFR-A2: ThemedText (200 % cap), the title/body scroll inside a bounded card, actions
 * wrap on their own rows.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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

import { resolveDialog, useDialogStore, type DialogRequest } from './store';

export const DIALOG_SCRIM = 'rgba(0, 0, 0, 0.5)';
/** Card scale at progress 0 — a settle, not a zoom (File 02 §3.4 "physics, not flourish"). */
export const DIALOG_ENTER_SCALE = 0.96;

export function DialogHost() {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const current = useDialogStore((s) => s.current);
  // what is rendered: lags `current` by the exit animation, never by more
  const [shown, setShown] = useState<DialogRequest | null>(null);
  // the same, readable from the spring's completion callback (which arrives asynchronously —
  // a stale exit must never clear a newer request)
  const shownRef = useRef<DialogRequest | null>(null);
  const progress = useSharedValue(0);
  const titleRef = useRef<View>(null);

  const animateTo = useCallback(
    (target: 0 | 1, spring: SpringSpec, onDone?: () => void) => {
      if (spring.duration <= 0) {
        progress.value = target;
        onDone?.();
        return;
      }
      progress.value = withSpring(target, spring, (finished) => {
        if (finished === true && onDone !== undefined) runOnJS(onDone)();
      });
    },
    [progress],
  );

  useEffect(() => {
    const { springs } = resolveMotion(reduceMotion);
    if (current !== null) {
      // show (also cancels an exit in flight: the same shared value gets a new target)
      shownRef.current = current;
      setShown(current);
      progress.value = 0;
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
  }, [current, reduceMotion, animateTo, progress]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: DIALOG_ENTER_SCALE + (1 - DIALOG_ENTER_SCALE) * progress.value }],
  }));

  const onShow = useCallback(() => {
    if (shown === null) return;
    AccessibilityInfo.announceForAccessibility(`${shown.title}. ${shown.body}`);
    const node = titleRef.current;
    if (node !== null) AccessibilityInfo.sendAccessibilityEvent(node, 'focus');
  }, [shown]);

  if (shown === null) return null;
  const { id, title, body, actions, testID } = shown;
  const cancel = () => resolveDialog(id, 'cancelled');

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={cancel}
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
                onPress={() =>
                  resolveDialog(id, action.role === 'confirm' ? 'confirmed' : 'cancelled')
                }
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
