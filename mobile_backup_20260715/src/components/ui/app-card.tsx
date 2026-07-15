import { useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppRadius, AppSpacing, useAppTheme } from '@/theme';

type AppCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  /** @deprecated AppCard is visual only. Use AppPressableCard for single-action cards. */
  onPress?: never;
  /** @deprecated AppCard is visual only. Use AppPressableCard for single-action cards. */
  accessibilityLabel?: never;
};

type AppPressableCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
};

// Contenitore card visuale puro. Non deve mai generare un elemento interattivo:
// se una card intera e' una singola azione usare AppPressableCard, e non
// inserire al suo interno AppButton, Pressable, link, switch o input.
export function AppCard({ children, style, padded = true }: AppCardProps) {
  const { colors, cardShadow } = useAppTheme();

  return (
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
}

// Card azionabile per il solo caso in cui TUTTA la card rappresenta una singola
// azione. Vietati figli interattivi annidati: AppButton, Pressable, link,
// switch e input devono stare in AppCard visuali normali.
export function AppPressableCard({ children, style, padded = true, onPress, accessibilityLabel }: AppPressableCardProps) {
  const { colors, cardShadow } = useAppTheme();
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={2}
      style={({ pressed }) => [
        styles.card,
        padded && styles.padded,
        { backgroundColor: colors.surface, borderColor: focused ? colors.moss : colors.border },
        cardShadow,
        pressed && styles.pressed,
        focused && Platform.OS === 'web' ? styles.webFocus : null,
        style,
      ]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: AppRadius.xxl,
    borderWidth: 1,
  },
  padded: {
    padding: AppSpacing[4],
    gap: AppSpacing[1],
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  webFocus: {
    outlineColor: '#B7F04A',
    outlineStyle: 'solid',
    outlineWidth: 2,
  } as ViewStyle,
});
