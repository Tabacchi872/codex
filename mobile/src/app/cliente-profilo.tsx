import { LogOut, Trash2 } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ClientAssignedCoachCard } from '@/components/client-assigned-coach-card';
import { AppCard, AppScreen, AppSectionTitle, BackHeader, UserAvatar } from '@/components/ui';
import { DeveloperInfoSection } from '@/components/developer-info-section';
import { ThemeSettings } from '@/components/theme-settings';
import { useMyCoach } from '@/hooks/use-my-coach';
import { deleteOwnAccount, signOut } from '@/lib/auth-service';
import { pickClientAvatarImage, saveClientAvatarPresetRemote, uploadClientAvatar } from '@/lib/client-avatar-service';
import { getCompletedClientOnboardingProfile } from '@/lib/client-onboarding-service';
import { getClientById } from '@/lib/client-helpers';
import { getNextWorkoutPlan, getWorkoutCounter } from '@/lib/workout-progress';
import { useAuthStore } from '@/store/auth-store';
import { useClientOnboardingStore } from '@/store/client-onboarding-store';
import { useClientStore } from '@/store/client-store';
import { useTrainingStore } from '@/store/training-store';
import { AppFontSize, AppSpacing, useAppTheme } from '@/theme';
import { CLIENT_STATUS_LABEL, type ClientAvatarPreset } from '@/types/client';
import type { CompletedClientOnboardingProfile } from '@/types/client-onboarding';

const AVATAR_OPTIONS: { value: ClientAvatarPreset; label: string }[] = [
  { value: 'neutral', label: 'Neutro' },
  { value: 'female', label: 'Donna' },
  { value: 'male', label: 'Uomo' },
];

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

export default function ClienteProfiloScreen() {
  const { colors } = useAppTheme();
  const currentClientId = useAuthStore((s) => s.currentClientId);
  const logout = useAuthStore((s) => s.logout);
  const onboardingStatusRevision = useClientOnboardingStore((s) => s.statusRevision);
  const [trainingProfile, setTrainingProfile] = useState<CompletedClientOnboardingProfile | null>(null);
  const [trainingProfileLoading, setTrainingProfileLoading] = useState(false);
  const [trainingProfileError, setTrainingProfileError] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const avatarMessageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const myCoach = useMyCoach();

  useEffect(() => {
    return () => {
      if (avatarMessageTimer.current) clearTimeout(avatarMessageTimer.current);
    };
  }, []);

  useEffect(() => {
    loadTrainingProfile();
  }, [currentClientId, onboardingStatusRevision]);

  async function loadTrainingProfile() {
    if (!currentClientId) {
      setTrainingProfile(null);
      setTrainingProfileError(false);
      setTrainingProfileLoading(false);
      return;
    }
    setTrainingProfileLoading(true);
    setTrainingProfileError(false);
    const result = await getCompletedClientOnboardingProfile();
    setTrainingProfileLoading(false);
    if (!result.ok) {
      if (__DEV__) console.warn('CLIENT_PROFILE_ONBOARDING_READ_ERROR', result.message);
      setTrainingProfile(null);
      setTrainingProfileError(true);
      return;
    }
    setTrainingProfile(result.data);
  }

  function showAvatarMessage(message: string) {
    if (avatarMessageTimer.current) clearTimeout(avatarMessageTimer.current);
    setAvatarMessage(message);
    avatarMessageTimer.current = setTimeout(() => {
      setAvatarMessage(null);
      avatarMessageTimer.current = null;
    }, 2600);
  }

  async function handleLogout() {
    await signOut();
    logout();
  }

  async function handleDeleteAccount() {
    if (deletingAccount) return;
    const firstConfirm = await confirmAction(
      'Eliminare definitivamente il tuo account? Verranno cancellati tutti i tuoi dati (profilo, schede, storico allenamenti) in modo permanente.',
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
  const clients = useClientStore((s) => s.clients);
  const updateClient = useClientStore((s) => s.updateClient);
  const workoutPlans = useTrainingStore((s) => s.workoutPlans);
  const client = getClientById(clients, currentClientId);
  const nextPlan = getNextWorkoutPlan(workoutPlans, currentClientId);
  const { completed: completedCount, total: workoutTotal } = getWorkoutCounter(
    [],
    workoutPlans,
    client,
    currentClientId
  );

  if (!client) {
    return (
      <AppScreen scroll={false}>
        <View style={styles.loading}>
          <Text style={{ color: colors.inkSoft }}>Nessun profilo collegato a questo account.</Text>
        </View>
      </AppScreen>
    );
  }

  async function handlePickAvatar() {
    if (!currentClientId || !client || avatarUploading) return;
    const asset = await pickClientAvatarImage();
    if (!asset) return;

    setAvatarUploading(true);
    setAvatarMessage(null);
    const uploaded = await uploadClientAvatar(currentClientId, asset);
    setAvatarUploading(false);

    if (uploaded.ok) {
      updateClient({ ...client, avatarUrl: uploaded.signedUrl ?? client.avatarUrl ?? null, avatarStoragePath: uploaded.path });
      showAvatarMessage('Avatar aggiornato');
      return;
    }

    showAvatarMessage(uploaded.message);
  }

  async function handlePresetChange(preset: ClientAvatarPreset) {
    if (!currentClientId || !client) return;
    updateClient({ ...client, avatarPreset: preset });
    const result = await saveClientAvatarPresetRemote(currentClientId, preset);
    if (result.ok) {
      showAvatarMessage('Avatar aggiornato');
      return;
    }
    showAvatarMessage(result.message);
  }

  return (
    <AppScreen>
      <BackHeader title="Profilo" fallbackHref="/altro" />

      <AppCard style={styles.section}>
        <View style={styles.profileHeader}>
          <Pressable onPress={handlePickAvatar} accessibilityRole="button" accessibilityLabel="Aggiorna foto profilo" disabled={avatarUploading}>
            <UserAvatar
              firstName={client.firstName}
              lastName={client.lastName}
              imageUrl={client.avatarUrl}
              preset={client.avatarPreset}
              size={82}
              editable
            />
          </Pressable>
          <View style={styles.profileText}>
            <Text style={[styles.name, { color: colors.ink }]}>
              {client.firstName} {client.lastName}
            </Text>
            <Text style={[styles.smallText, { color: colors.inkSoft }]}>{client.email}</Text>
            {avatarUploading ? <Text style={[styles.smallText, { color: colors.inkSoft }]}>Caricamento foto...</Text> : null}
          </View>
        </View>
        <View style={styles.avatarOptions}>
          {AVATAR_OPTIONS.map((option) => {
            const active = (client.avatarPreset ?? 'neutral') === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => handlePresetChange(option.value)}
                style={[styles.avatarChip, { borderColor: colors.moss, backgroundColor: active ? colors.moss : 'transparent' }]}>
                <Text style={[styles.avatarChipLabel, { color: active ? colors.onMoss : colors.moss }]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {avatarMessage ? <Text style={[styles.smallText, { color: colors.inkSoft }]}>{avatarMessage}</Text> : null}
        {client.phone ? <Text style={[styles.smallText, { color: colors.inkSoft }]}>{client.phone}</Text> : null}
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>Obiettivo: {client.goal || 'non specificato'}</Text>
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>Stato: {CLIENT_STATUS_LABEL[client.status]}</Text>
      </AppCard>

      <AppSectionTitle>IL MIO PROFILO DI ALLENAMENTO</AppSectionTitle>
      <TrainingProfileCard
        profile={trainingProfile}
        loading={trainingProfileLoading}
        error={trainingProfileError}
        onRetry={loadTrainingProfile}
      />

      {myCoach.clientMode !== 'self_guided' ? (
        <>
          <AppSectionTitle>IL TUO COACH</AppSectionTitle>
          <ClientAssignedCoachCard coach={myCoach.coach} loading={myCoach.loading} error={myCoach.error} onRetry={myCoach.reload} />
        </>
      ) : null}

      <AppSectionTitle>IL TUO PIANO</AppSectionTitle>
      <AppCard style={styles.section}>
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>
          Piano attivo: <Text style={{ color: colors.ink, fontWeight: '600' }}>{nextPlan ? nextPlan.name : 'Nessuno in programma'}</Text>
        </Text>
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>
          Avanzamento schede: <Text style={{ color: colors.ink, fontWeight: '600' }}>{completedCount}/{workoutTotal}</Text>
        </Text>
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>
          Allenamenti completati: <Text style={{ color: colors.ink, fontWeight: '600' }}>{completedCount}</Text>
        </Text>
      </AppCard>

      <AppSectionTitle>TEMA</AppSectionTitle>
      <ThemeSettings />

      <DeveloperInfoSection />

      <Pressable onPress={handleLogout} style={styles.logout} hitSlop={6}>
        <LogOut size={15} color={colors.rust} />
        <Text style={[styles.logoutText, { color: colors.rust }]}>Esci</Text>
      </Pressable>

      <AppSectionTitle>ZONA PERICOLOSA</AppSectionTitle>
      <Pressable
        onPress={handleDeleteAccount}
        disabled={deletingAccount}
        style={[styles.logout, deletingAccount && styles.deleteButtonDisabled]}
        hitSlop={6}
      >
        <Trash2 size={15} color={colors.rust} />
        <Text style={[styles.logoutText, { color: colors.rust }]}>
          {deletingAccount ? 'Eliminazione in corso...' : 'Elimina account'}
        </Text>
      </Pressable>
    </AppScreen>
  );
}

function TrainingProfileCard({
  profile,
  loading,
  error,
  onRetry,
}: {
  profile: CompletedClientOnboardingProfile | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  const { colors } = useAppTheme();

  if (loading) {
    return (
      <AppCard style={styles.trainingCard}>
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>Caricamento profilo di allenamento...</Text>
      </AppCard>
    );
  }

  if (error) {
    return (
      <AppCard style={styles.trainingCard}>
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>Non è stato possibile caricare il profilo di allenamento.</Text>
        <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Riprova" hitSlop={6} style={styles.retryButton}>
          <Text style={[styles.retryText, { color: colors.moss }]}>Riprova</Text>
        </Pressable>
      </AppCard>
    );
  }

  if (!profile) {
    return (
      <AppCard style={styles.trainingCard}>
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>Profilo di allenamento non ancora disponibile.</Text>
      </AppCard>
    );
  }

  const rows: { label: string; value: string }[] = [];
  if (profile.goals.length > 0) rows.push({ label: 'Obiettivi', value: profile.goals.join(', ') });
  if (profile.weightKg != null) rows.push({ label: 'Peso', value: `${formatNumber(profile.weightKg, 1)} kg` });
  if (profile.heightCm != null) rows.push({ label: 'Altezza', value: `${Math.round(profile.heightCm)} cm` });
  if (profile.bmi != null) rows.push({ label: 'BMI', value: `${formatNumber(profile.bmi, 1)}${profile.bmiCategory ? ` · ${displayBmiCategory(profile.bmiCategory)}` : ''}` });
  if (profile.trainingDaysPerWeek != null) rows.push({ label: 'Giorni settimanali', value: `${profile.trainingDaysPerWeek}` });
  if (profile.experienceLevel) rows.push({ label: 'Esperienza', value: displayExperience(profile.experienceLevel) });
  if (profile.focusAreas.length > 0) rows.push({ label: 'Aree di interesse', value: profile.focusAreas.join(', ') });

  if (rows.length === 0) {
    return (
      <AppCard style={styles.trainingCard}>
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>
          {profile.clientMode === 'coach_guided' ? 'Percorso gestito dal tuo coach.' : 'Profilo di allenamento non ancora compilato.'}
        </Text>
      </AppCard>
    );
  }

  return (
    <AppCard style={styles.trainingCard}>
      {rows.map((row) => (
        <View key={row.label} style={styles.trainingRow}>
          <Text style={[styles.trainingLabel, { color: colors.inkSoft }]}>{row.label}</Text>
          <Text style={[styles.trainingValue, { color: colors.ink }]}>{row.value}</Text>
        </View>
      ))}
    </AppCard>
  );
}

function formatNumber(value: number, digits: number) {
  return value.toLocaleString('it-IT', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function displayBmiCategory(value: string) {
  return value === 'Obesita' ? 'Obesità' : value;
}

function displayExperience(value: string) {
  const labels: Record<string, string> = {
    beginner: 'Nuovo all’allenamento di forza',
    novice: 'Qualche mese',
    intermediate: 'Circa un anno',
    advanced: 'Diversi anni',
    competitive: 'Competizioni',
  };
  return labels[value] ?? value;
}

const styles = StyleSheet.create({
  section: {
    gap: 4,
  },
  trainingCard: {
    gap: AppSpacing[2],
  },
  trainingRow: {
    gap: 3,
  },
  trainingLabel: {
    fontSize: AppFontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  trainingValue: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
    lineHeight: 19,
  },
  retryButton: {
    alignSelf: 'flex-start',
    minHeight: 34,
    justifyContent: 'center',
  },
  retryText: {
    fontSize: AppFontSize.sm,
    fontWeight: '800',
  },
  profileHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[3],
  },
  profileText: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  smallText: {
    fontSize: AppFontSize.sm,
  },
  avatarOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
    marginTop: AppSpacing[2],
  },
  avatarChip: {
    borderRadius: 999,
    borderWidth: 1.5,
    paddingHorizontal: AppSpacing[3],
    paddingVertical: 7,
  },
  avatarChipLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  logout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: AppSpacing[2],
  },
  logoutText: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  deleteButtonDisabled: {
    opacity: 0.5,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
