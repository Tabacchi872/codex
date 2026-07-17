import { StyleSheet, Text, View } from 'react-native';

import { AppCard } from './ui';

import { AppFontSize, useAppTheme } from '@/theme';

// Tema bloccato su scuro: il selettore resta disattivato finche' il design
// light non viene riaperto.
export function ThemeSettings() {
  const { colors } = useAppTheme();

  return (
    <AppCard>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text style={[styles.label, { color: colors.ink }]}>Tema scuro</Text>
          <Text style={[styles.description, { color: colors.inkSoft }]}>Selezione tema disattivata temporaneamente.</Text>
        </View>
        <View style={[styles.lockedBadge, { backgroundColor: colors.mossSoft, borderColor: colors.moss }]}>
          <Text style={[styles.lockedBadgeText, { color: colors.moss }]}>Attivo</Text>
        </View>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: AppFontSize.md,
    fontWeight: '700',
  },
  description: {
    fontSize: AppFontSize.sm,
    fontWeight: '500',
    lineHeight: 18,
    marginTop: 3,
  },
  lockedBadge: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  lockedBadgeText: {
    fontSize: AppFontSize.xs,
    fontWeight: '800',
  },
});
