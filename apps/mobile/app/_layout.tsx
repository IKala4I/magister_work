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
import { db } from '../src/db/client';
import { t } from '../src/i18n';
import { initSentry, Sentry } from '../src/observability/sentry';
import { markFirstFrame } from '../src/observability/startup';
import { EmptyState, Screen } from '../src/ui/primitives';
import { useTheme } from '../src/ui/theme';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden (fast reload) — nothing to hold.
});

initSentry(); // env-gated: disabled without EXPO_PUBLIC_SENTRY_DSN

function RootLayout() {
  const theme = useTheme();
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_600SemiBold,
  });
  const { success: dbReady, error: dbError } = useMigrations(db, migrations);

  const ready = fontsLoaded && (dbReady || dbError !== undefined);

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
        <Stack.Screen
          name="settings"
          options={{ presentation: 'modal', title: t('settings.title') }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);
