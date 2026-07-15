import { LogOut } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppCard, AppScreen, AppSectionTitle, BackHeader, UserAvatar } from '@/components/ui';
import { DeveloperInfoSection } from '@/components/developer-info-section';
import { ThemeSettings } from '@/components/theme-settings';
import { signOut } from '@/lib/auth-service';
import { pickClientAvatarImage, saveClientAvatarPresetRemote, uploadClientAvatar } from '@/lib/client-avatar-service';
import { getClientById } from '@/lib/client-helpers';
import { getNextWorkoutPlan, getWorkoutCounter } from '@/lib/workout-progress';
import { useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import { useSubscriptionStore } from '@/store/subscription-store';
import { useTrainingStore } from '@/store/training-store';
import { AppFontSize, AppSpacing, useAppTheme } from '@/theme';
import { CLIENT_STATUS_LABEL, type ClientAvatarPreset } from '@/types/client';

const AVATAR_OPTIONS: { value: ClientAvatarPreset; label: string }[] = [
  { value: 'neutral', label: 'Neutro' },
  { value: 'female', label: 'Donna' },
  { value: 'male', label: 'Uomo' },
];

export default function ClienteProfiloScreen() {
  const { colors } = useAppTheme();
  const currentClientId = useAuthStore((s) => s.currentClientId);
  const logout = useAuthStore((s) => s.logout);
  const [avatarMessage, setAvatarMessage] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  async function handleLogout() {
    await signOut();
    logout();
  }
  const clients = useClientStore((s) => s.clients);
  const updateClient = useClientStore((s) => s.updateClient);
  const workoutPlans = useTrainingStore((s) => s.workoutPlans);
  const subscriptions = useSubscriptionStore((s) => s.subscriptions);
  const client = getClientById(clients, currentClientId);
  const nextPlan = getNextWorkoutPlan(workoutPlans, currentClientId);
  const { completed: completedCount, total: purchasedTotal } = getWorkoutCounter(
    subscriptions,
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
      updateClient({ ...client, avatarUrl: uploaded.signedUrl ?? asset.uri, avatarStoragePath: uploaded.path });
      setAvatarMessage('Foto profilo aggiornata.');
      return;
    }

    updateClient({ ...client, avatarUrl: asset.uri });
    setAvatarMessage(uploaded.message);
  }

  async function handlePresetChange(preset: ClientAvatarPreset) {
    if (!currentClientId || !client) return;
    updateClient({ ...client, avatarPreset: preset });
    const result = await saveClientAvatarPresetRemote(currentClientId, preset);
    setAvatarMessage(result.ok ? null : result.message);
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

      <AppSectionTitle>IL TUO PIANO</AppSectionTitle>
      <AppCard style={styles.section}>
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>
          Piano attivo: <Text style={{ color: colors.ink, fontWeight: '600' }}>{nextPlan ? nextPlan.name : 'Nessuno in programma'}</Text>
        </Text>
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>
          Allenamenti acquistati: <Text style={{ color: colors.ink, fontWeight: '600' }}>{purchasedTotal}</Text>
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
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 4,
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
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
