import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Platform, Pressable, SectionList, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExerciseThumbnail } from '@/components/exercise-thumbnail';
import { Pill } from '@/components/pill';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { AppPressableCard } from '@/components/ui';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { EXERCISE_LIBRARY, MUSCLE_GROUPS, exercisesByMuscleGroup } from '@/data/exercise-library';
import { useTheme } from '@/hooks/use-theme';
import type { MuscleGroup } from '@/types/training';

const ALL_SECTIONS = MUSCLE_GROUPS.map((group) => ({ title: group, data: exercisesByMuscleGroup(group) }));

export default function EserciziListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const [filter, setFilter] = useState<MuscleGroup | 'Tutti'>('Tutti');

  const sections = useMemo(
    () => (filter === 'Tutti' ? ALL_SECTIONS : ALL_SECTIONS.filter((s) => s.title === filter)),
    [filter]
  );

  return (
    <ScreenBackground>
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.id}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Platform.OS === 'web' ? Spacing.five : insets.top + Spacing.three,
          paddingBottom: insets.bottom + BottomTabInset + Spacing.four,
        },
      ]}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.titleBlock}>
            <ThemedText type="title" style={styles.title}>
              Esercizi
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {EXERCISE_LIBRARY.length} esercizi su {MUSCLE_GROUPS.length} gruppi muscolari
            </ThemedText>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            <FilterChip label="Tutti" active={filter === 'Tutti'} onPress={() => setFilter('Tutti')} />
            {MUSCLE_GROUPS.map((group) => (
              <FilterChip key={group} label={group} active={filter === group} onPress={() => setFilter(group)} />
            ))}
          </ScrollView>
        </View>
      }
      renderSectionHeader={({ section }) =>
        filter === 'Tutti' ? (
          <View style={styles.sectionHeader}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {section.title.toUpperCase()}
            </ThemedText>
          </View>
        ) : null
      }
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      renderItem={({ item }) => (
        <AppPressableCard
          onPress={() => router.push(`/esercizi/${item.id}`)}
          accessibilityLabel={`Apri esercizio ${item.name}`}
          style={styles.exerciseCard}>
          <ExerciseThumbnail exercise={item} exerciseId={item.id} size={64} />
          <View style={styles.exerciseInfo}>
            <ThemedText type="default" style={styles.exerciseName} numberOfLines={2} ellipsizeMode="tail">
              {item.name}
            </ThemedText>
            <View style={styles.badgeRow}>
              <Pill label={item.muscleGroup} />
              <Pill
                label={item.videoStatus === 'available' ? 'Video disponibile' : 'Anteprima'}
                tone={item.videoStatus === 'available' ? 'positive' : 'neutral'}
              />
            </View>
          </View>
          <ChevronRight size={20} color={theme.textSecondary} />
        </AppPressableCard>
      )}
    />
    </ScreenBackground>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();

  return (
    <Pressable onPress={onPress}>
      <View
        style={[
          styles.chip,
          {
            backgroundColor: active ? theme.primary : theme.backgroundElement,
            borderColor: active ? theme.primary : theme.border,
          },
        ]}>
        <ThemedText type="small" style={styles.chipLabel} themeColor={active ? 'onPrimary' : 'textSecondary'}>
          {label}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  header: {
    gap: Spacing.three,
    marginBottom: Spacing.two,
  },
  titleBlock: {
    gap: 4,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
  },
  filterRow: {
    gap: Spacing.two,
    paddingRight: Spacing.four,
  },
  chip: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
  },
  chipLabel: {
    fontWeight: '600',
  },
  sectionHeader: {
    paddingTop: Spacing.three,
    paddingBottom: Spacing.one,
  },
  exerciseCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  exerciseInfo: {
    flex: 1,
    gap: 6,
  },
  exerciseName: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  separator: {
    height: Spacing.two,
  },
});
