import { StyleSheet, View, type ViewProps } from 'react-native';

import { CardShadow, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Contenitore "card" unico per tutta l'app: bordo sottile + ombra leggera + radius
// coerente. Sostituisce i blocchi ThemedView piatti usati finora per liste/sezioni.
export function Card({ style, padded = true, ...props }: ViewProps & { padded?: boolean }) {
  const theme = useTheme();

  return (
    <View
      {...props}
      style={[
        styles.card,
        padded && styles.padded,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        CardShadow,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  padded: {
    padding: Spacing.three,
    gap: Spacing.one,
  },
});
