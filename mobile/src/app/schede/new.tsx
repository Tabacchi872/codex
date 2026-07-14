import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { WorkoutPlanForm } from '@/components/workout-plan-form';
import { Spacing } from '@/constants/theme';
import { getCurrentSession } from '@/lib/auth-service';
import { supabaseConfig } from '@/lib/supabase';
import { createWorkoutPlan } from '@/lib/workout-plan-service';
import { useTrainingStore } from '@/store/training-store';
import type { WorkoutPlan } from '@/types/training';

export default function NuovaSchedaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { clientId } = useLocalSearchParams<{ clientId?: string }>();
  const addWorkoutPlan = useTrainingStore((s) => s.addWorkoutPlan);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Se Supabase e' configurato, la scheda va creata li' (fonte di verita'):
  // il coach_id inviato DEVE essere l'id reale della sessione Supabase (mai
  // il costante DEFAULT_COACH_ID usato dal form per il percorso locale/demo
  // — quello non e' un UUID valido, la RPC lo rifiuterebbe). Se non
  // configurato, comportamento invariato: solo store locale.
  async function handleSave(plan: WorkoutPlan) {
    setError('');
    if (!supabaseConfig.isConfigured) {
      addWorkoutPlan(plan);
      router.replace(`/schede/${plan.id}`);
      return;
    }

    setSaving(true);
    const session = await getCurrentSession();
    const realCoachId = session.ok ? (session.data?.user.id ?? null) : null;
    if (!realCoachId) {
      setSaving(false);
      setError('Nessuna sessione coach reale trovata. Prova a rifare il login.');
      return;
    }

    const result = await createWorkoutPlan({ ...plan, coachId: realCoachId });
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    addWorkoutPlan(result.data);
    router.replace(`/schede/${result.data.id}`);
  }

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Platform.OS === 'web' ? Spacing.four : insets.top + Spacing.three, paddingBottom: Spacing.six },
        ]}>
        <WorkoutPlanForm initialClientId={clientId} onSave={handleSave} saveLabel="Crea scheda" />
        {saving ? (
          <View style={styles.savingRow}>
            <ActivityIndicator />
            <ThemedText type="small" themeColor="textSecondary">
              Salvataggio scheda su Supabase…
            </ThemedText>
          </View>
        ) : null}
        {error ? (
          <ThemedText type="small" themeColor="statusExpired">
            {error}
          </ThemedText>
        ) : null}
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
