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
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { t } from '../src/i18n';
import { useTheme } from '../src/ui/theme';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden (fast reload) — nothing to hold.
});

export default function RootLayout() {
  const theme = useTheme();
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_600SemiBold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {
        // Hiding twice is harmless.
      });
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null; // splash stays up; fonts are local assets so this is milliseconds
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
