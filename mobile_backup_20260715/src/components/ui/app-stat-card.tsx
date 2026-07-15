import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppRadius, AppSpacing, AppTextStyle, useAppTheme } from '@/theme';

type AppStatCardProps = {
  value: string;
  label: string;
  icon?: ReactNode;
  accentColor?: string;
  onPress?: () => void;
  size?: 'sm' | 'lg';
  style?: StyleProp<ViewStyle>;
};

// Copre due usi del mockup: MetricChip (size="sm", righe di 3 metriche
// compatte sotto l'header, es. Home cliente) e la card KPI più grande usata
// per le griglie cliccabili (size="lg", es. dashboard superadmin/coach — non
// nel mockup originale ma stesso linguaggio visivo: card bianca, numero
// display in evidenza, label sotto). Il valore numerico eredita
// `accentColor` quando presente (es. rust per "scaduti", moss per "attivi"),
// coerente con l'uso di MetricCard nella dashboard superadmin pre-esistente.
// `style` sovrascrive il wrapper esterno (default flex:1): usarlo per
// forzare una larghezza fissa quando la card sta in una griglia a più
// colonne che deve andare a capo (es. width: '48.5%').
export function AppStatCard({ value, label, icon, accentColor, onPress, size = 'sm', style }: AppStatCardProps) {
  const { colors, cardShadow } = useAppTheme();

  const card = (
    <View
      style={[
        styles.card,
        size === 'lg' && styles.cardLg,
        { backgroundColor: colors.surface, borderColor: colors.border },
        cardShadow,
      ]}>
      {icon}
      <Text
        style={[AppTextStyle.metricValue, size === 'lg' && styles.valueLg, { color: accentColor ?? colors.ink }]}
        numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.label, { color: colors.inkSoft }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );

  if (!onPress) return <View style={[styles.pressable, style]}>{card}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      style={[styles.pressable, style]}>
      {card}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    flex: 1,
    minWidth: 0,
  },
  card: {
    flex: 1,
    minWidth: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: AppRadius.xl,
    padding: AppSpacing[3],
    gap: AppSpacing[2],
  },
  cardLg: {
    minHeight: 104,
    justifyContent: 'center',
    gap: AppSpacing[1],
  },
  valueLg: {
    fontSize: 28,
  },
  label: {
    fontSize: 10.5,
    fontWeight: '600',
    lineHeight: 13,
  },
});
