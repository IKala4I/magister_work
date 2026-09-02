/**
 * The OS font scale as the primitives actually render it (NFR-A2): ThemedText caps the
 * multiplier at MAX_FONT_SCALE, so layout that must track text width — a fixed time gutter, a
 * column header — reads the same capped value and grows with the text instead of clipping it
 * (hardware pass 2026-09-02 #14: "12:00 PM" broke into "12:0 / 0 PM" in a 64 px gutter at
 * 200 %). Live via useWindowDimensions: iOS applies Dynamic Type changes without a restart.
 */
import { useWindowDimensions } from 'react-native';

import { MAX_FONT_SCALE } from './tokens/typography';

export function useFontScale(): number {
  const { fontScale } = useWindowDimensions();
  return Math.min(Math.max(fontScale, 1), MAX_FONT_SCALE);
}
