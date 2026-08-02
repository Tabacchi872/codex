import { Image } from 'expo-image';
import { Dumbbell, Play } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';

import { Radius } from '@/constants/theme';
import { resolveExerciseCatalogThumbnail } from '@/data/exercise-image-catalog';
import { useTheme } from '@/hooks/use-theme';
import { fetchExerciseVideoInfoCached } from '@/lib/exercise-video-info-cache';
import { supabaseConfig } from '@/lib/supabase';
import type { Exercise } from '@/types/training';

// Thumbnail condivisa per liste, schede, modelli e dettaglio esercizio.
// Priorita' visuale:
// 1. immagine interna stabile del catalogo FitCoach;
// 2. placeholder stabile per gruppo muscolare, con badge "ha video" SOLO se
//    verificato localmente, altrimenti badge "YMove" (provenienza, non
//    disponibilita');
// 3. iniziale come ultimo fallback per il placeholder.
//
// 2026-08-02 (protezione cap mensile YMove): questo componente NON richiede
// piu' mai una miniatura YMove live (GET /exercises/{id}, consuma il limite
// mensile) al semplice render di una card — prima lo faceva in automatico per
// ogni esercizio 'ymove'/collegato, anche dentro liste con molte righe (es.
// Scheda modello di un template YMove: fino a 22 richieste al primo render).
//
// 2026-08-02 (correzione): "source === 'ymove'" NON implica "ha un video".
// Verificato leggendo scripts/import-ymove-bulk.py (righe 80-92): al momento
// dell'import bulk, exercise_external_links veniva scritto SOLO per gli
// esercizi che avevano davvero un videoUrl nella risposta — non
// necessariamente tutti i 360. "Origine YMove" e "video disponibile" sono
// due fatti distinti: il badge "ha video" (icona Play) e' mostrato SOLO con
// prova locale reale (video caricato dal coach, o collegamento YMove
// indiretto gia' verificato tramite exercise_videos — mai dall'API YMove,
// mai una nuova query per i 360 esercizi 'ymove' diretti, che restano senza
// badge Play e mostrano invece il badge "Y" di sola provenienza). Il video
// vero e proprio resta disponibile SOLO tramite l'azione esplicita
// dell'utente (apertura del dettaglio esercizio, che monta YMoveVideoPlayer
// separatamente — vedi esercizi/[id].tsx, invariato da questo fix).
export function ExerciseThumbnail({
  exercise,
  exerciseId,
  size = 48,
}: {
  exercise: Exercise;
  exerciseId?: string;
  size?: number;
}) {
  const theme = useTheme();
  const id = exerciseId ?? exercise.id;
  // Provenienza, zero costo (gia' in memoria): mai usata per affermare "ha
  // video", solo per un badge distinto di sola provenienza.
  const isDirectYmoveExercise = exercise.source === 'ymove' && Boolean(exercise.ymoveExerciseId);
  const catalogThumbnail = resolveExerciseCatalogThumbnail(exercise);
  const localImageSource = catalogThumbnail.kind === 'image' ? catalogThumbnail.source : null;
  const containerStyle = { width: size, height: size, borderRadius: size >= 64 ? Radius.md : Radius.sm };

  const [hasVideoBadge, setHasVideoBadge] = useState(Boolean(exercise.videoUrl));
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
    setHasVideoBadge(Boolean(exercise.videoUrl));

    // Nessuna cover interna e nessun id YMove diretto: puo' comunque
    // esisterne uno indiretto tramite exercise_videos (esercizio locale
    // storico o custom collegato manualmente da un coach, o video caricato).
    // Questa e' una query Supabase (exercise_videos), MAI una chiamata YMove
    // — usata solo per sapere SE mostrare il badge "ha video", mai per
    // ottenere una miniatura reale. Saltata per gli esercizi 'ymove' diretti
    // (isDirectYmoveExercise): aggiungerla anche li' sostituirebbe le
    // chiamate YMove eliminate con altrettante query Supabase per gli stessi
    // 360 esercizi, esattamente cio' che questo fix vuole evitare.
    if (localImageSource || isDirectYmoveExercise || !supabaseConfig.isConfigured) return;
    let cancelled = false;
    fetchExerciseVideoInfoCached(id).then((result) => {
      if (cancelled || !result.ok || !result.data) return;
      setHasVideoBadge(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id, isDirectYmoveExercise, exercise.videoUrl, localImageSource]);

  const imageSource = !imageFailed ? localImageSource : null;
  const showVideoBadge = hasVideoBadge && !imageSource;
  const showYmoveBadge = !showVideoBadge && isDirectYmoveExercise && !imageSource;

  function handleImageError() {
    if (__DEV__) {
      console.warn('EXERCISE_THUMBNAIL_ERROR', {
        exerciseId: id,
        exerciseName: exercise.name,
        sourceType: 'catalog-image',
        attemptedSource: catalogThumbnail.attemptedSource,
      });
    }
    setImageFailed(true);
  }

  if (imageSource) {
    return (
      <View style={[containerStyle, styles.imageWrapper]}>
        <Image source={imageSource} style={[StyleSheet.absoluteFill, styles.image]} contentFit="cover" onError={handleImageError} />
        <View style={styles.playBadge} pointerEvents="none">
          <Play size={Math.max(10, size * 0.28)} color="#fff" fill="#fff" />
        </View>
      </View>
    );
  }

  const placeholderLabel = catalogThumbnail.kind === 'placeholder' ? catalogThumbnail.label : exercise.name.charAt(0).toUpperCase();
  const placeholderForeground = catalogThumbnail.kind === 'placeholder' ? catalogThumbnail.foregroundColor : theme.textSecondary;

  return (
    <View
      style={[
        styles.placeholder,
        containerStyle,
        {
          backgroundColor: catalogThumbnail.kind === 'placeholder' ? catalogThumbnail.backgroundColor : theme.background,
          borderColor: catalogThumbnail.kind === 'placeholder' ? catalogThumbnail.foregroundColor : theme.border,
        },
      ]}>
      <View style={styles.placeholderContent}>
        <Dumbbell size={Math.max(16, size * 0.3)} color={placeholderForeground} strokeWidth={2.1} />
        <ThemedText
          type="smallBold"
          themeColor="textSecondary"
          style={{
            color: placeholderForeground,
            fontSize: Math.max(10, size * 0.18),
            lineHeight: Math.max(13, size * 0.22),
          }}
          numberOfLines={1}>
          {placeholderLabel}
        </ThemedText>
      </View>
      {showVideoBadge ? (
        <View style={styles.placeholderVideoBadge} pointerEvents="none">
          <Play size={Math.max(9, size * 0.24)} color={theme.textSecondary} fill={theme.textSecondary} />
        </View>
      ) : showYmoveBadge ? (
        // Sola provenienza, MAI "ha video": nessuna prova locale per questo
        // esercizio specifico (vedi commento in testa al file).
        <View
          style={[styles.placeholderVideoBadge, styles.ymoveBadge, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}
          pointerEvents="none">
          <ThemedText type="smallBold" style={{ color: theme.textSecondary, fontSize: Math.max(7, size * 0.15), lineHeight: Math.max(8, size * 0.17) }}>
            Y
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  imageWrapper: {
    overflow: 'hidden',
  },
  image: {
    backgroundColor: '#00000010',
  },
  playBadge: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    backgroundColor: '#00000099',
    borderRadius: 999,
    padding: 3,
  },
  placeholderVideoBadge: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    borderRadius: 999,
  },
  ymoveBadge: {
    minWidth: 14,
    minHeight: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 3,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  placeholderContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
});
