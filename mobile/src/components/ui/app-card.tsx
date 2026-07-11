import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppRadius, AppSpacing, useAppTheme } from '@/theme';

type AppCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
};

// Contenitore card unico del nuovo design system: bianco (surface) su sfondo
// cream, bordo sottile + ombra leggera, radius 20 (AppRadius.xxl) come nel
// mockup. Se riceve onPress diventa un Pressable (per righe cliccabili tipo
// "storico pesi", KPI superadmin, esercizio in scheda).
export function AppCard({ children, style, padded = true, onPress, accessibilityLabel }: AppCardProps) {
  const { colors, cardShadow } = useAppTheme();

  const content = (
    <View
      style={[
        styles.card,
        padded && styles.padded,
        { backgroundColor: colors.surface, borderColor: colors.border },
        cardShadow,
        style,
      ]}>
      {children}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} hitSlop={2}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: AppRadius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  padded: {
    padding: AppSpacing[4],
    gap: AppSpacing[1],
  },
});
