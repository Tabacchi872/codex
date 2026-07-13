import { Image } from 'expo-image';
import { Play } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';

import { Radius } from '@/constants/theme';
import { resolveImageSource } from '@/data/image-registry';
import { useTheme } from '@/hooks/use-theme';
import { fetchExerciseVideoInfoCached } from '@/lib/exercise-video-info-cache';
import { supabaseConfig } from '@/lib/supabase';
import { fetchYmoveThumbnail, getCachedYmoveThumbnail } from '@/lib/ymove-thumbnail-cache';
import type { Exercise } from '@/types/training';

// Thumbnail dell'esercizio nelle card di scheda (coach/cliente, superserie e
// circuiti compresi — tutte passano da qui tramite WorkoutExerciseRow).
// Mostra SOLO un'immagine statica (mai VideoView, mai autoplay/audio: il
// video vero parte solo nel Dettaglio esercizio dopo un tocco esplicito) con
// queste priorita', dalla piu' specifica alla piu' generica:
// 1. Esercizio importato DA YMove (source==='ymove'): thumbnailUrl live
//    dell'esercizio YMove di origine, mai salvata nel DB (e' un link
//    firmato che scade), presa da una cache in memoria condivisa
//    (lib/ymove-thumbnail-cache.ts) per non richiamare la Edge Function ad
//    ogni render/ogni card con lo stesso video.
// 2. Esercizio locale storico o custom con un video YMove ASSOCIATO
//    (exercise_videos.ymove_exercise_id, 2026-07-13): stessa cache, stessa
//    live-fetch, chiave sempre l'id YMove (mai l'id dell'esercizio FitCoach).
// 3. Video caricato manualmente dal coach (exercise_videos.video_url): oggi
//    non esiste alcuna colonna per un poster/thumbnail salvato — resta il
//    placeholder con l'iniziale finche' non esistera' una vera generazione/
//    salvataggio di anteprima per questo caso (nessun frame estratto qui:
//    farlo richiederebbe montare il video, esplicitamente vietato).
// 4. Nessun video: placeholder con l'iniziale, come sempre.
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
  // Caso 1: l'id YMove e' gia' noto direttamente sull'esercizio, nessuna
  // query a exercise_videos necessaria.
  const directYmoveId = exercise.source === 'ymove' ? (exercise.ymoveExerciseId ?? null) : null;

  const [remoteThumbnailUrl, setRemoteThumbnailUrl] = useState<string | null>(null);
  const [loadingRemote, setLoadingRemote] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRemoteThumbnailUrl(null);
    setLoadingRemote(false);

    function loadFromCacheOrFetch(ymoveExerciseId: string) {
      const cached = getCachedYmoveThumbnail(ymoveExerciseId);
      if (cached !== undefined) {
        setRemoteThumbnailUrl(cached);
        return;
      }
      setLoadingRemote(true);
      fetchYmoveThumbnail(ymoveExerciseId).then((url) => {
        if (cancelled) return;
        setRemoteThumbnailUrl(url);
        setLoadingRemote(false);
      });
    }

    if (directYmoveId) {
      loadFromCacheOrFetch(directYmoveId);
      return () => {
        cancelled = true;
      };
    }

    // Caso 2: nessun collegamento YMove diretto sull'esercizio — puo'
    // comunque esisterne uno indiretto tramite exercise_videos (esercizio
    // locale storico o custom). Non ha senso interrogare Supabase se non e'
    // nemmeno configurato: nessuna riga potrebbe esistere.
    if (!supabaseConfig.isConfigured) return;
    fetchExerciseVideoInfoCached(id).then((result) => {
      if (cancelled || !result.ok || !result.data) return;
      if (result.data.source === 'ymove') {
        loadFromCacheOrFetch(result.data.ymoveExerciseId);
      }
      // source === 'upload': nessun poster salvato oggi, resta il
      // placeholder (vedi commento del componente sopra).
    });

    return () => {
      cancelled = true;
    };
  }, [id, directYmoveId]);

  const imageFile = exercise.videoFile.replace(/\.mp4$/i, '.jpg');
  const localImageSource = resolveImageSource(imageFile);
  const containerStyle = { width: size, height: size, borderRadius: size >= 64 ? Radius.md : Radius.sm };

  const imageSource = remoteThumbnailUrl ? { uri: remoteThumbnailUrl } : localImageSource;

  if (imageSource) {
    return (
      <View style={[containerStyle, styles.imageWrapper]}>
        <Image source={imageSource} style={[StyleSheet.absoluteFill, styles.image]} contentFit="cover" />
        <View style={styles.playBadge} pointerEvents="none">
          <Play size={Math.max(10, size * 0.28)} color="#fff" fill="#fff" />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.placeholder, containerStyle, { backgroundColor: theme.background, borderColor: theme.border }]}>
      {loadingRemote ? (
        <ActivityIndicator size="small" color={theme.textSecondary} />
      ) : (
        <ThemedText type="smallBold" themeColor="textSecondary" style={{ fontSize: size * 0.36 }}>
          {exercise.name.charAt(0).toUpperCase()}
        </ThemedText>
      )}
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
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
