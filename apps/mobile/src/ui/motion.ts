/**
 * Motion helpers for the plan surface (ADR-0022; File 02 §3.4, NFR-A2). `tokens/motion.ts`
 * stays pure data; this module turns a `SpringSpec` into Reanimated animations and owns the
 * two windows the Today timeline needs.
 *
 * Two transitions, both on the Today timeline, nothing else (ADR-0022 "Decision"):
 *  - S1 — Done / Skip / I did it: the rows below a shrinking card settle into the gap instead
 *    of jumping (a cell `layout` spring, registered only for LAYOUT_SETTLE_MS after the tap).
 *  - S2 — Move: the block travels to its slot on the same spring; when the slot is off screen
 *    the list scrolls there and the freshly (re)bound card plays an arrival settle (`useSettle`).
 *
 * The reduced-motion collapse arrives through `resolveMotion` exactly as in the dialog
 * (`DialogHost`): a duration-0 spring means "no transition registered" / "assigned at rest" —
 * one helper, not a second branch per site.
 *
 * The rule (ADR-0022): a transition on a control-bearing surface never passes through an
 * invisible or non-interactive state. Transforms only — never opacity; rest values assigned
 * synchronously on rebind; no `entering` / `exiting`; nothing a dropped completion callback
 * could leave half-way invisible. The blank-card defect (`e7bb05e`) was a card mounted but not
 * painted whose Start/Done became facts (invariant 2).
 */
import { useLayoutEffect, useRef } from 'react';
import {
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type AnimatedStyle,
} from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';

import type { SpringSpec } from './tokens/motion';

/**
 * How long the cell `layout` transition stays registered after a tap. Covers the write → SQLite
 * change event → re-render (one tick) plus the 200 ms `springs.standard` travel. Outside the
 * window the prop is `undefined`, so a recycle during scroll registers no transition (the 60 fps
 * rows, NFR-P2; "flying cells").
 */
export const LAYOUT_SETTLE_MS = 350;

/**
 * A settle trigger older than this never plays: a card (re)bound to the moved id long after the
 * tap — a later scroll bringing the block back into view — must sit at rest.
 */
export const SETTLE_TRIGGER_WINDOW_MS = 400;

/** Arrival pose (progress 0): a hair below its slot and a touch smaller — visible throughout. */
export const SETTLE_TRANSLATE_PX = 8;
export const SETTLE_SCALE_FROM = 0.97;

/**
 * The cell `layout` transition for a spring; `undefined` at duration 0 (reduced motion → no
 * transition registered). Reanimated's duration-based spring: `duration` wins over the physics
 * props, `dampingRatio` shapes the overshoot (verified 2026-09-08, docs/versions.md).
 */
export function layoutTransitionFor(spring: SpringSpec): LinearTransition | undefined {
  if (spring.duration <= 0) return undefined;
  return LinearTransition.springify().duration(spring.duration).dampingRatio(spring.dampingRatio);
}

export interface SettleInput {
  /** The block the host cell is bound to (FlashList rebinds a recycled cell to another id). */
  key: string;
  /** `Date.now()` of the tap that should settle this key; 0 (or any stale value) = nothing. */
  playedAt: number;
  spring: SpringSpec;
}

/** A move is pending for the timeline this long after the confirm; then `moved` is dropped. */
export const MOVE_PENDING_MS = 3000;

/**
 * The stamps already settled, per key, across every cell: a block rebound to another cell inside
 * the trigger window (a fling right after the scroll lands) must not play the same arrival twice
 * (adversarial pass 2026-09-09 #3). Module-level on purpose — the cells come and go.
 */
const settled = new Map<string, number>();
/** Test seam: forget every settled stamp (fake clocks repeat the same `Date.now()`). */
export function resetSettleHistory(): void {
  settled.clear();
}

/**
 * Arrival settle for a card: a transform-only spring from the arrival pose to rest, played once
 * per (key, trigger) when the card is (re)bound to `key` inside SETTLE_TRIGGER_WINDOW_MS of
 * `playedAt`. A cell that travelled (same key across the reorder) never plays it — no double
 * motion. On a key change the value is reset to rest in the layout effect — before the frame
 * that shows the new block is presented, whatever was running (assigning cancels a spring);
 * never during render (Reanimated's strict mode flags that, adversarial pass #2). Duration 0 →
 * rest assigned, no spring. Nothing waits on completion.
 */
export function useSettle({ key, playedAt, spring }: SettleInput): AnimatedStyle<ViewStyle> {
  const progress = useSharedValue(1);
  const boundKey = useRef(key);
  useLayoutEffect(() => {
    if (boundKey.current !== key) {
      boundKey.current = key;
      progress.value = 1; // rebind: rest first, then decide below
    }
    if (playedAt <= 0 || settled.get(key) === playedAt) return; // nothing to play, or played
    if (Date.now() - playedAt > SETTLE_TRIGGER_WINDOW_MS) return; // stale trigger: stay at rest
    settled.set(key, playedAt);
    if (spring.duration <= 0) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withSpring(1, spring);
  }, [key, playedAt, spring, progress]);
  return useAnimatedStyle(() => ({
    transform: [
      { translateY: (1 - progress.value) * SETTLE_TRANSLATE_PX },
      { scale: SETTLE_SCALE_FROM + (1 - SETTLE_SCALE_FROM) * progress.value },
    ],
  }));
}
