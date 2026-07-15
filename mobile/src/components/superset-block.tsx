import { Repeat2 } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppCard } from '@/components/ui';
import { AppFontSize, AppSpacing, useAppTheme } from '@/theme';
import { TECHNIQUE_LABEL, type TechniqueType } from '@/types/training';

export function SupersetBlock({
  technique,
  children,
}: {
  technique: Extract<TechniqueType, 'superset' | 'circuit'>;
  children: ReactNode;
}) {
  const { colors } = useAppTheme();

  return (
    <AppCard style={styles.container}>
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: colors.mossSoft }]}>
          <Repeat2 size={17} color={colors.moss} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.ink }]}>{TECHNIQUE_LABEL[technique]}</Text>
          <Text style={[styles.subtitle, { color: colors.inkSoft }]}>Esegui gli esercizi in sequenza</Text>
        </View>
      </View>
      <View style={styles.items}>{children}</View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: AppSpacing[2],
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[2],
    paddingBottom: AppSpacing[1],
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: AppFontSize.sm,
    fontWeight: '500',
  },
  items: {
    gap: AppSpacing[1],
  },
});
