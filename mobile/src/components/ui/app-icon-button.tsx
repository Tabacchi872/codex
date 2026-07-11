import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppRadius, useAppTheme } from '@/theme';

type Tone = 'default' | 'moss' | 'coral' | 'rust' | 'transparent';

type AppIconButtonProps = {
  icon: ReactNode;
  onPress?: () => void;
  tone?: Tone;
  size?: number;
  bordered?: boolean;
  accessibilityLabel: string;
  disabled?: boolean;
};

// Bottone icona quadrato (44x44 di default, come IconButton nel mockup):
// usato per back-in-header, azioni secondarie di una card, tasti tonda in
// alto a destra. `icon` è già un nodo renderizzato dal chiamante (Text con
// glifo/emoji, coerente con lo stile icone già in uso nel resto dell'app —
// nessuna libreria icone aggiunta in questo intervento).
export function AppIconButton({
  icon,
  onPress,
  tone = 'default',
  size = 44,
  bordered = true,
  accessibilityLabel,
  disabled = false,
}: AppIconButtonProps) {
  const { colors } = useAppTheme();

  const backgroundColor =
    tone === 'moss'
      ? colors.mossSoft
      : tone === 'coral'
        ? colors.coralSoft
        : tone === 'rust'
          ? colors.rustSoft
          : tone === 'transparent'
            ? 'transparent'
            : colors.surface;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      style={({ pressed }) => [{ opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }]}>
      <View
        style={[
          styles.base,
          {
            width: size,
            height: size,
            borderRadius: AppRadius.md,
            backgroundColor,
            borderColor: colors.border,
            borderWidth: bordered && tone !== 'transparent' ? StyleSheet.hairlineWidth : 0,
          },
        ]}>
        {icon}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
