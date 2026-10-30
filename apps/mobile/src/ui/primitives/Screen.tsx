/**
 * Screen container: themed `surface` background + safe-area padding. Content flows top-down
 * with generous whitespace (File 02 §3.1); primary actions belong in the bottom 60%
 * (File 02 §3.4 one-thumb reachability) — screens, not this container, enforce that.
 *
 * `topInset` is for HEADERLESS screens (onboarding, auth-callback): under a navigation
 * header the top inset is already consumed, so it stays opt-in (P4 Maestro walk caught the
 * status-bar collision).
 *
 * `bottomInset={false}` is for TAB screens: the tab bar already pads itself for the home
 * indicator, so a second bottom inset left a blank band above it and cut the Today list and the
 * Insights map 34 pt early on a notched iPhone (рис. 3.4 shots, 2026-10-30).
 */
import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme';

const PADDING_H = 20;

export function Screen({
  children,
  topInset = false,
  bottomInset = true,
}: PropsWithChildren<{ topInset?: boolean; bottomInset?: boolean }>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.colors.surface,
          paddingTop: 16 + (topInset ? insets.top : 0),
          paddingBottom: bottomInset ? insets.bottom : 0,
          paddingLeft: insets.left + PADDING_H,
          paddingRight: insets.right + PADDING_H,
        },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
