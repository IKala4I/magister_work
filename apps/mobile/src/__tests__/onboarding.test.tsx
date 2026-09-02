/**
 * Onboarding flow tests (FR-02, UC-01): the routing gate sends un-onboarded users to
 * /onboarding; the survey exposes all 5 rMEQ items with per-item skip (deselect) and the
 * neutral skip note (no guilt UI); completion assembles the profile draft exactly per
 * File 04 §3.1 for both the answered and the skipped path.
 */
jest.mock('../db/client', () => ({ db: {} }));
// Reactivity driver only — the gate's truth comes from getProfile (mocked below).
jest.mock('../db/useLiveRows', () => ({ useLiveRows: () => [] }));
jest.mock('../db/profile', () => ({
  saveProfile: jest.fn((_db: unknown, args: { userId: string; draft: unknown }) => ({
    userId: args.userId,
    ...(args.draft as Record<string, unknown>),
  })),
  getProfile: jest.fn(() => undefined),
  markProfileSynced: jest.fn(),
}));
jest.mock('../sync/engine', () => ({
  scheduleSync: jest.fn(),
  syncNow: jest.fn(() => Promise.resolve({ kind: 'no-session' })),
}));
jest.mock('../observability/analytics', () => ({
  track: jest.fn(),
  initAnalytics: jest.fn(),
}));
// the seed step's quick-add writes through the task actions (DB path, covered in src/db tests)
jest.mock('../domain/taskActions', () => ({
  createTaskAction: jest.fn(),
  updateTaskAction: jest.fn(),
  deleteTaskAction: jest.fn(),
  restoreTaskAction: jest.fn(),
}));

import { fireEvent, render, screen } from '@testing-library/react-native';
import { renderRouter, screen as routerScreen } from 'expo-router/testing-library';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ReactElement } from 'react';

import TabsLayout from '../../app/(tabs)/_layout';
import OnboardingWelcome from '../../app/onboarding/index';
import SurveyScreen from '../../app/onboarding/survey';
import SeedTasksScreen from '../../app/onboarding/seed-tasks';
import { completeOnboardingAction } from '../domain/onboarding';
import { saveProfile } from '../db/profile';
import { emptyRmeqAnswers } from '../domain/rmeq';
import { DEFAULT_SLEEP_WINDOW, DEFAULT_WORKING_HOURS } from '../domain/workingHours';
import { en } from '../i18n/en';
import { track } from '../observability/analytics';
import { useOnboardingStore } from '../state/onboarding';

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const withSafeArea = (ui: ReactElement) => (
  <SafeAreaProvider initialMetrics={initialMetrics}>{ui}</SafeAreaProvider>
);

const saveProfileMock = saveProfile as jest.Mock;
const trackMock = track as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useOnboardingStore.getState().reset();
});

describe('UC-01 routing gate', () => {
  it('redirects to /onboarding when no completed profile exists', async () => {
    await renderRouter(
      {
        '(tabs)/_layout': TabsLayout,
        '(tabs)/index': () => null,
        'onboarding/index': OnboardingWelcome,
      },
      { initialUrl: '/' },
    );
    // The redirect landed: welcome copy is on screen instead of the Today tab.
    expect(routerScreen.getByText(en['onboarding.welcome.title'])).toBeOnTheScreen();
    expect(routerScreen.queryByText(en['tabs.today'])).toBeNull();
  });
});

describe('rMEQ survey screen', () => {
  it('renders all five instrument items with their options', async () => {
    await render(withSafeArea(<SurveyScreen />));
    for (const key of [
      'onboarding.rmeq.wakeTime.q',
      'onboarding.rmeq.morningFeel.q',
      'onboarding.rmeq.eveningSleepy.q',
      'onboarding.rmeq.bestTime.q',
      'onboarding.rmeq.selfType.q',
    ] as const) {
      expect(screen.getByText(en[key])).toBeOnTheScreen();
    }
    expect(screen.getAllByRole('radio')).toHaveLength(5 + 4 + 5 + 5 + 4);
  });

  it('answers store; tapping again clears (per-item skip, FR-02)', async () => {
    await render(withSafeArea(<SurveyScreen />));
    const option = screen.getByText(en['onboarding.rmeq.selfType.o1']);
    await fireEvent.press(option);
    expect(useOnboardingStore.getState().answers.selfType).toBe(0);
    await fireEvent.press(option);
    expect(useOnboardingStore.getState().answers.selfType).toBeNull();
  });

  it('shows the neutral skip note while any item is blank, never guilt copy', async () => {
    await render(withSafeArea(<SurveyScreen />));
    expect(screen.getByText(en['onboarding.survey.skipNote'])).toBeOnTheScreen();
  });
});

describe('seed-tasks step (UC-01 step 4)', () => {
  it('teaches the NL example once — in the intro, not again under the quick-add (review F4)', async () => {
    await render(withSafeArea(<SeedTasksScreen />));
    expect(screen.getByText(en['onboarding.seedTasks.intro'])).toBeTruthy();
    expect(screen.queryByText(en['inbox.quickAdd.example'])).toBeNull();
    expect(screen.queryByTestId('quick-add-example')).toBeNull();
    // the example phrase appears exactly once on the screen (TalkBack reads it once)
    expect(screen.getAllByText(/report draft 2h by fri/i)).toHaveLength(1);
    // the quick-add itself is still there with its short placeholder
    expect(screen.getByLabelText(en['inbox.quickAdd.input.a11y']).props.placeholder).toBe(
      en['inbox.quickAdd.placeholder'],
    );
  });
});

describe('completeOnboardingAction (File 04 §3.1 wiring)', () => {
  it('answered survey persists score + matching class', () => {
    completeOnboardingAction({
      answers: { wakeTime: 0, morningFeel: 3, eveningSleepy: 0, bestTime: 0, selfType: 0 },
      workingHours: DEFAULT_WORKING_HOURS,
      sleepWindow: DEFAULT_SLEEP_WINDOW,
      topCategories: ['deep'],
      seedTasksAdded: 2,
    });
    const draft = saveProfileMock.mock.calls[0][1].draft;
    expect(draft).toMatchObject({
      rmeqScore: 25,
      chronotypeClass: 'DM',
      surveySkipped: false,
      topCategories: ['deep'],
    });
    expect(draft.onboardingCompletedAt).toBeInstanceOf(Date);
    expect(trackMock).toHaveBeenCalledWith(
      'onboarding_completed',
      expect.objectContaining({ survey_skipped: false, chronotype_class: 'DM' }),
    );
  });

  it('skipped survey persists INT with no score and the skip flag', () => {
    completeOnboardingAction({
      answers: emptyRmeqAnswers(),
      workingHours: DEFAULT_WORKING_HOURS,
      sleepWindow: DEFAULT_SLEEP_WINDOW,
      topCategories: [],
      seedTasksAdded: 0,
    });
    expect(saveProfileMock.mock.calls[0][1].draft).toMatchObject({
      rmeqScore: null,
      chronotypeClass: 'INT',
      surveySkipped: true,
    });
  });
});
