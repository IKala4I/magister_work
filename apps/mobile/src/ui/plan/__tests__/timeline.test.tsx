/**
 * The Today timeline's two transitions (ADR-0022, File 02 §3.4; UC-07 move): the cell `layout`
 * spring exists only inside the settle window; a confirmed move is found in the rows by id AND
 * the slot the write produced; an off-screen destination scrolls the list to it (instant under
 * reduced motion) and the card there settles on arrival; an on-screen destination scrolls
 * nothing (the cell travels); FlashList's one-shot is armed on the reordering render only.
 */
const mockFlash = {
  scrollToIndex: jest.fn<Promise<void>, [unknown]>(() => Promise.resolve()),
  visible: { startIndex: 0, endIndex: 1 },
  prepare: jest.fn(),
};
// the cells' `layout` prop, recorded at the one place it is set (TimelineCell → Animated.View);
// the host tree keeps no composite props, so the animated view is spied, not inspected
const mockCellLayouts = new Map<number, unknown>();
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual(
    'react-native-reanimated',
  ) as typeof import('react-native-reanimated');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react') as typeof import('react');
  const RealView = actual.default.View;
  function SpyView(props: { index?: unknown; layout?: unknown }) {
    if (typeof props.index === 'number') mockCellLayouts.set(props.index, props.layout);
    return React.createElement(RealView, props as never);
  }
  return { __esModule: true, ...actual, default: { ...actual.default, View: SpyView } };
});

type MockFlashListProps = {
  data: unknown[];
  keyExtractor: (item: unknown) => string;
  renderItem: (info: { item: unknown; index: number }) => import('react').ReactNode;
  CellRendererComponent?: import('react').ComponentType<{
    index: number;
    style: object;
    children?: import('react').ReactNode;
  }>;
  ref?: import('react').Ref<unknown>;
};
jest.mock('@shopify/flash-list', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native') as typeof import('react-native');
  function FlashList({
    data,
    keyExtractor,
    renderItem,
    CellRendererComponent,
    ref,
  }: MockFlashListProps) {
    React.useImperativeHandle(ref, () => ({
      scrollToIndex: (params: unknown) => mockFlash.scrollToIndex(params),
      computeVisibleIndices: () => mockFlash.visible,
      prepareForLayoutAnimationRender: () => mockFlash.prepare(),
    }));
    const Cell = CellRendererComponent ?? View;
    return (
      <View testID="list">
        {data.map((item, index) => (
          <Cell key={keyExtractor(item)} index={index} style={{}}>
            {renderItem({ item, index })}
          </Cell>
        ))}
      </View>
    );
  }
  return { FlashList };
});

import { act, render, screen } from '@testing-library/react-native';
import { getAnimatedStyle } from 'react-native-reanimated';

import type { RecommendationRow } from '../../../db/plans';
import { resolveMotion, springs } from '../../tokens/motion';
import { MOVED_VIEW_POSITION, Timeline, TimelineCell } from '../Timeline';

const FRAME_MS = 17;
const at = (h: number, m = 0) => new Date(2026, 8, 8, h, m);
const rec = (id: string, start: Date, over: Partial<RecommendationRow> = {}): RecommendationRow =>
  ({
    id,
    userId: 'u1',
    planId: 'p1',
    taskId: `t-${id}`,
    chunkIndex: 0,
    slotStart: start,
    slotEnd: new Date(start.getTime() + 30 * 60_000),
    contextBucket: 'AF.wd.fresh',
    features: null,
    qHat: 0.7,
    confidence: 0.71,
    rationaleKey: 'best_available',
    rationaleParams: null,
    isExperiment: false,
    engine: 'learned',
    modelVersion: 'v',
    status: 'shown',
    attributedAt: null,
    propensity: null,
    conflictFlag: false,
    version: 1,
    createdAt: at(8),
    updatedAt: at(8),
    serverSeq: null,
    ...over,
  }) as RecommendationRow;
const titles = new Map([
  ['t-r1', 'one'],
  ['t-r2', 'two'],
  ['t-r3', 'three'],
]);
const three = [rec('r1', at(9)), rec('r2', at(10)), rec('r3', at(11))];
const now = at(8, 30);

/** The `layout` prop of every cell the list rendered last (the Now row + the blocks). */
function cellLayouts(): unknown[] {
  return [...mockCellLayouts.entries()].sort(([a], [b]) => a - b).map(([, layout]) => layout);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCellLayouts.clear();
  mockFlash.visible = { startIndex: 0, endIndex: 1 };
  mockFlash.scrollToIndex.mockImplementation(() => Promise.resolve());
});

describe('Timeline — the cell layout window (S1)', () => {
  it('outside the window every cell has no layout transition; inside, each carries springs.standard', async () => {
    await render(<Timeline recommendations={three} titles={titles} now={now} />);
    expect(cellLayouts()).toHaveLength(4); // Now row + three blocks
    for (const layout of cellLayouts()) expect(layout).toBeUndefined();
    mockCellLayouts.clear();
    await screen.rerender(
      <Timeline
        recommendations={three}
        titles={titles}
        now={now}
        motion={resolveMotion(false)}
        layoutSettling
      />,
    );
    expect(cellLayouts()).toHaveLength(4); // every cell re-rendered through the context
    for (const layout of cellLayouts()) {
      expect(layout).toBeDefined();
      expect((layout as { durationV?: number }).durationV).toBe(springs.standard.duration);
    }
    mockCellLayouts.clear();
    await screen.rerender(
      <Timeline
        recommendations={three}
        titles={titles}
        now={now}
        motion={resolveMotion(false)}
        layoutSettling={false}
      />,
    );
    expect(cellLayouts()).toHaveLength(4);
    for (const layout of cellLayouts()) expect(layout).toBeUndefined();
  });

  it('under reduced motion the window registers nothing — duration 0 through the same helper', async () => {
    await render(
      <Timeline
        recommendations={three}
        titles={titles}
        now={now}
        motion={resolveMotion(true)}
        layoutSettling
      />,
    );
    for (const layout of cellLayouts()) expect(layout).toBeUndefined();
  });

  it('the cell renderer is one module-scope component (never a closure of the render)', () => {
    expect(typeof TimelineCell).toBe('function');
  });
});

describe('Timeline — a confirmed move (S2)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  const motion = resolveMotion(false);
  const settleOf = (id: string) =>
    getAnimatedStyle(screen.getByTestId(`block-settle-${id}`)) as {
      transform: Array<{ translateY?: number }>;
    };

  it('waits for the rows to carry the new slot, then scrolls to an off-screen destination and settles the card there', async () => {
    const stamp = Date.now();
    const moved = { id: 'r1', at: stamp, slotStart: at(15).getTime() };
    // the confirm re-renders the screen before the change event: rows still at the old slot
    await render(
      <Timeline recommendations={three} titles={titles} now={now} motion={motion} moved={moved} />,
    );
    expect(mockFlash.prepare).not.toHaveBeenCalled();
    expect(mockFlash.scrollToIndex).not.toHaveBeenCalled();
    // the change event: r1 now sits at 15:00, last in the order — off screen (visible 0..1)
    const reordered = [three[1]!, three[2]!, rec('r1', at(15), { status: 'moved' })];
    await screen.rerender(
      <Timeline
        recommendations={reordered}
        titles={titles}
        now={now}
        motion={motion}
        moved={moved}
      />,
    );
    expect(mockFlash.prepare).toHaveBeenCalledTimes(1);
    expect(mockFlash.scrollToIndex).toHaveBeenCalledTimes(1);
    expect(mockFlash.scrollToIndex).toHaveBeenCalledWith({
      index: 3, // Now row, two, three, one
      animated: true,
      viewPosition: MOVED_VIEW_POSITION,
    });
    // the scroll lands → the arrival stamp → the moved card plays its settle, the others rest
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(FRAME_MS);
    });
    expect(settleOf('r1').transform[0]?.translateY).toBeGreaterThan(0);
    expect(settleOf('r2').transform[0]?.translateY).toBeCloseTo(0, 1);
    // a later render with the same move does nothing more
    await screen.rerender(
      <Timeline
        recommendations={reordered}
        titles={titles}
        now={now}
        motion={motion}
        moved={moved}
      />,
    );
    expect(mockFlash.prepare).toHaveBeenCalledTimes(1);
    expect(mockFlash.scrollToIndex).toHaveBeenCalledTimes(1);
  });

  it('an on-screen destination scrolls nothing (the cell travels on the layout spring) and no card settles', async () => {
    mockFlash.visible = { startIndex: 0, endIndex: 3 };
    const moved = { id: 'r1', at: Date.now(), slotStart: at(15).getTime() };
    await render(
      <Timeline recommendations={three} titles={titles} now={now} motion={motion} moved={moved} />,
    );
    const reordered = [three[1]!, three[2]!, rec('r1', at(15), { status: 'moved' })];
    await screen.rerender(
      <Timeline
        recommendations={reordered}
        titles={titles}
        now={now}
        motion={motion}
        moved={moved}
      />,
    );
    expect(mockFlash.prepare).toHaveBeenCalledTimes(1);
    expect(mockFlash.scrollToIndex).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(FRAME_MS);
    });
    expect(settleOf('r1').transform[0]?.translateY).toBeCloseTo(0, 1);
  });

  it('under reduced motion the scroll is instant (animated: false)', async () => {
    const still = resolveMotion(true);
    const moved = { id: 'r1', at: Date.now(), slotStart: at(15).getTime() };
    await render(
      <Timeline recommendations={three} titles={titles} now={now} motion={still} moved={moved} />,
    );
    const reordered = [three[1]!, three[2]!, rec('r1', at(15), { status: 'moved' })];
    await screen.rerender(
      <Timeline
        recommendations={reordered}
        titles={titles}
        now={now}
        motion={still}
        moved={moved}
      />,
    );
    expect(mockFlash.scrollToIndex).toHaveBeenCalledWith(
      expect.objectContaining({ index: 3, animated: false }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(FRAME_MS);
    });
    expect(settleOf('r1').transform[0]?.translateY).toBeCloseTo(0, 1); // at rest, first frame
  });

  it('a stale row (the id at another slot) is never mistaken for the move', async () => {
    const moved = { id: 'r1', at: Date.now(), slotStart: at(15).getTime() };
    await render(
      <Timeline recommendations={three} titles={titles} now={now} motion={motion} moved={moved} />,
    );
    // a sync pull replaces the rows but r1 still shows the old slot
    await screen.rerender(
      <Timeline
        recommendations={[rec('r1', at(9)), rec('r2', at(10)), rec('r3', at(11))]}
        titles={titles}
        now={now}
        motion={motion}
        moved={moved}
      />,
    );
    expect(mockFlash.prepare).not.toHaveBeenCalled();
    expect(mockFlash.scrollToIndex).not.toHaveBeenCalled();
  });
});
