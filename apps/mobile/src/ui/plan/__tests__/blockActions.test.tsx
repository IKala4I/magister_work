/**
 * The Today action row (рис. 3.4 shots, 2026-10-30): one natural row when every button fits, an
 * even grid when not — never "three on a line and Move… alone below" — and no Start while
 * another block's session runs (the card's screen-reader actions already left it out).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { RecommendationRow } from '../../../db/plans';
import { en } from '../../../i18n/en';
import { actionColumns, BlockActions } from '../BlockActions';

const rec = { id: 'r1', status: 'shown' } as unknown as RecommendationRow;

const layout = (width: number) => ({ nativeEvent: { layout: { width, height: 44, x: 0, y: 0 } } });

describe('actionColumns', () => {
  it('keeps one natural row when the buttons fit', () => {
    expect(actionColumns([66, 98, 104], 303)).toBeNull();
  });
  it('switches to two even columns when they do not', () => {
    expect(actionColumns([69, 66, 98, 104], 303)).toBe(2);
  });
  it('falls back to one column when even two no longer fit (large font scale)', () => {
    expect(actionColumns([140, 130, 200, 210], 303)).toBe(1);
  });
  it('waits for a measured row', () => {
    expect(actionColumns([66], 0)).toBeNull();
    expect(actionColumns([], 303)).toBeNull();
  });
});

describe('BlockActions', () => {
  it('offers Start / Done / Skip / Move… on a free block', async () => {
    await render(
      <BlockActions
        recommendation={rec}
        title="t"
        active={false}
        busyElsewhere={false}
        onAction={jest.fn()}
      />,
    );
    for (const key of [
      'block.action.start',
      'block.action.done',
      'block.action.skip',
      'block.action.move',
    ] as const)
      expect(screen.getByText(en[key])).toBeTruthy();
  });

  it('does not offer Start while another block runs a session', async () => {
    await render(
      <BlockActions
        recommendation={rec}
        title="t"
        active={false}
        busyElsewhere
        onAction={jest.fn()}
      />,
    );
    expect(screen.queryByText(en['block.action.start'])).toBeNull();
    expect(screen.getByText(en['block.action.move'])).toBeTruthy();
  });

  it('sizes the buttons into two equal columns once a too-narrow row is measured', async () => {
    await render(
      <BlockActions
        recommendation={rec}
        title="t"
        active={false}
        busyElsewhere={false}
        onAction={jest.fn()}
      />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(4);
    await fireEvent(buttons[0]!.parent!, 'layout', layout(303));
    for (const [i, w] of [69, 66, 98, 104].entries())
      await fireEvent(buttons[i]!, 'layout', layout(w));
    const widths = screen.getAllByRole('button').map((b) => {
      const style = [b.props.style].flat(Infinity) as Array<{ width?: number } | false | undefined>;
      return style.reduce<number | undefined>(
        (acc, s) => (s && s.width !== undefined ? s.width : acc),
        undefined,
      );
    });
    expect(widths).toEqual([147, 147, 147, 147]);
  });
});
