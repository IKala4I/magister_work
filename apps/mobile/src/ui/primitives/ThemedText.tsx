/**
 * Text primitive: File 02 §3.3 scale + theme colors. Font scaling stays ON (NFR-A2) with
 * the multiplier capped at 200% so the no-breakage guarantee is bounded and testable.
 */
import { Text, type TextProps } from 'react-native';

import { useTheme } from '../theme';
import { MAX_FONT_SCALE, type TypeVariantName } from '../tokens/typography';

export interface ThemedTextProps extends TextProps {
  variant?: TypeVariantName;
  tone?: 'primary' | 'secondary';
  /** JetBrains Mono for numerals/timers (File 02 §3.3) — keeps digits from jittering. */
  mono?: boolean;
}

export function ThemedText({
  variant = 'body',
  tone = 'primary',
  mono = false,
  style,
  ...rest
}: ThemedTextProps) {
  const theme = useTheme();
  const base = theme.typeScale[variant];
  return (
    <Text
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      {...rest}
      style={[
        {
          fontFamily: mono ? theme.fontFamilies.mono : base.fontFamily,
          fontSize: base.fontSize,
          lineHeight: base.lineHeight,
          color: tone === 'primary' ? theme.colors.textPrimary : theme.colors.textSecondary,
        },
        style,
      ]}
    />
  );
}
