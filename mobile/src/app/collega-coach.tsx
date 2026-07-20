import { useRouter } from 'expo-router';
import { LogOut } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton, AppCard, AppScreen, AppTextField, FitCoachLogo } from '@/components/ui';
import { loadClientProfile, signOut } from '@/lib/auth-service';
import { normalizeCoachCode } from '@/lib/coach-code';
import { joinCoachByInviteCode } from '@/lib/client-coach-service';
import { useAuthStore } from '@/store/auth-store';
import { useClientOnboardingStore } from '@/store/client-onboarding-store';
import { useClientStore } from '@/store/client-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';

export default function ConnectCoachScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const currentClientId = useAuthStore((s) => s.currentClientId);
  const currentUserEmail = useAuthStore((s) => s.currentUserEmail);
  const logout = useAuthStore((s) => s.logout);
  const updateClient = useClientStore((s) => s.updateClient);
  const invalidateOnboardingStatus = useClientOnboardingStore((s) => s.invalidateStatus);
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const normalizedCode = normalizeCoachCode(code);

  async function handleConnect() {
    if (!normalizedCode || submitting) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const result = await joinCoachByInviteCode(normalizedCode);
    if (!result.ok) {
      setSubmitting(false);
      setError(result.message);
      return;
    }

    if (currentClientId) {
      const profileResult = await loadClientProfile(currentClientId, currentUserEmail ?? '');
      if (profileResult.ok) {
        updateClient(profileResult.data.client);
      } else if (__DEV__) {
        console.warn('CONNECT_COACH_PROFILE_REFRESH_ERROR', profileResult.message);
      }
    }

    invalidateOnboardingStatus();
    setSuccess('Coach collegato correttamente');
    setSubmitting(false);
    setTimeout(() => router.replace('/cliente-home'), 650);
  }

  async function handleLogout() {
    await signOut();
    logout();
  }

  return (
    <AppScreen bottomTabInset={false} keyboardAvoiding contentStyle={styles.content}>
      <View style={styles.header}>
        <FitCoachLogo size="md" />
        <Text style={[styles.title, { color: colors.ink }]}>Non hai ancora un coach</Text>
        <Text style={[styles.description, { color: colors.inkSoft }]}>
          Inserisci il codice ricevuto dal tuo coach per collegarti al suo profilo.
        </Text>
      </View>

      <AppCard style={styles.card}>
        <AppTextField
          label="Codice coach"
          value={code}
          onChangeText={(value) => setCode(normalizeCoachCode(value))}
          placeholder="FC-XXXX-XXXX"
          autoCapitalize="characters"
          autoCorrect={false}
          accessibilityLabel="Codice coach"
        />
        <Text style={[styles.helper, { color: colors.inkSoft }]}>
          Il collegamento sarà completato soltanto se il codice è valido e il coach ha un posto disponibile.
        </Text>
        {error ? <Text style={[styles.message, { color: colors.rust }]}>{error}</Text> : null}
        {success ? <Text style={[styles.message, { color: colors.moss }]}>{success}</Text> : null}
        <AppButton
          label={submitting ? 'Collegamento in corso...' : 'Collega coach'}
          onPress={handleConnect}
          disabled={!normalizedCode || submitting}
          loading={submitting}
          fullWidth
          size="lg"
        />
      </AppCard>

      <AppButton
        label="Esci dall'account"
        onPress={handleLogout}
        variant="outline"
        icon={<LogOut size={16} color={colors.ink} />}
        fullWidth
      />

      <View style={[styles.notice, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
        <Text style={[styles.noticeText, { color: colors.inkSoft }]}>
          Senza un coach collegato non sono disponibili schede, chat, appuntamenti e contenuti privati del coach.
        </Text>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: AppSpacing[6],
  },
  header: {
    gap: AppSpacing[2],
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 36,
  },
  description: {
    fontSize: AppFontSize.base,
    fontWeight: '600',
    lineHeight: 22,
  },
  card: {
    gap: AppSpacing[3],
  },
  helper: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
    lineHeight: 19,
  },
  message: {
    fontSize: AppFontSize.sm,
    fontWeight: '800',
    textAlign: 'center',
  },
  notice: {
    borderRadius: AppRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: AppSpacing[3],
  },
  noticeText: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
    lineHeight: 19,
    textAlign: 'center',
  },
});
