import { router, type Href } from 'expo-router';
import { LogOut, Ticket } from 'lucide-react-native';
import { Pressable, StyleSheet, Text } from 'react-native';

import { CoachInviteCodeCard } from '@/components/coach-invite-code-card';
import { DeveloperInfoSection } from '@/components/developer-info-section';
import { SoundSettings } from '@/components/sound-settings';
import { ThemeSettings } from '@/components/theme-settings';
import { AppCard, AppListRow, AppScreen, AppSectionTitle, BackHeader } from '@/components/ui';
import { signOut } from '@/lib/auth-service';
import { useAuthStore } from '@/store/auth-store';
import { AppFontSize, AppSpacing, useAppTheme } from '@/theme';

export default function ImpostazioniScreen() {
  const { colors } = useAppTheme();
  const logout = useAuthStore((s) => s.logout);
  const currentRole = useAuthStore((s) => s.currentRole);

  async function handleLogout() {
    await signOut();
    logout();
  }

  return (
    <AppScreen>
      <BackHeader title="Impostazioni" fallbackHref={(currentRole === 'cliente' ? '/altro' : '/') as Href} />
      <Text style={[styles.subtitle, { color: colors.inkSoft }]}>Aspetto, suoni e vibrazione</Text>

      <AppSectionTitle>TEMA</AppSectionTitle>
      <ThemeSettings />

      {currentRole === 'coach' ? (
        <>
          <CoachInviteCodeCard
            title="Il tuo codice invito"
            description="Condividi questo codice con i clienti che vuoi collegare al tuo profilo."
          />

          <AppSectionTitle>ABBONAMENTO</AppSectionTitle>
          <AppCard style={styles.subscriptionCard}>
            <AppListRow
              icon={<Ticket size={19} color={colors.coral} />}
              iconBackground={colors.coralSoft}
              title="Gestisci abbonamento"
              subtitle="Pacchetto coach, stato e scadenza"
              onPress={() => router.push('/abbonamento-coach')}
            />
          </AppCard>
        </>
      ) : null}

      <AppSectionTitle>TIMER DI RECUPERO</AppSectionTitle>
      <SoundSettings />

      <DeveloperInfoSection />

      <Pressable onPress={handleLogout} hitSlop={8} style={styles.logoutButton}>
        <LogOut size={15} color={colors.rust} />
        <Text style={[styles.logoutText, { color: colors.rust }]}>Esci</Text>
      </Pressable>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
    marginTop: -AppSpacing[2],
  },
  subscriptionCard: {
    paddingVertical: 4,
  },
  logoutButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginTop: AppSpacing[2],
    minHeight: 44,
  },
  logoutText: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
});
