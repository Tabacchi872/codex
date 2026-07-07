import { StyleSheet } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Azione non ancora collegata a nessuna logica: resa visivamente disabilitata
// invece di essere un bottone silenziosamente rotto (CLAUDE.md, regola 3).
export function DisabledAction({ label, note }: { label: string; note: string }) {
  const theme = useTheme();

  return (
    <ThemedView
      style={[styles.container, { borderColor: theme.border }]}
      accessibilityState={{ disabled: true }}>
      <ThemedText type="smallBold" themeColor="disabled">
        {label}
      </ThemedText>
      <ThemedText type="small" themeColor="disabled">
        {note}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
  },
});
