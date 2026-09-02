/**
 * Tab shell — Today · Inbox · Focus · Insights (File 02 §3.5 key screens; Settings is a
 * modal route, reachable from every tab header). Touch targets ≥44 px (NFR-A1).
 */
import { Ionicons } from '@expo/vector-icons';
import { Link, Redirect, Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useOnboardingComplete } from '../../src/db/useProfile';
import { t } from '../../src/i18n';
import { useNotificationScheduler } from '../../src/notifications/useNotificationScheduler';
import { ThemedText } from '../../src/ui/primitives';
import { useTheme } from '../../src/ui/theme';

function NewTaskButton() {
  const theme = useTheme();
  return (
    <Link href="/task/new" asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('task.new.title')}
        hitSlop={8}
        style={styles.settingsButton}
      >
        <Ionicons name="add" size={26} color={theme.colors.textPrimary} />
      </Pressable>
    </Link>
  );
}

function SettingsButton() {
  const theme = useTheme();
  return (
    <Link href="/settings" asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('settings.open.a11y')}
        hitSlop={8}
        style={styles.settingsButton}
      >
        <Ionicons name="settings-outline" size={22} color={theme.colors.textPrimary} />
      </Pressable>
    </Link>
  );
}

/**
 * Tab-bar glyph hidden from assistive tech (NFR-A1): the icon font renders a Text whose
 * private-use code point precedes the name when TalkBack composes the tab's label from its
 * children ("<glyph>, Today" on the Pixel 7a — hardware pass 2026-09-02 #8). iOS composes
 * "Today, tab, 1 of 4" itself; hiding the glyph there is a no-op.
 */
function TabIcon({
  name,
  color,
  size,
}: Pick<ComponentProps<typeof Ionicons>, 'name' | 'color' | 'size'>) {
  return (
    <Ionicons
      name={name}
      color={color}
      size={size}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    />
  );
}

function ScheduledTabs() {
  // P10 (FR-50): reminders follow the plan in the device database — mount, foreground, changes
  useNotificationScheduler();
  return null;
}

export default function TabsLayout() {
  const theme = useTheme();
  // UC-01 gate: no completed profile for the current identity → onboarding first.
  const onboarded = useOnboardingComplete();
  if (!onboarded) return <Redirect href="/onboarding" />;
  return (
    <>
      <ScheduledTabs />
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.textSecondary,
          tabBarStyle: { backgroundColor: theme.colors.surface },
          headerStyle: { backgroundColor: theme.colors.surface },
          // Header chrome is pinned at 1× like UIKit's own nav titles — the JS header bar
          // has a fixed height, so a scaling title clips at large accessibility sizes
          // (NFR-A2 sweep finding). Screen content scales to the 200% cap instead.
          headerTitle: ({ children }) => (
            <ThemedText variant="h2" numberOfLines={1} maxFontSizeMultiplier={1}>
              {children}
            </ThemedText>
          ),
          headerShadowVisible: false,
          headerRight: () => <SettingsButton />,
          sceneStyle: { backgroundColor: theme.colors.surface },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t('tabs.today'),
            tabBarIcon: ({ color, size }) => (
              <TabIcon name="today-outline" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="inbox"
          options={{
            title: t('tabs.inbox'),
            headerLeft: () => <NewTaskButton />,
            tabBarIcon: ({ color, size }) => (
              <TabIcon name="file-tray-outline" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="focus"
          options={{
            title: t('tabs.focus'),
            tabBarIcon: ({ color, size }) => (
              <TabIcon name="timer-outline" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="insights"
          options={{
            title: t('tabs.insights'),
            tabBarIcon: ({ color, size }) => (
              <TabIcon name="sparkles-outline" color={color} size={size} />
            ),
          }}
        />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  settingsButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
});
