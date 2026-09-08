/**
 * The plan-surface motion helpers (ADR-0022; File 02 §3.4, NFR-A2). Pinned here: a duration-0
 * spring registers no layout transition; the arrival settle plays once on a fresh trigger and
 * rests under the 250 ms cap; a rebind resets to rest on the same frame; a stale trigger never
 * plays; reduced motion is at rest on the first frame; and the style is transforms only —
 * never opacity (the rule: no invisible state on a control-bearing surface).
 */
import { act, render, screen } from '@testing-library/react-native';
import Animated, { getAnimatedStyle } from 'react-native-reanimated';

import {
  LAYOUT_SETTLE_MS,
  layoutTransitionFor,
  SETTLE_SCALE_FROM,
  SETTLE_TRANSLATE_PX,
  SETTLE_TRIGGER_WINDOW_MS,
  useSettle,
} from '../motion';
import { MOTION_MAX_MS, resolveMotion, springs } from '../tokens/motion';

const FRAME_MS = 17;
type Pose = { transform: Array<{ translateY?: number; scale?: number }>; opacity?: number };

function Probe({ id, at, reduced = false }: { id: string; at: number; reduced?: boolean }) {
  const style = useSettle({
    key: id,
    playedAt: at,
    spring: resolveMotion(reduced).springs.emphasized,
  });
  return <Animated.View testID="probe" style={style} />;
}

const pose = () => getAnimatedStyle(screen.getByTestId('probe')) as Pose;
const translateY = (p: Pose) => p.transform[0]?.translateY ?? NaN;
const scale = (p: Pose) => p.transform[1]?.scale ?? NaN;
const expectAtRest = (p: Pose) => {
  expect(translateY(p)).toBeCloseTo(0, 1);
  expect(scale(p)).toBeCloseTo(1, 1);
};

describe('layoutTransitionFor', () => {
  it('registers nothing at duration 0 (reduced motion through resolveMotion)', () => {
    expect(layoutTransitionFor(resolveMotion(true).springs.standard)).toBeUndefined();
  });

  it('is a duration-based spring carrying the token duration and damping ratio', () => {
    const transition = layoutTransitionFor(springs.standard) as unknown as {
      durationV?: number;
      dampingRatioV?: number;
    };
    expect(transition).toBeDefined();
    expect(transition.durationV).toBe(springs.standard.duration);
    expect(transition.dampingRatioV).toBe(springs.standard.dampingRatio);
  });

  it('the windows sit inside the spec: the layout window covers the 200 ms travel plus one tick', () => {
    expect(springs.standard.duration).toBeLessThanOrEqual(MOTION_MAX_MS);
    expect(springs.emphasized.duration).toBeLessThanOrEqual(MOTION_MAX_MS);
    expect(LAYOUT_SETTLE_MS).toBeGreaterThan(springs.standard.duration);
    expect(SETTLE_TRIGGER_WINDOW_MS).toBeGreaterThan(springs.emphasized.duration);
  });
});

describe('useSettle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('is at rest with no trigger, and the style has no opacity key (the rule)', async () => {
    await render(<Probe id="a" at={0} />);
    const p = pose();
    expectAtRest(p);
    expect(p).not.toHaveProperty('opacity');
    expect(Object.keys(p)).toEqual(['transform']);
  });

  it('plays on a fresh trigger from the arrival pose and settles under the 250 ms cap', async () => {
    await render(<Probe id="a" at={Date.now()} />);
    await act(async () => {
      jest.advanceTimersByTime(FRAME_MS);
    });
    const first = pose();
    // moving, and never invisible: a hair below and a touch smaller, nothing else
    expect(translateY(first)).toBeGreaterThan(0);
    expect(translateY(first)).toBeLessThanOrEqual(SETTLE_TRANSLATE_PX);
    expect(scale(first)).toBeGreaterThanOrEqual(SETTLE_SCALE_FROM);
    expect(scale(first)).toBeLessThan(1);
    expect(first).not.toHaveProperty('opacity');
    await act(async () => {
      jest.advanceTimersByTime(MOTION_MAX_MS - FRAME_MS);
    });
    expectAtRest(pose());
  });

  it('plays once per trigger: a re-render with the same stamp does not restart it', async () => {
    const at = Date.now();
    await render(<Probe id="a" at={at} />);
    await act(async () => {
      jest.advanceTimersByTime(MOTION_MAX_MS);
    });
    expectAtRest(pose());
    await screen.rerender(<Probe id="a" at={at} />);
    await act(async () => {
      jest.advanceTimersByTime(FRAME_MS);
    });
    expectAtRest(pose());
  });

  it('a key change (a recycled cell rebound to another block) resets to rest on the same frame', async () => {
    await render(<Probe id="a" at={Date.now()} />);
    await act(async () => {
      jest.advanceTimersByTime(FRAME_MS * 2);
    });
    expect(translateY(pose())).toBeGreaterThan(0); // mid-settle
    await screen.rerender(<Probe id="b" at={0} />);
    // no frame advanced: the rebound cell paints at rest, whatever was running
    expectAtRest(pose());
    await act(async () => {
      jest.advanceTimersByTime(FRAME_MS);
    });
    expectAtRest(pose());
  });

  it('a rebind to the moved block inside the window plays; a stale trigger never plays', async () => {
    const at = Date.now();
    await render(<Probe id="other" at={0} />);
    await screen.rerender(<Probe id="moved" at={at} />);
    await act(async () => {
      jest.advanceTimersByTime(FRAME_MS);
    });
    expect(translateY(pose())).toBeGreaterThan(0);
    await act(async () => {
      jest.advanceTimersByTime(MOTION_MAX_MS);
    });
    expectAtRest(pose());
    // the same block scrolled back into a cell long after the arrival: at rest
    jest.advanceTimersByTime(SETTLE_TRIGGER_WINDOW_MS + 1);
    await screen.rerender(<Probe id="elsewhere" at={0} />);
    await screen.rerender(<Probe id="moved" at={at} />);
    await act(async () => {
      jest.advanceTimersByTime(FRAME_MS);
    });
    expectAtRest(pose());
  });

  it('under reduced motion a fresh trigger is at rest on the first frame — the same path, duration 0', async () => {
    await render(<Probe id="a" at={Date.now()} reduced />);
    expectAtRest(pose());
    await act(async () => {
      jest.advanceTimersByTime(FRAME_MS);
    });
    expectAtRest(pose());
  });
});
