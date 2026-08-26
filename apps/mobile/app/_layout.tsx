/**
 * Root layout: fonts behind the splash screen (system-fallback stack per File 02 §3.3),
 * gesture-handler root, themed navigation chrome, Settings as a modal over the tab shell.
 */
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_600SemiBold,
} from '@expo-google-fonts/jetbrains-mono';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import migrations from '../drizzle/migrations';
import { initAuth } from '../src/auth/session';
import { db } from '../src/db/client';
import { t } from '../src/i18n';
import { initAnalytics } from '../src/observability/analytics';
import { initSentry, Sentry } from '../src/observability/sentry';
import { markFirstFrame } from '../src/observability/startup';
import { EmptyState, Screen } from '../src/ui/primitives';
import { useTheme } from '../src/ui/theme';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden (fast reload) — nothing to hold.
});

initSentry(); // env-gated: disabled without EXPO_PUBLIC_SENTRY_DSN
initAnalytics(); // env-gated: disabled without EXPO_PUBLIC_POSTHOG_API_KEY + _HOST (EU)
initAuth(); // env-gated: disabled without EXPO_PUBLIC_SUPABASE_URL + _ANON_KEY (local-only)

function RootLayout() {
  const theme = useTheme();
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_600SemiBold,
  });
  const { success: dbReady, error: dbError } = useMigrations(db, migrations);

  // A font failure must never trap the user behind the splash: proceed on the system
  // fallback stack (File 02 §3.3 specifies SF Pro/Roboto behind Inter for exactly this).
  const fontsReady = fontsLoaded || fontError != null;
  const ready = fontsReady && (dbReady || dbError !== undefined);

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync().catch(() => {
        // Hiding twice is harmless.
      });
    }
  }, [ready]);

  if (!ready) {
    return null; // splash stays up; fonts and migrations are local, this is milliseconds
  }

  if (dbError !== undefined) {
    // Fail visibly: an offline-first app without its database must not pretend to work.
    return (
      <Screen>
        <EmptyState title={t('db.migrationFailed.title')} body={t('db.migrationFailed.body')} />
      </Screen>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={markFirstFrame}>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.textPrimary,
          headerTitleStyle: { fontFamily: theme.fontFamilies.semiBold },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.colors.surface },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="auth/sign-in" options={{ title: t('auth.signIn.title') }} />
        <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
        <Stack.Screen
          name="settings"
          options={{ presentation: 'modal', title: t('settings.title') }}
        />
        <Stack.Screen
          name="task/new"
          options={{ presentation: 'modal', title: t('task.new.title') }}
        />
        <Stack.Screen
          name="task/[id]"
          options={{ presentation: 'modal', title: t('task.edit.title') }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);
