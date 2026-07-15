import { StyleSheet, Text, View } from 'react-native';

import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';

// Azione non ancora collegata a nessuna logica: resa visivamente disabilitata
// invece di essere un bottone silenziosamente rotto (CLAUDE.md, regola 3).
export function DisabledAction({ label, note }: { label: string; note: string }) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.container, { borderColor: colors.border }]} accessibilityState={{ disabled: true }}>
      <Text style={[styles.label, { color: colors.inkFaint }]}>{label}</Text>
      <Text style={[styles.note, { color: colors.inkFaint }]}>{note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: AppRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: AppSpacing[2],
    paddingHorizontal: AppSpacing[3],
    alignItems: 'center',
  },
  label: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  note: {
    fontSize: AppFontSize.sm,
  },
});
