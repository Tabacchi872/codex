import { StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';

import { Radius, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'positive' | ThemeColor }) {
  const theme = useTheme();

  const isPositive = tone === 'positive' || tone === 'primary' || tone === 'statusActive';
  const color = isPositive ? theme.statusActive : tone === 'neutral' ? theme.textSecondary : theme[tone as ThemeColor];
  const backgroundColor = isPositive ? theme.backgroundSelected : theme.background;

  return (
    <View style={[styles.pill, { backgroundColor, borderColor: isPositive ? color : theme.border }]}>
      <ThemedText type="small" style={[styles.label, { color }]} numberOfLines={1}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
});
