/**
 * Insights screen (P9; FR-33/40/41, UC-08): renders from the cached document, the learning-mode
 * badge and prior provenance, the heatmap grid + text alternative, belief toggles that log a
 * label (local fact wins over the server's), the weekly review (adherence rows, learnings, the
 * "tell Hourwell" picker, done). The fetch, DB, live rows and actions are mocked — the write
 * path is covered in src/db/__tests__/insightsDao.test.ts.
 */
jest.mock('../db/client', () => ({ db: {} }));
// jest's react-native preset reports fontScale 2; the screen renders at 1× unless a test sets
// the scale itself (the NFR-A2 heatmap header test below)
let mockFontScale = 1;
jest.mock('../ui/useFontScale', () => ({ useFontScale: () => mockFontScale }));
const mockUseLiveRows = jest.fn();
jest.mock('../db/useLiveRows', () => ({
  useLiveRows: (build: unknown, tables: readonly string[]) => mockUseLiveRows(build, tables),
}));
const mockFetch = jest.fn();
const mockCached = jest.fn();
jest.mock('../sync/insights', () => ({
  fetchInsights: (...a: unknown[]) => mockFetch(...a),
  cachedInsights: () => mockCached(),
}));
const mockActions = {
  labelBeliefAction: jest.fn(),
  tellBestTimeAction: jest.fn(),
  completeWeeklyReviewAction: jest.fn(),
};
jest.mock('../domain/insightsActions', () => ({
  labelBeliefAction: (...a: unknown[]) => mockActions.labelBeliefAction(...a),
  tellBestTimeAction: (...a: unknown[]) => mockActions.tellBestTimeAction(...a),
  completeWeeklyReviewAction: (...a: unknown[]) => mockActions.completeWeeklyReviewAction(...a),
}));
const mockTrack = jest.fn();
jest.mock('../observability/analytics', () => ({ track: (...a: unknown[]) => mockTrack(...a) }));

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import InsightsScreen from '../../app/(tabs)/insights';
import type { EventRow } from '../db/insights';
import { DAYPART_ORDER, type InsightsDocument, isoWeekOf } from '../domain/heatmap';
import { en } from '../i18n/en';

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const withSafeArea = (ui: ReactElement) => (
  <SafeAreaProvider initialMetrics={initialMetrics}>{ui}</SafeAreaProvider>
);

function doc(over: Partial<InsightsDocument> = {}): InsightsDocument {
  const heatmap = (['weekday', 'weekend'] as const).flatMap((day_type) =>
    DAYPART_ORDER.map((daypart) => ({
      category: 'deep' as const,
      daypart,
      day_type,
      mean: daypart === 'MO' ? 0.74 : 0.5,
      ci: [0.4, 0.8] as [number, number],
      n_effective: daypart === 'MO' && day_type === 'weekday' ? 9 : 0,
      personal: daypart === 'MO' && day_type === 'weekday',
    })),
  );
  return {
    heatmap,
    beliefs: [
      {
        category: 'deep',
        day_type: 'weekday',
        daypart: 'MO',
        mean: 0.74,
        factor: 1.3,
        confidence: 0.7,
        n_effective: 9,
        personal: true,
        affinity: true,
        state_ref: 'beta:deep.MO.weekday',
        label: null,
      },
      {
        category: 'admin',
        day_type: 'weekend',
        daypart: 'AF',
        mean: 0.52,
        factor: 1.02,
        confidence: 0.3,
        n_effective: 0,
        personal: false,
        affinity: false,
        state_ref: 'beta:admin.AF.weekend',
        label: 'incorrect',
      },
    ],
    adherence: [
      { week: '2026-W34', par: 0.5, n: 6 },
      { week: '2026-W35', par: 0.667, n: 6 },
    ],
    learning_mode: true,
    labels: [
      {
        state_ref: 'beta:admin.AF.weekend',
        label: 'incorrect',
        labeled_at: '2026-08-28T10:00:00Z',
      },
    ],
    chronotype_class: 'MM',
    survey_skipped: false,
    generated_at: '2026-08-29T10:00:00Z',
    ...over,
  };
}

function labelRow(stateRef: string, label: string, iso: string, acked = false): EventRow {
  return {
    localId: 1,
    opId: `dev-${iso}`,
    userId: 'local:u',
    type: 'belief_label',
    taskId: null,
    recommendationId: null,
    payload: { state_ref: stateRef, label, surface: 'beliefs' },
    context: {},
    clientTs: new Date(iso),
    serverTs: acked ? new Date(iso) : null,
    localDay: iso.slice(0, 10),
    serverSeq: null,
  };
}

let labelRows: EventRow[] = [];
let reviewRows: EventRow[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  labelRows = [];
  reviewRows = [];
  mockUseLiveRows.mockImplementation((_build: unknown, tables: readonly string[]) => {
    if (tables[0] !== 'events') return [];
    // the screen asks twice: labels first, then reviews (call order is stable per render)
    return mockUseLiveRows.mock.calls.length % 2 === 1 ? labelRows : reviewRows;
  });
  mockCached.mockReturnValue(null);
  mockFetch.mockResolvedValue({ kind: 'ok', doc: doc(), fetchedAt: Date.now() });
});

async function renderScreen() {
  await render(withSafeArea(<InsightsScreen />));
  await act(async () => {
    await Promise.resolve();
  });
}

describe('InsightsScreen', () => {
  it('renders the empty state before any document, then the sections after the fetch', async () => {
    mockFetch.mockResolvedValueOnce(new Promise(() => undefined)); // never resolves
    await render(withSafeArea(<InsightsScreen />));
    expect(screen.getByText(en['insights.empty.title'])).toBeTruthy();
  });

  it('shows learning mode + prior provenance, the heatmap, beliefs and the review from the fetched document', async () => {
    await renderScreen();
    expect(screen.getByText(en['insights.learningMode.title'])).toBeTruthy();
    expect(screen.getByText(/a moderate morning type/)).toBeTruthy();
    expect(screen.getByTestId('heatmap-grid')).toBeTruthy();
    expect(screen.getByTestId('heatmap-cell-9-0')).toBeTruthy();
    expect(screen.getByText(en['beliefs.title'])).toBeTruthy();
    expect(
      screen.getAllByText(/You finish deep work most reliably in the morning on weekdays/).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/No strong preference yet for admin on weekends/).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(en['review.title'])).toBeTruthy();
    expect(screen.getByText(/67 percent of 6 blocks/)).toBeTruthy();
    expect(screen.getByText(en['review.trend.up'])).toBeTruthy();
    expect(mockTrack).toHaveBeenCalledWith(
      'insights_viewed',
      expect.objectContaining({ learning_mode: true }),
    );
  });

  it('renders from the cache when the network is down, with an honest "as of" notice', async () => {
    mockCached.mockReturnValue({
      doc: doc({ learning_mode: false, chronotype_class: null, survey_skipped: true }),
      fetchedAt: Date.now() - 3 * 60_000,
    });
    mockFetch.mockResolvedValue({ kind: 'offline' });
    await renderScreen();
    expect(screen.getByText(/Offline — showing what Hourwell knew 3 min ago/)).toBeTruthy();
    expect(screen.getByText(en['insights.personalMode.body'])).toBeTruthy();
    expect(screen.getByText(en['insights.chronotype.skipped'])).toBeTruthy();
  });

  it('the grid has one accessible summary and a text alternative', async () => {
    await renderScreen();
    const grid = screen.getByTestId('heatmap-grid');
    expect(grid.props.accessibilityLabel).toMatch(
      /On weekdays your best time is morning \(74 percent\)/,
    );
    await fireEvent.press(screen.getByText(en['heatmap.showText']));
    expect(screen.getByText(en['heatmap.text.weekday'])).toBeTruthy();
    expect(screen.getByText('morning: 74 percent (from your days)')).toBeTruthy();
    expect(screen.queryByTestId('heatmap-grid')).toBeNull();
    await fireEvent.press(screen.getByTestId('heatmap-category-admin'));
    expect(screen.getAllByText(/No modelled hours yet/).length).toBe(2);
  });

  it('a belief toggle logs a label; a newer local fact overrides the server label and shows pending', async () => {
    labelRows = [labelRow('beta:admin.AF.weekend', 'correct', '2026-08-29T09:00:00Z')];
    await renderScreen();
    await fireEvent.press(screen.getAllByTestId('belief-correct-beta:deep.MO.weekday')[0]!);
    expect(mockActions.labelBeliefAction).toHaveBeenCalledWith(
      expect.objectContaining({ state_ref: 'beta:deep.MO.weekday' }),
      'correct',
      'beliefs',
    );
    // server says incorrect (2026-08-28), the device said correct later (2026-08-29) → correct + pending
    expect(
      screen.getAllByText(/You confirmed this\. Saved — Hourwell applies it at the next sync\./)
        .length,
    ).toBeGreaterThan(0);
    // pressing the selected toggle again clears it
    await fireEvent.press(screen.getAllByTestId('belief-correct-beta:admin.AF.weekend')[0]!);
    expect(mockActions.labelBeliefAction).toHaveBeenLastCalledWith(
      expect.anything(),
      'none',
      'beliefs',
    );
  });

  it('the review picker logs a ✓ on the chosen cell and "done" records the review for this week', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId('tell-deep-EM'));
    expect(mockActions.tellBestTimeAction).toHaveBeenCalledWith('deep', 'EM');
    expect(screen.getByText(/Noted: deep work in the early morning/)).toBeTruthy();
    await fireEvent.press(screen.getByText(en['review.done']));
    expect(mockActions.completeWeeklyReviewAction).toHaveBeenCalledWith({
      week: isoWeekOf(new Date()),
      learnings: 2,
      labelsSet: 1,
      trend: 'up',
    });
  });

  it('a review already completed this week shows the thanks line instead of the button', async () => {
    reviewRows = [
      {
        ...labelRow('x', 'none', '2026-08-29T09:00:00Z'),
        type: 'weekly_review_completed',
        payload: { week: isoWeekOf(new Date()) },
      },
    ];
    await renderScreen();
    expect(screen.queryByText(en['review.done'])).toBeNull();
    expect(screen.getByText(en['review.done.thanks'])).toBeTruthy();
  });
});

describe('heatmap weekday header at large font scales (FR-40 / NFR-A2 — hardware pass #14b)', () => {
  afterEach(() => {
    mockFontScale = 1;
  });

  it('at 1× the header reads Mon…Sun on one line each', async () => {
    await renderScreen();
    const wed = screen.getByTestId('heatmap-weekday-2');
    expect(wed.props.children).toBe(en['weekday.2']);
    expect(wed.props.numberOfLines).toBe(1);
  });

  it('at fontScale 2 the header switches to two-letter labels and the grid summary label is unchanged', async () => {
    mockFontScale = 2;
    await renderScreen();
    expect(screen.getByTestId('heatmap-weekday-2').props.children).toBe(en['weekday.short.2']);
    expect(screen.queryByText(en['weekday.2'])).toBeNull();
    expect(screen.getByTestId('heatmap-grid').props.accessibilityLabel).toMatch(
      /On weekdays your best time is morning \(74 percent\)/,
    );
    for (let d = 0; d < 7; d += 1) {
      const label = screen.getByTestId(`heatmap-weekday-${d}`);
      expect(label.props.numberOfLines).toBe(1);
      expect(label.props.importantForAccessibility).toBe('no');
    }
  });

  it('the switch point is 150 % (below it the full labels stay)', async () => {
    mockFontScale = 1.3;
    await renderScreen();
    expect(screen.getByTestId('heatmap-weekday-0').props.children).toBe(en['weekday.0']);
  });
});
