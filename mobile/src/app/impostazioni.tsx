import { type Href } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { SoundSettings } from '@/components/sound-settings';
import { ThemeSettings } from '@/components/theme-settings';
import { AppScreen, AppSectionTitle, BackHeader } from '@/components/ui';
import { useAuthStore } from '@/store/auth-store';
import { AppFontSize, AppSpacing, useAppTheme } from '@/theme';

// "Impostazioni app" (sottosezione dell'hub Area coach): solo le vere
// impostazioni dell'app (tema, suoni/vibrazione). Codice invito, pacchetto,
// info sviluppatore/legal, logout ed eliminazione account sono stati
// spostati sotto Account coach/Assistenza (hub Area coach) per non
// duplicarli in due punti — vedi docs/DECISIONS.md.
export default function ImpostazioniScreen() {
  const { colors } = useAppTheme();
  const currentRole = useAuthStore((s) => s.currentRole);

  return (
    <AppScreen>
      <BackHeader title="Impostazioni app" fallbackHref={(currentRole === 'cliente' ? '/altro' : '/area-coach') as Href} />
      <Text style={[styles.subtitle, { color: colors.inkSoft }]}>Aspetto, suoni e vibrazione</Text>

      <AppSectionTitle>TEMA</AppSectionTitle>
      <ThemeSettings />

      <AppSectionTitle>TIMER DI RECUPERO</AppSectionTitle>
      <SoundSettings />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
    marginTop: -AppSpacing[2],
  },
});
