import { StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';

import { Radius } from '@/constants/theme';
import type { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Badge piccolo e leggibile (gruppo muscolare, stato video, ecc.), mai decorativo:
// ogni pill comunica un dato reale (categoria o stato), non un colore a caso.
export function Pill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'positive' | ThemeColor }) {
  const theme = useTheme();

  const color =
    tone === 'positive' ? theme.statusActive : tone === 'neutral' ? theme.textSecondary : theme[tone as ThemeColor];
  const backgroundColor =
    tone === 'positive' ? theme.backgroundSelected : tone === 'primary' ? theme.softRed : theme.background;

  return (
    <View style={[styles.pill, { backgroundColor, borderColor: theme.border }]}>
      <ThemedText type="small" style={[styles.label, { color }]}>
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
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
});
