/**
 * FR-24 / UC-05 — the over-committed day. The planner could not honour every constraint, so the
 * user decides what gives: the server's ranked options (drop / shrink / move past deadline /
 * unpin) with their consequences, or "keep it as is" (UC-05 A1: manual edit mode, overload
 * logged). Inline on Today, never modal-blocking; the reject action is a quiet secondary button
 * (skip is never red — invariant 14). Rows wrap so 200 % font scale grows the sheet (NFR-A2).
 */
import { Pressable, StyleSheet, View } from 'react-native';

import {
  type TradeOffOption,
  tradeoffConsequence,
  tradeoffOptionLabel,
} from '../../domain/tradeoff';
import { t } from '../../i18n';
import { Button, GlassPanel, ThemedText } from '../primitives';
import { useTheme } from '../theme';

export interface TradeOffSheetProps {
  options: TradeOffOption[];
  titles: Map<string, string>;
  onChoose: (option: TradeOffOption, rank: number) => void;
  onReject: () => void;
}

export function TradeOffSheet({ options, titles, onChoose, onReject }: TradeOffSheetProps) {
  const theme = useTheme();
  return (
    <GlassPanel solidity={1} style={styles.panel} accessibilityLabel={t('tradeoff.title')}>
      <ThemedText variant="h2">{t('tradeoff.title')}</ThemedText>
      <ThemedText variant="caption" tone="secondary">
        {t('tradeoff.body')}
      </ThemedText>
      <View style={styles.list}>
        {options.map((option, i) => {
          const rank = i + 1;
          const title = titles.get(option.task_id) ?? t('task.notFound');
          const label = tradeoffOptionLabel(option, title);
          const consequence = tradeoffConsequence(option);
          return (
            <Pressable
              key={`${option.kind}-${option.task_id}-${i}`}
              accessibilityRole="button"
              accessibilityLabel={t('tradeoff.option.a11y', { rank, label, consequence })}
              onPress={() => onChoose(option, rank)}
              style={({ pressed }) => [
                styles.option,
                { borderColor: theme.colors.primaryContainer },
                pressed && styles.pressed,
              ]}
              testID={`tradeoff-option-${rank}`}
            >
              <ThemedText variant="body" mono style={styles.rank}>
                {t('tradeoff.rank', { rank })}
              </ThemedText>
              <View style={styles.optionText}>
                <ThemedText variant="body">{label}</ThemedText>
                <ThemedText variant="caption" tone="secondary">
                  {consequence}
                </ThemedText>
              </View>
            </Pressable>
          );
        })}
      </View>
      <Button label={t('tradeoff.reject')} kind="secondary" onPress={onReject} />
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  panel: { marginBottom: 12, gap: 8 },
  list: { gap: 8, marginVertical: 4 },
  option: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionText: { flex: 1, gap: 2 },
  rank: { minWidth: 24 },
  pressed: { opacity: 0.7 },
});
