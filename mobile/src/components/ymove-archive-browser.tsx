import { Dumbbell, RefreshCw } from 'lucide-react-native';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Card } from './card';
import { Pill } from './pill';
import { ThemedText } from './themed-text';
import { AppButton } from './ui';
import type { YmoveVideoLinkSelection } from './ymove-exercise-picker';
import { PreviewVideo, YMoveResultThumbnail } from './ymove-preview-shared';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { listYmoveArchiveExercises } from '@/lib/fitcoach-exercises-service';
import { getYmoveExerciseDetail, type YmoveExerciseDetail } from '@/lib/ymove-service';
import type { Exercise } from '@/types/training';

// Tab "Archivio" del picker YMove (mobile/src/components/ymove-exercise-picker.tsx):
// sfoglia i 360 esercizi gia' importati in blocco (public.exercises,
// source='ymove', pipeline supabase/functions/ymove-library-import) invece di
// cercare live sull'intero catalogo YMove. La lista testuale (nome/muscolo/
// attrezzatura) e' caricata UNA SOLA VOLTA all'apertura, senza alcuna
// chiamata all'API YMove — il video/thumbnail di ciascun esercizio resta
// sempre richiesto live, e SOLO quando il coach apre l'anteprima di quella
// card specifica (mai al render della lista, mai scrollando), per non
// sprecare la cap mensile di richieste esercizi/video del piano YMove.

type YMoveArchiveBrowserProps = {
  mode: 'import' | 'link-video';
  onExerciseAdded?: (exercise: Exercise) => void;
  onVideoLinkSelected?: (selection: YmoveVideoLinkSelection) => void;
};

const ALL_FILTER = '__all__';

export function YMoveArchiveBrowser({ mode, onExerciseAdded, onVideoLinkSelected }: YMoveArchiveBrowserProps) {
  const theme = useTheme();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [muscleFilter, setMuscleFilter] = useState(ALL_FILTER);
  const [equipmentFilter, setEquipmentFilter] = useState(ALL_FILTER);
  const [openMenu, setOpenMenu] = useState<'muscle' | 'equipment' | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    const result = await listYmoveArchiveExercises();
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setExercises(result.data);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Valori filtro derivati dai dati reali (inglese, come restituiti da YMove
  // — es. "triceps"/"dumbbell" — MAI i gruppi muscolari italiani del
  // catalogo storico locale, elenco diverso e non riusabile qui).
  const muscleOptions = useMemo(
    () => [...new Set(exercises.map((e) => e.muscleGroup).filter((v): v is string => Boolean(v)))].sort(),
    [exercises],
  );
  const equipmentOptions = useMemo(
    () => [...new Set(exercises.map((e) => e.equipment).filter((v): v is string => Boolean(v)))].sort(),
    [exercises],
  );

  const filtered = exercises.filter(
    (e) =>
      (muscleFilter === ALL_FILTER || e.muscleGroup === muscleFilter) &&
      (equipmentFilter === ALL_FILTER || e.equipment === equipmentFilter),
  );

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        <View style={styles.filterField}>
          <SelectorButton
            label={muscleFilter === ALL_FILTER ? 'Tutti i muscoli' : muscleFilter}
            onPress={() => setOpenMenu(openMenu === 'muscle' ? null : 'muscle')}
          />
          {openMenu === 'muscle' ? (
            <DropdownList>
              <MenuOption
                label="Tutti i muscoli"
                active={muscleFilter === ALL_FILTER}
                onPress={() => {
                  setMuscleFilter(ALL_FILTER);
                  setOpenMenu(null);
                }}
              />
              {muscleOptions.map((option) => (
                <MenuOption
                  key={option}
                  label={option}
                  active={muscleFilter === option}
                  onPress={() => {
                    setMuscleFilter(option);
                    setOpenMenu(null);
                  }}
                />
              ))}
            </DropdownList>
          ) : null}
        </View>
        <View style={styles.filterField}>
          <SelectorButton
            label={equipmentFilter === ALL_FILTER ? 'Tutta attrezzatura' : equipmentFilter}
            onPress={() => setOpenMenu(openMenu === 'equipment' ? null : 'equipment')}
          />
          {openMenu === 'equipment' ? (
            <DropdownList>
              <MenuOption
                label="Tutta attrezzatura"
                active={equipmentFilter === ALL_FILTER}
                onPress={() => {
                  setEquipmentFilter(ALL_FILTER);
                  setOpenMenu(null);
                }}
              />
              {equipmentOptions.map((option) => (
                <MenuOption
                  key={option}
                  label={option}
                  active={equipmentFilter === option}
                  onPress={() => {
                    setEquipmentFilter(option);
                    setOpenMenu(null);
                  }}
                />
              ))}
            </DropdownList>
          ) : null}
        </View>
      </View>

      {loading ? (
        <View style={styles.initialLoading}>
          <ActivityIndicator />
          <ThemedText type="small" themeColor="textSecondary">
            Caricamento archivio YMove...
          </ThemedText>
        </View>
      ) : error ? (
        <View style={styles.errorBlock}>
          <ThemedText type="small" themeColor="statusExpired">
            {error}
          </ThemedText>
          <Pressable onPress={load} hitSlop={6} style={[styles.retryButton, { borderColor: theme.border }]}>
            <RefreshCw size={14} color={theme.text} />
            <ThemedText type="small">Riprova</ThemedText>
          </Pressable>
        </View>
      ) : filtered.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Nessun esercizio nell&apos;archivio con questi filtri.
        </ThemedText>
      ) : (
        filtered.map((exercise) => (
          <YMoveArchiveRow
            key={exercise.id}
            exercise={exercise}
            mode={mode}
            onExerciseAdded={onExerciseAdded}
            onVideoLinkSelected={onVideoLinkSelected}
          />
        ))
      )}
    </View>
  );
}

// Stesso linguaggio visivo del dropdown filtri gia' corretto per il tema
// chiaro/scuro in exercise-catalog-picker.tsx (BUG-041, theme.background/
// backgroundSelected): non importato direttamente perche' quel file tiene
// DropdownList/MenuOption privati (non esportati) e i suoi filtri sono
// specifici al catalogo storico italiano — qui servono solo i valori inglesi
// reali dell'archivio YMove, ricreare localmente lo stesso pattern minimo
// evita di esportare/generalizzare un componente pensato per un altro elenco.
function SelectorButton({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.selector, { borderColor: theme.border, backgroundColor: theme.background }]}
      accessibilityRole="button">
      <ThemedText type="small" numberOfLines={1}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function DropdownList({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <ScrollView
      style={[styles.dropdown, { backgroundColor: theme.background, borderColor: theme.border }]}
      nestedScrollEnabled>
      {children}
    </ScrollView>
  );
}

function MenuOption({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.menuOption, active && { backgroundColor: theme.backgroundSelected }]}>
      <ThemedText type="small" numberOfLines={1}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function YMoveArchiveRow({
  exercise,
  mode,
  onExerciseAdded,
  onVideoLinkSelected,
}: {
  exercise: Exercise;
  mode: 'import' | 'link-video';
  onExerciseAdded?: (exercise: Exercise) => void;
  onVideoLinkSelected?: (selection: YmoveVideoLinkSelection) => void;
}) {
  const theme = useTheme();
  const [showPreview, setShowPreview] = useState(false);
  const [detail, setDetail] = useState<YmoveExerciseDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [selected, setSelected] = useState(false);

  const ymoveExerciseId = exercise.ymoveExerciseId;

  async function loadDetail() {
    if (!ymoveExerciseId) return;
    setDetailLoading(true);
    setDetailError('');
    const result = await getYmoveExerciseDetail(ymoveExerciseId);
    setDetailLoading(false);
    if (!result.ok) {
      setDetailError(result.message);
      return;
    }
    setDetail(result.data);
  }

  async function togglePreview() {
    const next = !showPreview;
    setShowPreview(next);
    if (next && !detail) {
      await loadDetail();
    }
  }

  function handleAdd() {
    if (mode === 'link-video') {
      if (!ymoveExerciseId) return;
      onVideoLinkSelected?.({ ymoveExerciseId, ymoveSlug: exercise.ymoveSlug ?? null });
    } else {
      // A differenza del tab "Cerca live" (createOrReuseExerciseFromYmove),
      // qui l'esercizio e' gia' una riga reale di public.exercises (mappata
      // da listYmoveArchiveExercises con lo stesso mapper condiviso) — nessun
      // import da fare, si passa direttamente al chiamante.
      onExerciseAdded?.(exercise);
    }
    setSelected(true);
  }

  return (
    <Card style={styles.resultCard}>
      <View style={styles.resultHeader}>
        <Pressable onPress={togglePreview} hitSlop={4}>
          {ymoveExerciseId ? (
            <YMoveResultThumbnail ymoveExerciseId={ymoveExerciseId} />
          ) : (
            <View style={[styles.fallbackThumb, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <Dumbbell size={20} color={theme.textSecondary} />
            </View>
          )}
        </Pressable>
        <View style={styles.resultHeaderText}>
          <ThemedText type="smallBold" numberOfLines={2} style={styles.resultTitle}>
            {exercise.name}
          </ThemedText>
          <View style={styles.chipsRow}>
            {exercise.muscleGroup ? <Pill label={exercise.muscleGroup} /> : null}
            {exercise.equipment ? <Pill label={exercise.equipment} /> : null}
          </View>
        </View>
      </View>

      <View style={styles.actionsRow}>
        <AppButton label={showPreview ? 'Nascondi anteprima' : 'Anteprima'} onPress={togglePreview} variant="outline" size="sm" />
        <AppButton
          label={
            selected
              ? mode === 'link-video'
                ? 'Selezionato'
                : 'Aggiunto'
              : mode === 'link-video'
                ? 'Usa questo video'
                : 'Aggiungi alla scheda'
          }
          onPress={handleAdd}
          size="sm"
          disabled={selected || !ymoveExerciseId}
        />
      </View>

      {showPreview ? (
        <View style={styles.previewBlock}>
          {detailLoading ? (
            <ActivityIndicator />
          ) : detailError ? (
            <View style={styles.previewError}>
              <ThemedText type="small" themeColor="statusExpired">
                {detailError}
              </ThemedText>
              <Pressable onPress={loadDetail} hitSlop={6} style={[styles.retryButton, { borderColor: theme.border }]}>
                <RefreshCw size={14} color={theme.text} />
                <ThemedText type="small">Riprova</ThemedText>
              </Pressable>
            </View>
          ) : detail ? (
            <PreviewVideo detail={detail} onRefetch={loadDetail} />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  filterRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  filterField: {
    flex: 1,
    minWidth: 0,
  },
  selector: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
  },
  dropdown: {
    marginTop: 4,
    maxHeight: 220,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
  },
  menuOption: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
  },
  initialLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  errorBlock: {
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  resultCard: {
    gap: Spacing.two,
  },
  resultHeader: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  resultHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one,
    justifyContent: 'center',
  },
  resultTitle: {
    flexShrink: 1,
    fontSize: 16,
    lineHeight: 21,
  },
  fallbackThumb: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  previewBlock: {
    gap: Spacing.two,
  },
  previewError: {
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: 4,
  },
});
