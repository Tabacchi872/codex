import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset } from '@/constants/theme';
import { AppSpacing, useAppTheme } from '@/theme';

type AppScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
  bottomTabInset?: boolean;
  // Per le schermate con form lunghi (registrazione, login): avvolge il
  // contenuto in una KeyboardAvoidingView behavior="padding" — necessaria su
  // Android perche' l'app e' edge-to-edge (SDK 57, default) e adjustResize
  // NON ridimensiona piu' automaticamente la ScrollView: senza, la tastiera
  // copre gli ultimi campi e il form non resta scorrevole. Su web e' un
  // no-op (nessuna KeyboardAvoidingView montata).
  keyboardAvoiding?: boolean;
};

// Contenitore comune a ogni schermata migrata al nuovo design system: sfondo
// (cream/dark) pieno, padding orizzontale coerente (AppSpacing[5], come nel
// mockup), inset per la tab bar nativa in basso, footer opzionale "sticky"
// (bottone CTA fisso in fondo, come in ExerciseDetailScreen/ProfiloScreen del
// mockup). Sostituisce gradualmente ScreenBackground + ScrollView ripetuti a
// mano in ogni schermata — non tocca ScreenBackground/Card esistenti, che
// restano in uso nelle schermate non ancora migrate.
//
// Tastiera: keyboardShouldPersistTaps="handled" (un tocco su un bottone con
// tastiera aperta agisce SUBITO, senza il doppio tap; un tocco su area vuota
// chiude la tastiera) e keyboardDismissMode="on-drag" (scorrere chiude la
// tastiera) sono attivi su OGNI AppScreen scrollabile.
export function AppScreen({
  children,
  scroll = true,
  contentStyle,
  footer,
  bottomTabInset = true,
  keyboardAvoiding = false,
}: AppScreenProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  const paddingTop = Platform.OS === 'web' ? AppSpacing[5] : insets.top + AppSpacing[3];
  const paddingBottom = (bottomTabInset ? insets.bottom + BottomTabInset : insets.bottom) + AppSpacing[4];

  const body = (
    <>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop, paddingBottom }, contentStyle]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
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
    </>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {keyboardAvoiding && Platform.OS !== 'web' ? (
        <KeyboardAvoidingView style={styles.root} behavior="padding">
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
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
