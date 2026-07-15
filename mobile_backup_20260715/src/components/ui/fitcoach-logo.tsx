import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppFontSize, useAppTheme } from '@/theme';

type FitCoachLogoProps = {
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
};

const SIZE = {
  sm: { main: 18, pro: AppFontSize.sm },
  md: { main: 22, pro: AppFontSize.base },
  lg: { main: 28, pro: AppFontSize.md },
} as const;

export function FitCoachLogo({ size = 'md', style }: FitCoachLogoProps) {
  const { colors } = useAppTheme();
  const token = SIZE[size];

  return (
    <View style={[styles.root, style]} accessibilityRole="text">
      <View style={styles.textRow}>
        <Text style={[styles.fit, { color: colors.ink, fontSize: token.main }]}>FitCoach</Text>
        <Text style={[styles.pro, { color: colors.coral, fontSize: token.pro }]}>Pro</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    flexDirection: 'row',
    minWidth: 0,
  },
  textRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 4,
    minWidth: 0,
  },
  fit: {
    fontStyle: 'italic',
    fontWeight: '800',
    letterSpacing: 0,
  },
  pro: {
    fontStyle: 'italic',
    fontWeight: '800',
    letterSpacing: 0,
  },
});
