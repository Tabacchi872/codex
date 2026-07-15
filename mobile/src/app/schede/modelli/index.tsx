import { useRouter } from 'expo-router';
import { ChevronRight, Dumbbell } from 'lucide-react-native';
import { FlatList, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CoachOnlyNotice } from '@/components/coach-only-notice';
import { ExerciseThumbnail } from '@/components/exercise-thumbnail';
import { AppBadge, AppPressableCard, BackHeader } from '@/components/ui';
import { BottomTabInset } from '@/constants/theme';
import { WORKOUT_PLAN_TEMPLATES } from '@/data/workout-plan-templates';
import { useExerciseResolver } from '@/hooks/use-exercise-resolver';
import { useAuthStore } from '@/store/auth-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import type { WorkoutPlanTemplate } from '@/types/workout-template';

// Catalogo dei modelli predefiniti. Le card usano lo stesso linguaggio visivo
// delle schede reali: immagine/placeholder stabile, titolo controllato e
// metadati compatti. Il modello resta di sola lettura finche' non viene copiato.
export default function ModelliAllenamentoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const isCoach = useAuthStore((s) => s.currentRole !== 'cliente');

  if (!isCoach) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <CoachOnlyNotice />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={WORKOUT_PLAN_TEMPLATES}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Platform.OS === 'web' ? AppSpacing[5] : insets.top + AppSpacing[3],
            paddingBottom: insets.bottom + BottomTabInset + AppSpacing[4],
          },
        ]}
        ListHeaderComponent={
          <View style={styles.header}>
            <BackHeader title="Modelli allenamento" fallbackHref="/schede" />
            <Text style={[styles.intro, { color: colors.inkSoft }]}>Piani organizzati da copiare su un cliente e personalizzare senza modificare il modello originale.</Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: AppSpacing[3] }} />}
        renderItem={({ item }) => (
          <TemplateCard template={item} onPress={() => router.push(`/schede/modelli/${item.id}`)} />
        )}
      />
    </View>
  );
}

function TemplateCard({ template, onPress }: { template: WorkoutPlanTemplate; onPress: () => void }) {
  const { colors } = useAppTheme();
  const { resolve } = useExerciseResolver();
  const firstTemplateExercise = template.sessions[0]?.exercises[0];
  const firstExercise = firstTemplateExercise ? resolve(firstTemplateExercise.exerciseId) : null;
  const exerciseCount = template.sessions.reduce((sum, session) => sum + session.exercises.length, 0);

  return (
    <AppPressableCard onPress={onPress} accessibilityLabel={`Apri modello ${template.title}`} style={styles.card}>
      <View style={styles.cardRow}>
        {firstExercise ? (
          <ExerciseThumbnail exercise={firstExercise} exerciseId={firstExercise.id} size={72} />
        ) : (
          <View style={[styles.placeholder, { backgroundColor: colors.mossSoft }]}>
            <Dumbbell size={28} color={colors.moss} />
          </View>
        )}
        <View style={styles.cardCopy}>
          <Text style={[styles.cardTitle, { color: colors.ink }]} numberOfLines={2} ellipsizeMode="tail">
            {template.title}
          </Text>
          <Text style={[styles.description, { color: colors.inkSoft }]} numberOfLines={2} ellipsizeMode="tail">
            {template.description}
          </Text>
          <View style={styles.badges}>
            <AppBadge label={template.goal} tone="moss" />
            <AppBadge label={template.level} />
          </View>
          <Text style={[styles.meta, { color: colors.inkSoft }]} numberOfLines={1}>
            {template.sessions.length} sessioni · {exerciseCount} esercizi · {template.durationWeeks} settimane
          </Text>
        </View>
        <ChevronRight size={20} color={colors.inkFaint} />
      </View>
    </AppPressableCard>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: AppSpacing[5] },
  header: { gap: AppSpacing[3], marginBottom: AppSpacing[3] },
  intro: { fontSize: AppFontSize.sm, fontWeight: '500', lineHeight: 19 },
  card: { padding: AppSpacing[3] },
  cardRow: { alignItems: 'center', flexDirection: 'row', gap: AppSpacing[3], minWidth: 0 },
  cardCopy: { flex: 1, gap: 5, minWidth: 0 },
  placeholder: { alignItems: 'center', borderRadius: AppRadius.xl, height: 72, justifyContent: 'center', width: 72 },
  cardTitle: { fontSize: 17, fontWeight: '700', lineHeight: 22, minWidth: 0 },
  description: { fontSize: AppFontSize.sm, fontWeight: '500', lineHeight: 18 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: AppSpacing[1] },
  meta: { fontSize: 12, fontWeight: '600' },
});
