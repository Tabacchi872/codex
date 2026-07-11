import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from './app-button';

import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';

type AppEmptyStateProps = {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
};

// Stato vuoto onesto (EmptyState nel mockup): icona in chip moss, titolo,
// spiegazione, azione opzionale. Va sempre dentro una AppCard dal chiamante
// (come nel mockup: <Card><EmptyState .../></Card>), non incapsula la card
// per poter essere riusato anche a piena larghezza.
export function AppEmptyState({ icon, title, subtitle, actionLabel, onAction }: AppEmptyStateProps) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.wrap}>
      {icon ? (
        <View style={[styles.iconWrap, { backgroundColor: colors.mossSoft }]}>{icon}</View>
      ) : null}
      <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, { color: colors.inkSoft }]}>{subtitle}</Text> : null}
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <AppButton label={actionLabel} onPress={onAction} size="sm" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'flex-start',
    gap: AppSpacing[2] + 2,
    paddingVertical: AppSpacing[2],
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: AppRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: AppFontSize.sm,
    lineHeight: AppFontSize.sm * 1.4,
  },
  action: {
    marginTop: AppSpacing[1],
  },
});
