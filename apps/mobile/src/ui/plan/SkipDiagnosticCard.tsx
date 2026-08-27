/**
 * UC-04 A2 — one diagnostic question on the third consecutive skip/lapse (too big? wrong time?
 * not important?). Inline, dismissible ("ask me later"), neutral tone; each answer routes to a
 * concrete, reversible change explained on the card.
 */
import { StyleSheet, View } from 'react-native';

import type { SkipDiagnosticAnswer } from '../../db/feedback';
import { t } from '../../i18n';
import { Button, GlassPanel, ThemedText } from '../primitives';

export interface SkipDiagnosticCardProps {
  title: string;
  onAnswer: (answer: SkipDiagnosticAnswer) => void;
  onLater: () => void;
}

export function SkipDiagnosticCard({ title, onAnswer, onLater }: SkipDiagnosticCardProps) {
  return (
    <GlassPanel solidity={1} style={styles.panel} accessibilityLabel={t('diagnostic.title')}>
      <ThemedText variant="body">{t('diagnostic.title')}</ThemedText>
      <ThemedText variant="caption" tone="secondary">
        {title}
      </ThemedText>
      <View style={styles.row}>
        <Button
          label={t('diagnostic.tooBig')}
          kind="secondary"
          onPress={() => onAnswer('too_big')}
        />
        <Button
          label={t('diagnostic.wrongTime')}
          kind="secondary"
          onPress={() => onAnswer('wrong_time')}
        />
        <Button
          label={t('diagnostic.notImportant')}
          kind="secondary"
          onPress={() => onAnswer('not_important')}
        />
        <Button label={t('diagnostic.later')} kind="secondary" onPress={onLater} />
      </View>
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  panel: { marginBottom: 12, gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
