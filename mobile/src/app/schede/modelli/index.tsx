import { useRouter } from 'expo-router';
import { FlatList, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { CoachOnlyNotice } from '@/components/coach-only-notice';
import { Pill } from '@/components/pill';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { WORKOUT_PLAN_TEMPLATES } from '@/data/workout-plan-templates';
import { useAuthStore } from '@/store/auth-store';
import type { WorkoutPlanTemplate } from '@/types/workout-template';

// Catalogo dei modelli predefiniti — sola lettura (i modelli non si modificano
// mai in-place, vedi docs/DECISIONS.md): da qui si apre il dettaglio, dove si
// può "Usare per cliente" per generare una copia reale e modificabile.
export default function ModelliAllenamentoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const isCoach = useAuthStore((s) => s.currentRole !== 'cliente');

  if (!isCoach) {
    return (
      <ScreenBackground>
        <CoachOnlyNotice />
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <FlatList
        data={WORKOUT_PLAN_TEMPLATES}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Platform.OS === 'web' ? Spacing.five : insets.top + Spacing.three,
            paddingBottom: insets.bottom + BottomTabInset + Spacing.four,
          },
        ]}
        ListHeaderComponent={
          <View style={styles.titleBlock}>
            <ThemedText type="title" style={styles.title}>
              Modelli allenamento
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Piani già organizzati, pronti da usare per un cliente e modificabili dopo la copia.
            </ThemedText>
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/schede/modelli/${item.id}`)}>
            <TemplateCard template={item} />
          </Pressable>
        )}
      />
    </ScreenBackground>
  );
}

function TemplateCard({ template }: { template: WorkoutPlanTemplate }) {
  const theme = useTheme();
  return (
    <Card style={styles.card}>
      <ThemedText type="default" style={styles.cardTitle}>
        {template.title}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {template.description}
      </ThemedText>
      <View style={styles.pillsRow}>
        <Pill label={template.goal} tone="primary" />
        <Pill label={template.level} />
        <Pill label={`${template.daysPerWeek} gg/settimana`} />
        <Pill label={`${template.durationWeeks} settimane`} />
        <Pill label={`${template.sessions.length} sessioni`} />
      </View>
      <ThemedText type="small" themeColor="primary" style={{ color: theme.primary }}>
        Vedi dettaglio →
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  titleBlock: {
    gap: 4,
    marginBottom: Spacing.two,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
  },
  card: {
    gap: Spacing.two,
  },
  cardTitle: {
    fontWeight: '700',
    fontSize: 17,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  separator: {
    height: Spacing.two,
  },
});
