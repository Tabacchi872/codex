import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Dumbbell, Play, RefreshCw } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';

import { Card } from './card';
import { Pill } from './pill';
import { ThemedText } from './themed-text';
import { ThemedTextInput } from './themed-text-input';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createOrReuseExerciseFromYmove } from '@/lib/fitcoach-exercises-service';
import { getYmoveExerciseDetail, searchYmoveExercises, type YmoveExerciseDetail, type YmoveExerciseSummary } from '@/lib/ymove-service';
import { fetchYmoveThumbnail, getCachedYmoveThumbnail } from '@/lib/ymove-thumbnail-cache';
import type { Exercise } from '@/types/training';

export type YmoveVideoLinkSelection = { ymoveExerciseId: string; ymoveSlug: string | null };

type YMoveExercisePickerProps = {
  // 'import' (default): comportamento originale, crea/riusa un esercizio
  // FitCoach ("Aggiungi a FitCoach"). 'link-video' (2026-07-13): associa
  // SOLO il video di un esercizio YMove a un esercizio gia' esistente
  // (locale o FitCoach) — non crea alcuna riga in public.exercises, il
  // chiamante (esercizi/[id].tsx) salva ymove_exercise_id/ymove_slug su
  // exercise_videos.
  mode?: 'import' | 'link-video';
  onExerciseAdded?: (exercise: Exercise) => void;
  onVideoLinkSelected?: (selection: YmoveVideoLinkSelection) => void;
  onClose: () => void;
};

// Difensivo anche qui, non solo nel servizio/parser (ymove-service.ts,
// supabase/functions/ymove-exercises/index.ts): YMove non garantisce che
// exerciseType/muscleGroup/equipment/difficulty restino sempre nella forma
// dichiarata dal tipo TypeScript (che e' solo un contratto a compile-time,
// non una garanzia a runtime) — questi helper non crashano mai qualunque
// valore ricevano.
function safeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function safeText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string').join(', ');
  return '';
}

// Ricerca/anteprima/import dal catalogo YMove ("opzione B": il coach crea un
// esercizio FitCoach a partire da YMove, mai un semplice link esterno). Stile
// coerente col cluster editor scheda/esercizio, deliberatamente NON migrato
// al nuovo design system (vedi docs/PROJECT_STATE.md) — usa Card/ThemedText/
// ThemedTextInput come il resto di questo file, non AppCard/AppButton.
export function YMoveExercisePicker({ mode = 'import', onExerciseAdded, onVideoLinkSelected, onClose }: YMoveExercisePickerProps) {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [muscle, setMuscle] = useState('');
  const [equipment, setEquipment] = useState('');
  const [type, setType] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [results, setResults] = useState<YmoveExerciseSummary[]>([]);
  // true dal primo render: la ricerca iniziale senza filtri parte subito
  // (vedi effect sotto), quindi la card mostra "Caricamento" e non "Cerca".
  const [loading, setLoading] = useState(true);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  // Protegge la ricerca iniziale da doppie chiamate causate da React Strict
  // Mode (mount/unmount/remount in sviluppo) o da un rimontaggio del
  // componente: uno state booleano non basta perche' un secondo render
  // synchronous prima del completamento della prima fetch lo leggerebbe
  // ancora false — un ref persiste attraverso i render senza causarne uno
  // nuovo.
  const didInitialSearchRef = useRef(false);

  async function handleSearch() {
    setLoading(true);
    setError('');
    const result = await searchYmoveExercises({ name, muscle, equipment, type, difficulty });
    setLoading(false);
    setSearched(true);
    if (!result.ok) {
      setError(result.message);
      // Non azzerare risultati gia' caricati in precedenza: una ricerca
      // fallita non deve far sparire cio' che era gia' visibile, l'errore
      // si mostra sopra la lista esistente.
      return;
    }
    setResults(result.data);
  }

  useEffect(() => {
    if (didInitialSearchRef.current) return;
    didInitialSearchRef.current = true;
    handleSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="smallBold">Libreria YMove</ThemedText>
        <Pressable onPress={onClose} hitSlop={8}>
          <ThemedText type="small" themeColor="textSecondary">
            Chiudi
          </ThemedText>
        </Pressable>
      </View>

      <ThemedTextInput value={name} onChangeText={setName} placeholder="Cerca per nome" onSubmitEditing={handleSearch} />
      <View style={styles.filterRow}>
        <View style={styles.filterField}>
          <ThemedTextInput value={muscle} onChangeText={setMuscle} placeholder="Muscolo" onSubmitEditing={handleSearch} />
        </View>
        <View style={styles.filterField}>
          <ThemedTextInput value={equipment} onChangeText={setEquipment} placeholder="Attrezzatura" onSubmitEditing={handleSearch} />
        </View>
      </View>
      <View style={styles.filterRow}>
        <View style={styles.filterField}>
          <ThemedTextInput value={type} onChangeText={setType} placeholder="Tipologia" onSubmitEditing={handleSearch} />
        </View>
        <View style={styles.filterField}>
          <ThemedTextInput value={difficulty} onChangeText={setDifficulty} placeholder="Difficolta'" onSubmitEditing={handleSearch} />
        </View>
      </View>

      <Pressable onPress={handleSearch}>
        <View style={[styles.searchButton, { backgroundColor: theme.primary }]}>
          {loading ? <ActivityIndicator color="#fff" /> : <ThemedText type="smallBold" themeColor="onPrimary">Cerca</ThemedText>}
        </View>
      </Pressable>

      {loading && results.length === 0 && !error ? (
        <View style={styles.initialLoading}>
          <ActivityIndicator />
          <ThemedText type="small" themeColor="textSecondary">
            Caricamento esercizi YMove...
          </ThemedText>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBlock}>
          <ThemedText type="small" themeColor="statusExpired">
            {error}
          </ThemedText>
          <Pressable onPress={handleSearch} hitSlop={6} style={[styles.retryButton, { borderColor: theme.border }]}>
            <RefreshCw size={14} color={theme.text} />
            <ThemedText type="small">Riprova</ThemedText>
          </Pressable>
        </View>
      ) : null}

      {!loading && searched && results.length === 0 && !error ? (
        <ThemedText type="small" themeColor="textSecondary">
          Nessun esercizio trovato su YMove con questi filtri.
        </ThemedText>
      ) : null}

      {results
        // Difensivo: results dovrebbe gia' contenere solo elementi validi
        // (filtrati da searchYmoveExercises), ma non ci si affida solo a
        // quello — un elemento null/senza id/senza title viene scartato qui
        // invece di rompere key={item.id} o il rendering di YMoveResultRow.
        .filter((item): item is YmoveExerciseSummary => Boolean(item) && Boolean(item.id) && Boolean(item.title))
        .map((item) => (
          <YMoveResultRow
            key={item.id}
            item={item}
            mode={mode}
            onExerciseAdded={onExerciseAdded}
            onVideoLinkSelected={onVideoLinkSelected}
          />
        ))}
    </Card>
  );
}

// Miniatura lazy per una card di risultato ricerca (non l'anteprima completa
// nel dettaglio, ne' l'immagine di ExerciseThumbnail che serve invece per gli
// esercizi gia' assegnati a una scheda): richiede il dettaglio SOLO se non
// gia' in cache (fetchYmoveThumbnail/ymove-thumbnail-cache.ts gia' deduplica
// e limita a 2 richieste concorrenti globali), mai per tutti i risultati
// contemporaneamente al primo render della lista. Se l'immagine fallisce a
// caricare (URL scaduto, rete), richiede il dettaglio una sola volta e poi
// resta sul placeholder (mai un loop di retry).
function YMoveResultThumbnail({ item }: { item: YmoveExerciseSummary }) {
  const theme = useTheme();
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null | undefined>(() => getCachedYmoveThumbnail(item.id));
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    if (thumbnailUrl !== undefined) return;
    let cancelled = false;
    fetchYmoveThumbnail(item.id).then((url) => {
      if (!cancelled) setThumbnailUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [item.id, thumbnailUrl]);

  const showImage = Boolean(thumbnailUrl) && !imageFailed;

  return (
    <View style={[styles.resultThumbnail, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      {showImage ? (
        <Image
          source={{ uri: thumbnailUrl as string }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <Dumbbell size={20} color={theme.textSecondary} />
      )}
      {item.hasVideo ? (
        <View style={styles.resultPlayBadge} pointerEvents="none">
          <Play size={11} color="#fff" fill="#fff" />
        </View>
      ) : null}
    </View>
  );
}

function YMoveResultRow({
  item,
  mode,
  onExerciseAdded,
  onVideoLinkSelected,
}: {
  item: YmoveExerciseSummary;
  mode: 'import' | 'link-video';
  onExerciseAdded?: (exercise: Exercise) => void;
  onVideoLinkSelected?: (selection: YmoveVideoLinkSelection) => void;
}) {
  const theme = useTheme();
  const [showPreview, setShowPreview] = useState(false);
  const [detail, setDetail] = useState<YmoveExerciseDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [imported, setImported] = useState(false);

  async function loadDetail(): Promise<YmoveExerciseDetail | null> {
    setDetailLoading(true);
    setDetailError('');
    const result = await getYmoveExerciseDetail(item.id);
    setDetailLoading(false);
    if (!result.ok) {
      setDetailError(result.message);
      return null;
    }
    setDetail(result.data);
    return result.data;
  }

  async function togglePreview() {
    const next = !showPreview;
    setShowPreview(next);
    if (next && !detail) {
      await loadDetail();
    }
  }

  async function handleAdd() {
    if (mode === 'link-video') {
      // Qui basta id/slug (gia' noti da item, il risultato di ricerca): non
      // serve richiedere il dettaglio completo solo per collegare il video.
      onVideoLinkSelected?.({ ymoveExerciseId: item.id, ymoveSlug: item.slug });
      setImported(true);
      return;
    }

    setImporting(true);
    setImportError('');
    // Serve sempre il dettaglio completo (descrizione/istruzioni/muscoli/
    // attrezzatura/difficolta'/tipologia/slug) per creare l'esercizio
    // FitCoach: se l'anteprima non e' mai stata aperta, viene richiesto ora.
    const full = detail ?? (await loadDetail());
    if (!full) {
      setImporting(false);
      setImportError(detailError || "Impossibile leggere i dati dell'esercizio da YMove.");
      return;
    }
    const result = await createOrReuseExerciseFromYmove(full);
    setImporting(false);
    if (!result.ok) {
      setImportError(result.message);
      return;
    }
    setImported(true);
    onExerciseAdded?.(result.data);
  }

  return (
    <Card style={styles.resultCard}>
      <View style={styles.resultHeader}>
        <Pressable onPress={togglePreview} hitSlop={4}>
          <YMoveResultThumbnail item={item} />
        </Pressable>
        <View style={styles.resultHeaderText}>
          <ThemedText type="smallBold">{item.title}</ThemedText>
          <View style={styles.chipsRow}>
            {safeText(item.muscleGroup) ? <Pill label={safeText(item.muscleGroup)} /> : null}
            {safeText(item.equipment) ? <Pill label={safeText(item.equipment)} /> : null}
            {safeText(item.difficulty) ? <Pill label={safeText(item.difficulty)} /> : null}
            {safeStringArray(item.exerciseType).length > 0 ? <Pill label={safeStringArray(item.exerciseType).join(', ')} /> : null}
          </View>
        </View>
      </View>

      <View style={styles.actionsRow}>
        <Pressable onPress={togglePreview} hitSlop={6}>
          <ThemedText type="small" style={{ color: theme.primary }}>
            {showPreview ? 'Nascondi anteprima' : 'Anteprima'}
          </ThemedText>
        </Pressable>
        <Pressable onPress={handleAdd} disabled={importing || imported} hitSlop={6}>
          <View style={[styles.addButton, { backgroundColor: imported ? theme.backgroundElement : theme.primary, opacity: importing ? 0.7 : 1 }]}>
            {importing ? (
              <ActivityIndicator size="small" color={imported ? theme.text : '#fff'} />
            ) : (
              <ThemedText type="small" themeColor={imported ? 'text' : 'onPrimary'} style={styles.addButtonLabel}>
                {imported
                  ? mode === 'link-video'
                    ? 'Selezionato'
                    : 'Aggiunto'
                  : mode === 'link-video'
                    ? 'Usa questo video'
                    : 'Aggiungi a FitCoach'}
              </ThemedText>
            )}
          </View>
        </Pressable>
      </View>

      {importError ? (
        <ThemedText type="small" themeColor="statusExpired">
          {importError}
        </ThemedText>
      ) : null}

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
            <>
              <PreviewVideo detail={detail} onRefetch={loadDetail} />
              {safeText(detail.instructions) || safeText(detail.description) ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {safeText(detail.instructions) || safeText(detail.description)}
                </ThemedText>
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

// Anteprima video PRIMA dell'import: usa direttamente l'URL gia' ottenuto da
// GET /exercises/:id (mai salvato). Se il player fallisce, "Riprova" ripete
// la stessa chiamata per ottenere un URL fresco (gli URL YMove scadono).
function PreviewVideo({ detail, onRefetch }: { detail: YmoveExerciseDetail; onRefetch: () => void }) {
  const source = detail.videoUrl ?? detail.videoHlsUrl;

  if (!source) {
    if (detail.thumbnailUrl) {
      return <Image source={{ uri: detail.thumbnailUrl }} style={styles.thumbnail} resizeMode="cover" />;
    }
    return (
      <ThemedText type="small" themeColor="textSecondary">
        Nessun video disponibile per questo esercizio.
      </ThemedText>
    );
  }

  return <PreviewVideoPlayer source={source} thumbnailUrl={detail.thumbnailUrl} onRefetch={onRefetch} />;
}

function PreviewVideoPlayer({
  source,
  thumbnailUrl,
  onRefetch,
}: {
  source: string;
  thumbnailUrl: string | null;
  onRefetch: () => void;
}) {
  const player = useVideoPlayer(source, (p) => {
    p.loop = false;
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });

  if (status === 'error') {
    return (
      <View style={styles.previewError}>
        <ThemedText type="small" themeColor="statusExpired">
          Il video non e' piu' raggiungibile (link scaduto).
        </ThemedText>
        <Pressable onPress={onRefetch} hitSlop={6} style={styles.retryButton}>
          <RefreshCw size={14} />
          <ThemedText type="small">Riprova</ThemedText>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      {thumbnailUrl && status === 'loading' ? <Image source={{ uri: thumbnailUrl }} style={styles.thumbnailOverlay} resizeMode="cover" /> : null}
      <VideoView player={player} style={styles.video} nativeControls />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  filterRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  filterField: {
    flex: 1,
  },
  searchButton: {
    borderRadius: Radius.md,
    paddingVertical: Spacing.two,
    alignItems: 'center',
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
    gap: Spacing.two,
    justifyContent: 'center',
  },
  resultThumbnail: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  resultPlayBadge: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    backgroundColor: '#00000099',
    borderRadius: 999,
    padding: 3,
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
  },
  addButton: {
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    minWidth: 100,
    alignItems: 'center',
  },
  addButtonLabel: {
    fontWeight: '700',
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
  video: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: Radius.md,
    backgroundColor: '#000',
  },
  thumbnail: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: Radius.md,
  },
  thumbnailOverlay: {
    position: 'absolute',
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: Radius.md,
    zIndex: 1,
  },
});
