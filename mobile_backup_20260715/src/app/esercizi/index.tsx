import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, SectionList, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { Pill } from '@/components/pill';
import { PlaceholderBanner } from '@/components/placeholder-banner';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
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

          <PlaceholderBanner text="Nessun video locale ancora caricato: ogni esercizio mostra onestamente 'Video mancante' finché non aggiungi i file in mobile/assets/videos/." />

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
        <Pressable onPress={() => router.push(`/esercizi/${item.id}`)}>
          <Card style={styles.exerciseCard}>
            <View style={styles.exerciseInfo}>
              <ThemedText type="default" style={styles.exerciseName}>
                {item.name}
              </ThemedText>
              <View style={styles.badgeRow}>
                <Pill label={item.muscleGroup} />
                <Pill
                  label={item.videoStatus === 'available' ? 'Video disponibile' : 'Video mancante'}
                  tone={item.videoStatus === 'available' ? 'positive' : 'neutral'}
                />
              </View>
            </View>
            <ThemedText type="linkPrimary" style={{ color: theme.primary }}>
              Apri
            </ThemedText>
          </Card>
        </Pressable>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  exerciseInfo: {
    flex: 1,
    gap: 6,
  },
  exerciseName: {
    fontWeight: '600',
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
