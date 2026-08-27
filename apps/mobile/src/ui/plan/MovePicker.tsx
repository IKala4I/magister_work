/**
 * UC-07 "move" on the row-list timeline (ADR-0008 §7): a start-time picker instead of a physical
 * drag — the paired feedback is what the study needs; the drag gesture returns with the
 * proportional timeline (P9, revisit.md). Inline card, dismissible, never modal-blocking.
 */
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import type { RecommendationRow } from '../../db/plans';
import { t } from '../../i18n';
import { Button, GlassPanel, ThemedText } from '../primitives';

export interface MovePickerProps {
  recommendation: RecommendationRow;
  title: string;
  onConfirm: (toStart: Date) => void;
  onCancel: () => void;
}

/** Snap to the 15-min grid (File 04 §1.2) so a moved block stays a valid placement. */
export function snapToGrid(date: Date, tickMinutes = 15): Date {
  const snapped = new Date(date);
  snapped.setSeconds(0, 0);
  snapped.setMinutes(Math.round(snapped.getMinutes() / tickMinutes) * tickMinutes);
  return snapped;
}

export function MovePicker({ recommendation, title, onConfirm, onCancel }: MovePickerProps) {
  const [value, setValue] = useState<Date>(recommendation.slotStart);
  const handleChange = (_event: DateTimePickerEvent, picked?: Date) => {
    if (picked) setValue(snapToGrid(picked));
  };
  return (
    <GlassPanel solidity={1} style={styles.panel} accessibilityLabel={t('block.move.title')}>
      <ThemedText variant="body">
        {t('block.move.title')} · {title}
      </ThemedText>
      <DateTimePicker
        value={value}
        mode="time"
        minuteInterval={15}
        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
        onChange={handleChange}
        accessibilityLabel={t('block.move.a11y')}
      />
      <View style={styles.row}>
        <Button label={t('block.move.confirm')} onPress={() => onConfirm(value)} />
        <Button label={t('block.move.cancel')} kind="secondary" onPress={onCancel} />
      </View>
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  panel: { marginBottom: 12, gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
