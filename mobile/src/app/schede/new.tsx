import { useLocalSearchParams, useRouter } from 'expo-router';
import { Platform, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/screen-background';
import { WorkoutPlanForm } from '@/components/workout-plan-form';
import { Spacing } from '@/constants/theme';
import { useTrainingStore } from '@/store/training-store';
import type { WorkoutPlan } from '@/types/training';

export default function NuovaSchedaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { clientId } = useLocalSearchParams<{ clientId?: string }>();
  const addWorkoutPlan = useTrainingStore((s) => s.addWorkoutPlan);

  function handleSave(plan: WorkoutPlan) {
    addWorkoutPlan(plan);
    router.replace(`/schede/${plan.id}`);
  }

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Platform.OS === 'web' ? Spacing.four : insets.top + Spacing.three, paddingBottom: Spacing.six },
        ]}>
        <WorkoutPlanForm initialClientId={clientId} onSave={handleSave} saveLabel="Crea scheda" />
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
});
