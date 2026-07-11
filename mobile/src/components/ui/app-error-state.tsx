import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from './app-button';

import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';

type AppErrorStateProps = {
  message?: string;
  onRetry: () => void;
};

// Stato di errore (ErrorState nel mockup): icona rust, messaggio, bottone
// "Riprova" in stile `dark` (ink pieno) — mai coral, per non confondere "c'è
// stato un errore" con un invito ad agire positivo.
export function AppErrorState({ message, onRetry }: AppErrorStateProps) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.wrap}>
      <View style={[styles.iconWrap, { backgroundColor: colors.rustSoft }]}>
        <Text style={[styles.iconGlyph, { color: colors.rust }]}>!</Text>
      </View>
      <Text style={[styles.title, { color: colors.ink }]}>Impossibile caricare i dati</Text>
      <Text style={[styles.subtitle, { color: colors.inkSoft }]}>{message || 'Controlla la connessione e riprova.'}</Text>
      <View style={styles.action}>
        <AppButton label="Riprova" onPress={onRetry} variant="dark" size="sm" />
      </View>
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
  iconGlyph: {
    fontSize: 20,
    fontWeight: '800',
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
