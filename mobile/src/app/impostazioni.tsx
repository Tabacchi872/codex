import { router, type Href } from 'expo-router';
import { LogOut, Ticket, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text } from 'react-native';

import { CoachInviteCodeCard } from '@/components/coach-invite-code-card';
import { DeveloperInfoSection } from '@/components/developer-info-section';
import { SoundSettings } from '@/components/sound-settings';
import { ThemeSettings } from '@/components/theme-settings';
import { AppCard, AppListRow, AppScreen, AppSectionTitle, BackHeader } from '@/components/ui';
import { deleteOwnAccount, signOut } from '@/lib/auth-service';
import { useAuthStore } from '@/store/auth-store';
import { AppFontSize, AppSpacing, useAppTheme } from '@/theme';

async function confirmAction(message: string) {
  if (Platform.OS === 'web') return globalThis.confirm(message);
  return new Promise<boolean>((resolve) => {
    Alert.alert('Conferma', message, [
      { text: 'Annulla', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Conferma', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

function notify(title: string, message: string) {
  if (Platform.OS === 'web') {
    globalThis.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

export default function ImpostazioniScreen() {
  const { colors } = useAppTheme();
  const logout = useAuthStore((s) => s.logout);
  const currentRole = useAuthStore((s) => s.currentRole);
  const [deletingAccount, setDeletingAccount] = useState(false);

  async function handleLogout() {
    await signOut();
    logout();
  }

  async function handleDeleteAccount() {
    if (deletingAccount) return;
    const firstConfirm = await confirmAction(
      'Eliminare definitivamente il tuo account? Verranno cancellati tutti i tuoi dati (profilo, schede, appuntamenti, storico) in modo permanente.',
    );
    if (!firstConfirm) return;
    const secondConfirm = await confirmAction(
      'Questa azione non puo\' essere annullata. Confermi di voler eliminare il tuo account?',
    );
    if (!secondConfirm) return;

    setDeletingAccount(true);
    const result = await deleteOwnAccount();
    setDeletingAccount(false);

    if (!result.ok) {
      notify('Eliminazione non riuscita', result.message);
      return;
    }

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

          <AppSectionTitle>PACCHETTO</AppSectionTitle>
          <AppCard style={styles.subscriptionCard}>
            <AppListRow
              icon={<Ticket size={19} color={colors.coral} />}
              iconBackground={colors.coralSoft}
              title="Pacchetto e fatturazione"
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

      <AppSectionTitle>ZONA PERICOLOSA</AppSectionTitle>
      <Pressable
        onPress={handleDeleteAccount}
        disabled={deletingAccount}
        hitSlop={8}
        style={[styles.deleteButton, deletingAccount && styles.deleteButtonDisabled]}
      >
        <Trash2 size={15} color={colors.rust} />
        <Text style={[styles.logoutText, { color: colors.rust }]}>
          {deletingAccount ? 'Eliminazione in corso...' : 'Elimina account'}
        </Text>
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
  deleteButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginTop: AppSpacing[1],
    marginBottom: AppSpacing[4],
    minHeight: 44,
  },
  deleteButtonDisabled: {
    opacity: 0.5,
  },
});
