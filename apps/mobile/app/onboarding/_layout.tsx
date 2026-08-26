/**
 * Onboarding flow (UC-01): welcome → survey → hours → categories → seed tasks. Plain
 * stack, back gestures allowed (answers live in the ephemeral store, so going back never
 * loses them); headers hidden — each step renders its own title at content scale (NFR-A2).
 */
import { Stack } from 'expo-router';

import { useTheme } from '../../src/ui/theme';

export default function OnboardingLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.surface },
      }}
    />
  );
}
