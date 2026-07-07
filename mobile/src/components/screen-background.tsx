import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { FitnessPattern } from './fitness-pattern';

import { useEffectiveColorScheme } from '@/hooks/use-effective-color-scheme';
import { useTheme } from '@/hooks/use-theme';

// Sfondo comune a tutte le schermate: colore di sfondo del tema + un pattern
// grafico leggerissimo (mai un'immagine pesante), sempre dietro al contenuto
// reale e mai sopra (pointerEvents="none", zIndex implicito di ordine DOM).
// Un solo componente invece di ripetere lo sfondo in ogni schermata: se cambia
// il pattern o l'opacità, si cambia qui una volta sola.
export function ScreenBackground({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const scheme = useEffectiveColorScheme();
  // In dark mode il pattern deve essere ancora più discreto: la superficie è
  // scura e ogni forma chiara vi risalta di più a parità di opacità.
  const patternOpacity = scheme === 'dark' ? 0.035 : 0.06;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[StyleSheet.absoluteFill, { opacity: patternOpacity }]} pointerEvents="none">
        <FitnessPattern color={theme.text} />
      </View>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});
