import { Image } from 'expo-image';
import { Dumbbell, Play } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';

import { Radius } from '@/constants/theme';
import { resolveExerciseCatalogThumbnail } from '@/data/exercise-image-catalog';
import { useTheme } from '@/hooks/use-theme';
import { fetchExerciseVideoInfoCached } from '@/lib/exercise-video-info-cache';
import { supabaseConfig } from '@/lib/supabase';
import { fetchYmoveThumbnail, getCachedYmoveThumbnail, refreshYmoveThumbnail } from '@/lib/ymove-thumbnail-cache';
import type { Exercise } from '@/types/training';

// Thumbnail condivisa per liste, schede, modelli e dettaglio esercizio.
// Priorita' visuale:
// 1. immagine interna stabile del catalogo FitCoach;
// 2. thumbnail YMove richiesta live e mantenuta soltanto in cache quando non
//    esiste ancora un asset interno;
// 3. placeholder stabile per gruppo muscolare;
// 4. iniziale/indicatore video caricato come ultimo fallback.
// Non monta mai un video e non salva URL YMove temporanee nel database.
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
  const catalogThumbnail = resolveExerciseCatalogThumbnail(exercise);
  const localImageSource = catalogThumbnail.kind === 'image' ? catalogThumbnail.source : null;
  const containerStyle = { width: size, height: size, borderRadius: size >= 64 ? Radius.md : Radius.sm };
  const mountedRef = useRef(true);
  const activeRequestKeyRef = useRef('');

  const [remoteThumbnailUrl, setRemoteThumbnailUrl] = useState<string | null>(null);
  const [linkedYmoveId, setLinkedYmoveId] = useState<string | null>(null);
  const [hasUploadVideo, setHasUploadVideo] = useState(Boolean(exercise.videoUrl));
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [ymoveRetryAttempted, setYmoveRetryAttempted] = useState(false);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    activeRequestKeyRef.current = `${id}:${directYmoveId ?? ''}:${catalogThumbnail.catalogId}:${exercise.videoUrl ?? ''}`;
    setRemoteThumbnailUrl(null);
    setLinkedYmoveId(null);
    setHasUploadVideo(Boolean(exercise.videoUrl));
    setLoadingRemote(false);
    setImageFailed(false);
    setYmoveRetryAttempted(false);

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

    // Una cover interna stabile ha sempre priorita': evita chiamate YMove
    // inutili e non permette a un URL temporaneo di sostituire l'asset nostro.
    if (localImageSource) {
      return () => {
        cancelled = true;
      };
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
        setLinkedYmoveId(result.data.ymoveExerciseId);
        loadFromCacheOrFetch(result.data.ymoveExerciseId);
        return;
      }
      // source === 'upload': nessun poster salvato oggi, resta il
      // placeholder (vedi commento del componente sopra).
      setHasUploadVideo(true);
    });

    return () => {
      cancelled = true;
    };
  }, [id, directYmoveId, exercise.source, exercise.videoUrl, catalogThumbnail.catalogId, localImageSource]);

  const effectiveYmoveId = directYmoveId ?? linkedYmoveId;
  const remoteSourceType = directYmoveId ? 'ymove' : linkedYmoveId ? 'ymove-linked' : null;
  const imageSource = !imageFailed ? (localImageSource ?? (remoteThumbnailUrl ? { uri: remoteThumbnailUrl } : null)) : null;
  const showUploadVideoBadge = hasUploadVideo && !imageSource;

  function logThumbnailError(sourceType: string, attemptedSource: string) {
    if (__DEV__) {
      console.warn('EXERCISE_THUMBNAIL_ERROR', {
        exerciseId: id,
        exerciseName: exercise.name,
        sourceType,
        attemptedSource,
      });
    }
  }

  function handleImageError() {
    setLoadingRemote(false);

    if (remoteThumbnailUrl && effectiveYmoveId) {
      logThumbnailError(remoteSourceType ?? 'ymove', `ymove:${effectiveYmoveId}`);
      setRemoteThumbnailUrl(null);
      if (!ymoveRetryAttempted) {
        setYmoveRetryAttempted(true);
        setImageFailed(false);
        const retryRequestKey = activeRequestKeyRef.current;
        refreshYmoveThumbnail(effectiveYmoveId).then((url) => {
          if (!mountedRef.current || activeRequestKeyRef.current !== retryRequestKey) return;
          setRemoteThumbnailUrl(url);
          setLoadingRemote(false);
          if (!url) setImageFailed(true);
        });
        return;
      }
      setImageFailed(true);
      return;
    }

    if (localImageSource) {
      logThumbnailError('catalog-image', catalogThumbnail.attemptedSource);
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
      {loadingRemote ? (
        <ActivityIndicator size="small" color={theme.textSecondary} />
      ) : (
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
      )}
      {showUploadVideoBadge ? (
        <View style={styles.placeholderVideoBadge} pointerEvents="none">
          <Play size={Math.max(9, size * 0.24)} color={theme.textSecondary} fill={theme.textSecondary} />
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
