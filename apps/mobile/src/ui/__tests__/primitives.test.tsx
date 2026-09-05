/**
 * Primitive components: solidity mapping reaches the rendered tree, experiment treatment
 * matches FR-22, text stays scalable-but-capped (NFR-A2), and screen-reader output exists
 * for the solidity semantic (NFR-A1).
 */
jest.mock('../useReduceTransparency', () => ({
  useReduceTransparency: jest.fn(() => false),
}));

import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ReactElement } from 'react';

import { en } from '../../i18n/en';
import { ThemedText, Screen, ConfidenceBlock } from '../primitives';
import { confidenceOpacity, NULL_CONFIDENCE_RENDER } from '../tokens/confidence';
import { blendOverHex, hexWithAlpha } from '../tokens/contrast';
import { typeScale, MAX_FONT_SCALE } from '../tokens/typography';
import { lightColors } from '../tokens/colors';

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderWithSafeArea(ui: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={initialMetrics}>{ui}</SafeAreaProvider>);
}

function flatStyle(node: { props: { style?: unknown } }): Record<string, unknown> {
  return Object.assign({}, ...[node.props.style].flat(Infinity));
}

describe('ThemedText', () => {
  it('applies the File 02 §3.3 variant and honors capped font scaling', async () => {
    await render(<ThemedText variant="h1">{en['tabs.today']}</ThemedText>);
    const node = screen.getByText('Today');
    expect(node.props.maxFontSizeMultiplier).toBe(MAX_FONT_SCALE);
    expect(node.props.allowFontScaling).not.toBe(false);
    const flat = flatStyle(node);
    expect(flat.fontSize).toBe(typeScale.h1.fontSize);
    expect(flat.lineHeight).toBe(typeScale.h1.lineHeight);
    expect(flat.fontFamily).toBe(typeScale.h1.fontFamily);
  });

  it('secondary tone uses text-secondary', async () => {
    await render(<ThemedText tone="secondary">{en['inbox.empty.body']}</ThemedText>);
    expect(flatStyle(screen.getByText(en['inbox.empty.body'])).color).toBe(
      lightColors.textSecondary,
    );
  });
});

describe('Screen', () => {
  it('paints the themed surface behind its children', async () => {
    await renderWithSafeArea(
      <Screen>
        <ThemedText>{en['today.empty.title']}</ThemedText>
      </Screen>,
    );
    expect(screen.getByText(en['today.empty.title'])).toBeTruthy();
    expect(JSON.stringify(screen.toJSON())).toContain(lightColors.surface);
  });
});

describe('ConfidenceBlock (confidence = solidity, FR-22)', () => {
  it('maps confidence into the PANEL background alpha, never onto the content', async () => {
    await renderWithSafeArea(
      <ConfidenceBlock confidence={0.4}>
        <ThemedText>{en['today.empty.body']}</ThemedText>
      </ConfidenceBlock>,
    );
    const expectedAlpha = lightColors.surfaceElevated.opacity * confidenceOpacity(0.4);
    expect(JSON.stringify(screen.toJSON())).toContain(
      hexWithAlpha(lightColors.surfaceElevated.color, expectedAlpha),
    );
    // Solidity must not fade copy: no reduced opacity anywhere on the text's style chain.
    const text = screen.getByText(en['today.empty.body']);
    expect(flatStyle(text).opacity).toBeUndefined();
    const wrapper = screen.getByLabelText('Confidence 40 percent');
    expect(flatStyle(wrapper).opacity).toBeUndefined();
  });

  it('NULL confidence (heuristic rows) renders at the measured day-0 solidity and claims no percentage', async () => {
    await renderWithSafeArea(
      <ConfidenceBlock confidence={null} contentLabel="Deep work, 9:00 to 10:30">
        <ThemedText>{en['today.empty.body']}</ThemedText>
      </ConfidenceBlock>,
    );
    const expectedAlpha =
      lightColors.surfaceElevated.opacity * confidenceOpacity(NULL_CONFIDENCE_RENDER);
    expect(JSON.stringify(screen.toJSON())).toContain(
      hexWithAlpha(lightColors.surfaceElevated.color, expectedAlpha),
    );
    expect(screen.getByLabelText('Deep work, 9:00 to 10:30')).toBeTruthy();
    expect(screen.queryByLabelText(/Confidence/)).toBeNull();
    expect(NULL_CONFIDENCE_RENDER).toBeCloseTo(0.38, 2);
  });

  it('higher confidence renders a more solid panel (monotone in the tree)', async () => {
    await renderWithSafeArea(
      <ConfidenceBlock confidence={1}>
        <ThemedText>{en['today.empty.body']}</ThemedText>
      </ConfidenceBlock>,
    );
    expect(JSON.stringify(screen.toJSON())).toContain(
      hexWithAlpha(lightColors.surfaceElevated.color, lightColors.surfaceElevated.opacity),
    );
  });

  it('experiment blocks show the tag and dashed border', async () => {
    await renderWithSafeArea(
      <ConfidenceBlock confidence={0.25} isExperiment>
        <ThemedText>{en['today.empty.body']}</ThemedText>
      </ConfidenceBlock>,
    );
    expect(screen.getByText(en['block.experiment'])).toBeTruthy();
    expect(JSON.stringify(screen.toJSON())).toContain('"borderStyle":"dashed"');
  });

  it('non-experiment blocks carry no experiment tag', async () => {
    await renderWithSafeArea(
      <ConfidenceBlock confidence={0.9}>
        <ThemedText>{en['today.empty.body']}</ThemedText>
      </ConfidenceBlock>,
    );
    expect(screen.queryByText(en['block.experiment'])).toBeNull();
  });

  it('composes content, experiment tag, and confidence into one label (NFR-A1)', async () => {
    await renderWithSafeArea(
      <ConfidenceBlock confidence={0.82} isExperiment contentLabel="Deep work, 9:00 to 10:30">
        <ThemedText>{en['today.empty.body']}</ThemedText>
      </ConfidenceBlock>,
    );
    expect(
      screen.getByLabelText('Deep work, 9:00 to 10:30, Experiment, Confidence 82 percent'),
    ).toBeTruthy();
  });

  it('announces confidence alone when no content label is given', async () => {
    await renderWithSafeArea(
      <ConfidenceBlock confidence={0.82}>
        <ThemedText>{en['today.empty.body']}</ThemedText>
      </ConfidenceBlock>,
    );
    expect(screen.getByLabelText('Confidence 82 percent')).toBeTruthy();
  });
});

describe('GlassPanel reduced transparency (NFR-A1/A2)', () => {
  it('renders an opaque pre-composited panel when Reduce Transparency is on', async () => {
    const hook = jest.requireMock('../useReduceTransparency') as {
      useReduceTransparency: jest.Mock;
    };
    hook.useReduceTransparency.mockReturnValueOnce(true);
    await renderWithSafeArea(
      <ConfidenceBlock confidence={0.4}>
        <ThemedText>{en['today.empty.body']}</ThemedText>
      </ConfidenceBlock>,
    );
    const json = JSON.stringify(screen.toJSON());
    const expectedAlpha = lightColors.surfaceElevated.opacity * confidenceOpacity(0.4);
    expect(json).toContain(
      blendOverHex(lightColors.surfaceElevated.color, expectedAlpha, lightColors.surface),
    );
    expect(json).not.toContain(hexWithAlpha(lightColors.surfaceElevated.color, expectedAlpha));
    // the plain-View branch (Android and this one) must not clip: on Android the clip blanked
    // cards with live controls (hardware pass day 5, item 9)
    expect(json).not.toContain('"overflow":"hidden"');
  });
});
