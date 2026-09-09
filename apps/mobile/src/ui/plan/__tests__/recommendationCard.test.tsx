/**
 * The block card for screen readers (NFR-A1; hardware pass 2026-09-07 item 35, 2026-09-08 item
 * 58): one spoken element that carries the state and offers the action row as custom actions
 * routed to the same handler as the buttons.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { getAnimatedStyle } from 'react-native-reanimated';

import type { RecommendationRow } from '../../../db/plans';
import { en } from '../../../i18n/en';
import { BlockActions } from '../BlockActions';
import { formatClock, RecommendationCard } from '../RecommendationCard';

const rec = (over: Partial<RecommendationRow> = {}): RecommendationRow =>
  ({
    id: 'r1',
    userId: 'u1',
    planId: 'p1',
    taskId: 't1',
    chunkIndex: 0,
    slotStart: new Date(2026, 8, 8, 13, 0),
    slotEnd: new Date(2026, 8, 8, 13, 30),
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
    createdAt: new Date(2026, 8, 7),
    updatedAt: new Date(2026, 8, 7),
    serverSeq: null,
    ...over,
  }) as RecommendationRow;

// the clock is locale-formatted (12 h under the test locale); the label is checked against the
// same formatter the card uses
// (the query normaliser collapses the narrow no-break space Intl puts before "PM")
const WHEN =
  `${formatClock(new Date(2026, 8, 8, 13, 0))} to ${formatClock(new Date(2026, 8, 8, 13, 30))}`.replace(
    /\s+/g,
    ' ',
  );

describe('RecommendationCard — screen-reader actions and state', () => {
  it('a shown block offers Start / Done / Skip / Move… as custom actions and routes them to the row handler', async () => {
    const onAction = jest.fn();
    const r = rec();
    await render(
      <RecommendationCard
        recommendation={r}
        title="b6 task 02 deep"
        onAction={onAction}
        actions={
          <BlockActions
            recommendation={r}
            title="b6 task 02 deep"
            active={false}
            busyElsewhere={false}
            onAction={onAction}
          />
        }
      />,
    );
    const card = screen.getByLabelText(`b6 task 02 deep, ${WHEN}, Confidence 71 percent`);
    expect(card.props.accessibilityActions).toEqual([
      { name: 'start', label: en['block.action.start'] },
      { name: 'done', label: en['block.action.done'] },
      { name: 'skip', label: en['block.action.skip'] },
      { name: 'move', label: en['block.action.move'] },
    ]);
    await fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'skip' } });
    expect(onAction).toHaveBeenCalledWith('skip', r);
    // the visible button reaches the same handler
    await fireEvent.press(screen.getByRole('button', { name: 'Start b6 task 02 deep' }));
    expect(onAction).toHaveBeenCalledWith('start', r);
  });

  it('Start is withheld while another session runs; a lapsed block speaks its state and offers "I did it"; a completed block offers nothing', async () => {
    const onAction = jest.fn();
    await render(
      <RecommendationCard recommendation={rec()} title="a" onAction={onAction} busyElsewhere />,
    );
    expect(
      screen
        .getByLabelText(`a, ${WHEN}, Confidence 71 percent`)
        .props.accessibilityActions.map((a: { name: string }) => a.name),
    ).toEqual(['done', 'skip', 'move']);
    await screen.unmount();
    await render(
      <RecommendationCard
        recommendation={rec({ status: 'lapsed' })}
        title="b"
        onAction={onAction}
      />,
    );
    const lapsed = screen.getByLabelText(
      `b, ${WHEN}, Confidence 71 percent, ${en['block.status.lapsed']}`,
    );
    expect(lapsed.props.accessibilityActions).toEqual([
      { name: 'did_it', label: en['block.action.didIt'] },
    ]);
    await screen.unmount();
    await render(
      <RecommendationCard
        recommendation={rec({ status: 'completed' })}
        title="c"
        onAction={onAction}
      />,
    );
    const done = screen.getByLabelText(
      `c, ${WHEN}, Confidence 71 percent, ${en['block.status.completed']}`,
    );
    expect(done.props.accessibilityActions).toBeUndefined();
  });

  it('a read-only render (no handler) exposes no actions', async () => {
    await render(<RecommendationCard recommendation={rec()} title="d" />);
    expect(
      screen.getByLabelText(`d, ${WHEN}, Confidence 71 percent`).props.accessibilityActions,
    ).toBeUndefined();
  });
});

describe('RecommendationCard — the settle wrapper (ADR-0022, the rule)', () => {
  it('wraps the block in a transform-only animated view at rest with no accessibility props of its own', async () => {
    await render(<RecommendationCard recommendation={rec()} title="deep work" />);
    const wrapper = screen.getByTestId('block-settle-r1');
    const style = getAnimatedStyle(wrapper) as Record<string, unknown>;
    expect(Object.keys(style)).toEqual(['transform']);
    expect(style).not.toHaveProperty('opacity');
    expect(wrapper.props.accessible).toBeUndefined();
    expect(wrapper.props.accessibilityLabel).toBeUndefined();
    // the accessible leaf is still the block's own view, with the composed label
    const block = screen.getByLabelText(/deep work/);
    expect(block.props.accessible).toBe(true);
    expect(block).not.toBe(wrapper);
  });
});
