/**
 * Onboarding draft — ephemeral-UI Zustand store (File 03 §2.1). Holds in-progress answers
 * between steps; nothing here is domain data until completeOnboardingAction persists it
 * (killed mid-onboarding = start over, by design — the whole flow is under 3 minutes).
 */
import { create } from 'zustand';

import { emptyRmeqAnswers } from '../domain/rmeq';
import type { RmeqAnswers, RmeqItemId } from '../domain/rmeq';
import {
  DEFAULT_SLEEP_WINDOW,
  DEFAULT_WORKING_HOURS,
  type MinuteRange,
  type WorkingHours,
} from '../domain/workingHours';

interface OnboardingState {
  answers: RmeqAnswers;
  workingHours: WorkingHours;
  sleepWindow: MinuteRange;
  topCategories: string[];
  seedTasksAdded: number;
  setAnswer: (item: RmeqItemId, optionIndex: number | null) => void;
  setWorkingHours: (hours: WorkingHours) => void;
  setSleepWindow: (window: MinuteRange) => void;
  toggleCategory: (category: string) => void;
  countSeedTask: () => void;
  reset: () => void;
}

const initial = () => ({
  answers: emptyRmeqAnswers(),
  workingHours: DEFAULT_WORKING_HOURS,
  sleepWindow: DEFAULT_SLEEP_WINDOW,
  topCategories: [] as string[],
  seedTasksAdded: 0,
});

export const useOnboardingStore = create<OnboardingState>((set) => ({
  ...initial(),
  setAnswer: (item, optionIndex) =>
    set((s) => ({ answers: { ...s.answers, [item]: optionIndex } })),
  setWorkingHours: (workingHours) => set({ workingHours }),
  setSleepWindow: (sleepWindow) => set({ sleepWindow }),
  toggleCategory: (category) =>
    set((s) => ({
      topCategories: s.topCategories.includes(category)
        ? s.topCategories.filter((c) => c !== category)
        : [...s.topCategories, category],
    })),
  countSeedTask: () => set((s) => ({ seedTasksAdded: s.seedTasksAdded + 1 })),
  reset: () => set(initial()),
}));
