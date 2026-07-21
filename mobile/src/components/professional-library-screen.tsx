import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronRight, Layers } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CoachOnlyNotice } from './coach-only-notice';
import {
  EMPTY_FILTERS,
  LibraryFilterBar,
  TemplateRow,
  matchesLibraryFilters,
  templateSearchHaystack,
  uniqueSorted,
  uniqueSortedNumbers,
  type LibraryFilterOptions,
  type LibraryFilters,
} from './template-library-screen';
import { AppButton, AppPressableCard, BackHeader } from './ui';

import { BottomTabInset } from '@/constants/theme';
import { supabaseConfig } from '@/lib/supabase';
import { listWorkoutTemplateSummaries } from '@/lib/workout-plan-service';
import { useAuthStore } from '@/store/auth-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import type { WorkoutTemplateSummary } from '@/types/template-library';

// Le 7 sottocategorie sono UI-only: raggruppano i modelli di sistema per il
// valore reale di workout_templates.goal (mai modificato ne' toccato da
// alcuna migration di questo intervento). L'etichetta mostrata differisce
// dal valore grezzo solo per due categorie (goal 'Forza' -> "Forza e
// Powerbuilding", goal 'Casa' -> "Allenamento a casa"): nessuna colonna
// category/label esiste ne' serve, e' un mapping puramente presentazionale.
// I dati restano quelli scritti da
// supabase/migrations/20260724090000_workout_template_system_programs.sql.
const PROFESSIONAL_CATEGORIES: { goal: string; label: string }[] = [
  { goal: 'Dimagrimento', label: 'Dimagrimento' },
  { goal: 'Massa muscolare', label: 'Massa muscolare' },
  { goal: 'Ricomposizione corporea', label: 'Ricomposizione corporea' },
  { goal: 'Forza', label: 'Forza e Powerbuilding' },
  { goal: 'Principianti', label: 'Principianti' },
  { goal: 'Casa', label: 'Allenamento a casa' },
  { goal: 'Performance', label: 'Performance' },
];

// Cartella "Allenamenti professionali": interamente VIRTUALE, nessuna riga in
// public.template_folders, nessun coach_id, non rinominabile/eliminabile/
// spostabile — sola lettura, raggiunta da schede/professionali/index.tsx
// (goal=null, mostra le 7 sottocategorie) e
// schede/professionali/[goal].tsx (una sottocategoria, goal valorizzato,
// mostra solo i modelli di sistema con quel goal). NIENTE clientId qui, mai
// (stessa regola di TemplateLibraryScreen) — "Duplica nella mia libreria" e
// il resto delle azioni sul modello restano intatti in
// schede/modello/[templateId].tsx, non toccato: questa schermata naviga li'
// esattamente come faceva prima la sezione "Professionali" della radice.
export function ProfessionalLibraryScreen({ goal }: { goal: string | null }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const isCoach = useAuthStore((s) => s.currentRole !== 'cliente');

  const [templates, setTemplates] = useState<WorkoutTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<LibraryFilters>(EMPTY_FILTERS);
  const activeFilterCount = Object.values(filters).filter((v) => v !== null && v !== 'all').length;
  const searchOrFiltersActive = searchQuery.trim().length > 0 || activeFilterCount > 0;

  const load = useCallback(async () => {
    if (!supabaseConfig.isConfigured) {
      setLoading(false);
      setError("Supabase non e' configurato: la libreria modelli richiede una sessione coach reale.");
      return;
    }
    setError(null);
    const result = await listWorkoutTemplateSummaries();
    if (!result.ok) {
      setError(result.message);
      setLoading(false);
      return;
    }
    setTemplates(result.data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!isCoach) {
    return <CoachOnlyNotice />;
  }

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator />
        <Text style={{ color: colors.inkSoft, marginTop: AppSpacing[2] }}>Caricamento allenamenti professionali…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.ink, fontWeight: '700' }}>Impossibile caricare la libreria.</Text>
        <Text style={{ color: colors.inkSoft, marginTop: 4, textAlign: 'center', paddingHorizontal: AppSpacing[5] }}>{error}</Text>
        <View style={{ marginTop: AppSpacing[3] }}>
          <AppButton label="Riprova" onPress={load} />
        </View>
      </View>
    );
  }

  const activeCategory = goal !== null ? (PROFESSIONAL_CATEGORIES.find((c) => c.goal === goal) ?? null) : null;
  if (goal !== null && !activeCategory) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.ink, fontWeight: '700' }}>Categoria non trovata.</Text>
        <View style={{ marginTop: AppSpacing[3] }}>
          <AppButton label="Torna ad Allenamenti professionali" onPress={() => router.replace('/schede/professionali')} />
        </View>
      </View>
    );
  }

  // Ambito FISSO ai soli modelli di sistema: "dentro Allenamenti
  // professionali, ricerca e filtri operano solo sui modelli di sistema" —
  // mai un modello personale del coach compare qui, in nessun caso.
  const systemTemplates = templates.filter((t) => t.isSystem);
  const categoryTemplates = activeCategory ? systemTemplates.filter((t) => t.goal === activeCategory.goal) : [];
  const scopedTemplates = activeCategory ? categoryTemplates : systemTemplates;

  function matchesSearchAndFilters(template: WorkoutTemplateSummary): boolean {
    if (!matchesLibraryFilters(template, filters)) return false;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return templateSearchHaystack(template).includes(query);
  }

  const filterOptions: LibraryFilterOptions = {
    goals: uniqueSorted(scopedTemplates.map((t) => t.goal)),
    levels: uniqueSorted(scopedTemplates.map((t) => t.level)),
    sessionsPerWeek: uniqueSortedNumbers(scopedTemplates.map((t) => t.sessionsPerWeek)),
    durationWeeks: uniqueSortedNumbers(scopedTemplates.map((t) => t.durationWeeks)),
    equipment: uniqueSorted(scopedTemplates.map((t) => t.equipment)),
    locations: uniqueSorted(scopedTemplates.map((t) => t.location)),
    trainingStyles: uniqueSorted(scopedTemplates.map((t) => t.trainingStyle)),
    muscleFocus: uniqueSorted(scopedTemplates.map((t) => t.muscleFocus)),
    intensity: uniqueSorted(scopedTemplates.map((t) => t.intensity)),
    // I modelli di sistema non vivono mai in una cartella: dimensione senza
    // senso qui, LibraryFilterBar la nasconde comunque via showFolderFilter.
    folders: [],
  };

  const showCategories = !activeCategory && !searchOrFiltersActive;

  type Row =
    | { key: string; kind: 'category'; goal: string; label: string; count: number }
    | { key: string; kind: 'template'; template: WorkoutTemplateSummary };

  const rows: Row[] = showCategories
    ? PROFESSIONAL_CATEGORIES.map((c) => ({
        key: `category-${c.goal}`,
        kind: 'category' as const,
        goal: c.goal,
        label: c.label,
        count: systemTemplates.filter((t) => t.goal === c.goal).length,
      }))
    : scopedTemplates
        .filter(matchesSearchAndFilters)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((template) => ({ key: template.id, kind: 'template' as const, template }));

  const title = activeCategory ? activeCategory.label : 'Allenamenti professionali';
  const subtitle = activeCategory ? `${categoryTemplates.length} modelli in questa categoria` : `${systemTemplates.length} modelli completi`;
  const backFallback = activeCategory ? '/schede/professionali' : '/schede';

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Platform.OS === 'web' ? AppSpacing[5] : insets.top + AppSpacing[3],
            paddingBottom: insets.bottom + BottomTabInset + AppSpacing[4],
          },
        ]}
        ListHeaderComponent={
          <View style={styles.header}>
            <BackHeader title={title} fallbackHref={backFallback} />
            <Text style={[styles.subtitle, { color: colors.inkSoft }]}>{subtitle}</Text>
            <LibraryFilterBar
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              showFilters={showFilters}
              onToggleFilters={() => setShowFilters((v) => !v)}
              filters={filters}
              onFiltersChange={setFilters}
              filterOptions={filterOptions}
              activeFilterCount={activeFilterCount}
              showKindFilter={false}
              showFolderFilter={false}
              searchPlaceholder={activeCategory ? 'Cerca in questa categoria' : 'Cerca tra i modelli professionali'}
            />
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: AppSpacing[2] }} />}
        ListEmptyComponent={
          <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>
            {searchOrFiltersActive ? 'Nessun risultato per la ricerca o i filtri selezionati.' : 'Nessun modello professionale disponibile.'}
          </Text>
        }
        renderItem={({ item }) => {
          if (item.kind === 'category') {
            return (
              <CategoryRow
                label={item.label}
                count={item.count}
                onPress={() => router.push({ pathname: '/schede/professionali/[goal]', params: { goal: item.goal } })}
              />
            );
          }
          return <TemplateRow template={item.template} onPress={() => router.push(`/schede/modello/${item.template.id}`)} />;
        }}
      />
    </View>
  );
}

// Riga sottocategoria (Dimagrimento, Massa muscolare, ...): virtuale come la
// cartella padre, nessuna azione di modifica — solo apertura.
function CategoryRow({ label, count, onPress }: { label: string; count: number; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <AppPressableCard onPress={onPress} accessibilityLabel={`Apri categoria ${label}`} style={styles.categoryRow}>
      <View style={[styles.categoryIcon, { backgroundColor: colors.mossSoft }]}>
        <Layers size={22} color={colors.moss} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.categoryName, { color: colors.ink }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.categoryMeta, { color: colors.inkSoft }]}>
          {count} {count === 1 ? 'modello' : 'modelli'}
        </Text>
      </View>
      <ChevronRight size={18} color={colors.inkFaint} />
    </AppPressableCard>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: AppSpacing[5] },
  header: { gap: AppSpacing[3], marginBottom: AppSpacing[2] },
  subtitle: { fontSize: AppFontSize.sm, fontWeight: '600', marginTop: -AppSpacing[1] },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: AppSpacing[3], padding: AppSpacing[3] },
  categoryIcon: { width: 44, height: 44, borderRadius: AppRadius.lg, alignItems: 'center', justifyContent: 'center' },
  categoryName: { fontSize: 16, fontWeight: '700' },
  categoryMeta: { fontSize: 12, fontWeight: '600', marginTop: 2 },
});
