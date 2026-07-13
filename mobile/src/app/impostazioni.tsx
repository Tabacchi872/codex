import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { LogOut, Share2, Ticket } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppCard, AppHeader, AppListRow, AppScreen, AppSectionTitle } from '@/components/ui';
import { DeveloperInfoSection } from '@/components/developer-info-section';
import { SoundSettings } from '@/components/sound-settings';
import { ThemeSettings } from '@/components/theme-settings';
import { getCoachActiveRegistrationCode, getCurrentSession, signOut } from '@/lib/auth-service';
import { supabaseConfig } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth-store';
import { useSuperadminStore } from '@/store/superadmin-store';
import { AppFontSize, AppSpacing, useAppTheme } from '@/theme';

export default function ImpostazioniScreen() {
  const { colors } = useAppTheme();
  const logout = useAuthStore((s) => s.logout);

  async function handleLogout() {
    await signOut();
    logout();
  }
  const currentRole = useAuthStore((s) => s.currentRole);
  const currentCoachId = useAuthStore((s) => s.currentCoachId);
  const currentUserEmail = useAuthStore((s) => s.currentUserEmail);
  const coaches = useSuperadminStore((s) => s.coaches);
  const [copyFeedback, setCopyFeedback] = useState('');
  const localCoach = coaches.find((item) => item.id === currentCoachId) ?? coaches.find((item) => item.email === currentUserEmail);

  // Il codice mostrato deve essere sempre quello REALE in
  // public.registration_codes, mai solo il mirror locale
  // (useSuperadminStore.coaches): quest'ultimo puo' restare disallineato se
  // uno dei passaggi di sincronizzazione (trigger DB al signUp,
  // completeCoachOnboarding al primo login) non va a buon fine — vedi
  // BUG-013 in docs/BUGS.md ("il codice mostrato nell'app e' diverso da
  // quello nella tabella registration_codes"). Se il coach e' solo locale/demo
  // (nessuna sessione Supabase attiva), ricade sul mirror locale invariato.
  const [remoteCode, setRemoteCode] = useState<{ code: string; active: boolean } | null | undefined>(undefined);

  useEffect(() => {
    if (currentRole !== 'coach' || !supabaseConfig.isConfigured) {
      setRemoteCode(undefined);
      return;
    }
    let active = true;
    (async () => {
      const sessionResult = await getCurrentSession();
      if (!active) return;
      const userId = sessionResult.ok ? sessionResult.data?.user.id : undefined;
      if (!userId) {
        setRemoteCode(undefined);
        return;
      }
      const codeResult = await getCoachActiveRegistrationCode(userId);
      if (!active) return;
      if (__DEV__) {
        console.log('COACH_CODE_LOOKUP', {
          source: 'supabase',
          code: codeResult.ok ? codeResult.data?.code ?? null : null,
        });
      }
      setRemoteCode(codeResult.ok ? codeResult.data : undefined);
    })();
    return () => {
      active = false;
    };
  }, [currentRole]);

  // remoteCode === undefined -> nessuna sessione Supabase reale, ricadi sul
  // mirror locale; remoteCode === null -> sessione reale ma nessun codice
  // trovato su Supabase (caso limite, es. onboarding non ancora completato);
  // remoteCode oggetto -> fonte di verita', sempre preferita al mirror locale.
  const displayCode = remoteCode !== undefined ? remoteCode?.code : localCoach?.coachCode;
  const displayCodeActive = remoteCode !== undefined ? (remoteCode?.active ?? false) : localCoach?.coachCodeActive;
  const coach = localCoach ? { ...localCoach, coachCode: displayCode ?? '', coachCodeActive: displayCodeActive ?? false } : undefined;

  async function copyCoachCode() {
    if (!coach?.coachCode) return;
    await Clipboard.setStringAsync(coach.coachCode);
    setCopyFeedback('Codice copiato.');
  }

  async function shareCoachCode() {
    if (!coach?.coachCode) return;
    try {
      await Share.share({ message: `Registrati come mio cliente su FitCoach Pro con il codice ${coach.coachCode}` });
    } catch {
      // Utente ha annullato la condivisione o la piattaforma non la supporta:
      // nessun comportamento aggiuntivo necessario, il pulsante resta invariato.
    }
  }

  return (
    <AppScreen>
      <AppHeader title="Impostazioni" />
      <Text style={[styles.subtitle, { color: colors.inkSoft }]}>Aspetto, suoni e vibrazione</Text>

      <AppSectionTitle>TEMA</AppSectionTitle>
      <ThemeSettings />

      {currentRole === 'coach' && coach ? (
        <>
          <AppSectionTitle>CODICE COACH</AppSectionTitle>
          <AppCard style={styles.codeCard}>
            <View style={styles.codeRow}>
              <View style={styles.codeText}>
                <Text style={[styles.codeValue, { color: colors.coral }]}>{coach.coachCode || 'Nessun codice trovato'}</Text>
                <Text style={[styles.codeSubtitle, { color: colors.inkSoft }]}>
                  {coach.coachCode ? (coach.coachCodeActive ? 'Attivo per nuove registrazioni clienti' : 'Disattivato') : ''}
                </Text>
              </View>
              <View style={styles.codeButtons}>
                <AppButton label="Copia" onPress={copyCoachCode} variant="outline" size="sm" disabled={!coach.coachCode} />
                <AppButton
                  label="Condividi"
                  onPress={shareCoachCode}
                  variant="ghost"
                  size="sm"
                  disabled={!coach.coachCode}
                  icon={<Share2 size={14} color={colors.inkSoft} />}
                />
              </View>
            </View>
            {copyFeedback ? <Text style={[styles.feedback, { color: colors.moss }]}>{copyFeedback}</Text> : null}
          </AppCard>

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
  codeCard: {
    gap: AppSpacing[2],
  },
  codeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[2],
    justifyContent: 'space-between',
  },
  codeText: {
    flex: 1,
    minWidth: 0,
  },
  codeButtons: {
    flexDirection: 'row',
    gap: AppSpacing[1],
  },
  subscriptionCard: {
    paddingVertical: 4,
  },
  codeValue: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  codeSubtitle: {
    fontSize: AppFontSize.sm,
    marginTop: 1,
  },
  feedback: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    marginTop: AppSpacing[2],
  },
  logoutText: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
});
