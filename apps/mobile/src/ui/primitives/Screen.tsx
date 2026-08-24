/**
 * Screen container: themed `surface` background + safe-area padding. Content flows top-down
 * with generous whitespace (File 02 §3.1); primary actions belong in the bottom 60%
 * (File 02 §3.4 one-thumb reachability) — screens, not this container, enforce that.
 */
import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme';

const PADDING_H = 20;

export function Screen({ children }: PropsWithChildren) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.colors.surface,
          paddingBottom: insets.bottom,
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
  root: { flex: 1, paddingTop: 16 },
});
