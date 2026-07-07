import { StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';

import { STATUS_LABEL, WorkoutPlanStatus } from '@/types/training';
import { useTheme } from '@/hooks/use-theme';

export function StatusDot({ status }: { status: WorkoutPlanStatus }) {
  const theme = useTheme();
  const color = status === 'active' ? theme.statusActive : status === 'expiring' ? theme.statusWarning : theme.statusExpired;

  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <ThemedText type="small" style={{ color }}>
        {STATUS_LABEL[status]}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
});
