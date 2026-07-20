import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';

export type AppButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'dark';
export type AppButtonSize = 'sm' | 'md' | 'lg';

type AppButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  icon?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
};

const HEIGHT: Record<AppButtonSize, number> = { sm: 36, md: 42, lg: 52 };
const FONT_SIZE: Record<AppButtonSize, number> = { sm: AppFontSize.xs, md: AppFontSize.sm, lg: 13 };

// Bottone unico del design system. `primary` (coral) è l'UNICO colore per
// azioni — "Inizia allenamento", "Salva", "Invia" — mai per stato. `secondary`
// (moss pieno) per azioni positive alternative. `outline`/`ghost` per azioni
// secondarie. `dark` (ink pieno, testo cream) replica il bottone "Riprova" di
// ErrorState nel mockup.
export function AppButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  disabled = false,
  loading = false,
  fullWidth = false,
  accessibilityLabel,
}: AppButtonProps) {
  const { colors } = useAppTheme();

  const palette = {
    primary: { bg: colors.moss, fg: colors.onMoss, border: 'transparent' },
    secondary: { bg: colors.coral, fg: colors.onCoral, border: 'transparent' },
    outline: { bg: 'transparent', fg: colors.ink, border: colors.border },
    ghost: { bg: 'transparent', fg: colors.inkSoft, border: 'transparent' },
    dark: { bg: colors.ink, fg: colors.background, border: 'transparent' },
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.base,
        {
          height: HEIGHT[size],
          borderRadius: AppRadius.lg,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: palette.border === 'transparent' ? 0 : StyleSheet.hairlineWidth,
          opacity: disabled ? 0.5 : pressed ? 0.88 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
      ]}>
      {loading ? (
        <ActivityIndicator color={palette.fg} size="small" />
      ) : (
        <View style={styles.row}>
          {icon}
          <Text style={[styles.label, { color: palette.fg, fontSize: FONT_SIZE[size] }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: AppSpacing[4],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing[2],
  },
  label: {
    fontWeight: '700',
  },
});
