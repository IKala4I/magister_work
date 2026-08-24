/**
 * Calm empty state (File 02 §3.1 "generous whitespace"; zero-guilt tone — an empty screen
 * is never an error state).
 */
import { StyleSheet, View } from 'react-native';

import { ThemedText } from './ThemedText';

export interface EmptyStateProps {
  title: string;
  body: string;
}

export function EmptyState({ title, body }: EmptyStateProps) {
  return (
    <View style={styles.root}>
      <ThemedText variant="h2" style={styles.title}>
        {title}
      </ThemedText>
      <ThemedText tone="secondary" style={styles.body}>
        {body}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 96 },
  title: { textAlign: 'center' },
  body: { textAlign: 'center', marginTop: 8, maxWidth: 280 },
});
