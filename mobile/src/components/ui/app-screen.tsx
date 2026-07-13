import type { ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset } from '@/constants/theme';
import { AppSpacing, useAppTheme } from '@/theme';

type AppScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
  bottomTabInset?: boolean;
};

// Contenitore comune a ogni schermata migrata al nuovo design system: sfondo
// (cream/dark) pieno, padding orizzontale coerente (AppSpacing[5], come nel
// mockup), inset per la tab bar nativa in basso, footer opzionale "sticky"
// (bottone CTA fisso in fondo, come in ExerciseDetailScreen/ProfiloScreen del
// mockup). Sostituisce gradualmente ScreenBackground + ScrollView ripetuti a
// mano in ogni schermata — non tocca ScreenBackground/Card esistenti, che
// restano in uso nelle schermate non ancora migrate.
export function AppScreen({ children, scroll = true, contentStyle, footer, bottomTabInset = true }: AppScreenProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  const paddingTop = Platform.OS === 'web' ? AppSpacing[5] : insets.top + AppSpacing[3];
  const paddingBottom = (bottomTabInset ? insets.bottom + BottomTabInset : insets.bottom) + AppSpacing[4];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop, paddingBottom }, contentStyle]}
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.noScroll, { paddingTop, paddingBottom }, contentStyle]}>{children}</View>
      )}
      {footer ? (
        <View pointerEvents="box-none" style={[styles.footer, { paddingBottom: insets.bottom + AppSpacing[3] }]}>
          {footer}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: AppSpacing[5],
    gap: AppSpacing[3],
  },
  noScroll: {
    flex: 1,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: AppSpacing[5],
    paddingTop: AppSpacing[3],
  },
});
