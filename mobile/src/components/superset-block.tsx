import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { TECHNIQUE_LABEL, type TechniqueType } from '@/types/training';

// Blocco grigio chiaro che raggruppa visivamente gli esercizi da eseguire insieme
// (superserie o circuito), così è chiaro a colpo d'occhio che non sono esercizi
// indipendenti. Il glifo "⇄" comunica "cambio/rotazione tra esercizi" senza bisogno
// di un pacchetto icone: resta leggibile anche se il font non lo rende in modo
// identico su ogni piattaforma.
export function SupersetBlock({
  technique,
  children,
}: {
  technique: Extract<TechniqueType, 'superset' | 'circuit'>;
  children: ReactNode;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.background, borderColor: theme.border }]}>
      <View style={styles.header}>
        <ThemedText style={[styles.icon, { color: theme.primary }]}>⇄</ThemedText>
        <ThemedText type="smallBold">{TECHNIQUE_LABEL[technique]}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          — da eseguire insieme
        </ThemedText>
      </View>
      <View style={styles.items}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  icon: {
    fontSize: 16,
    fontWeight: '700',
  },
  items: {
    gap: Spacing.two,
  },
});
