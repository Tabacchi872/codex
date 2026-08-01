import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Dumbbell, Play, RefreshCw } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { YmoveExerciseDetail } from '@/lib/ymove-service';
import { fetchYmoveThumbnail, getCachedYmoveThumbnail } from '@/lib/ymove-thumbnail-cache';

// Componenti condivisi tra il tab "Cerca live" (ymove-exercise-picker.tsx) e
// il tab "Archivio" (ymove-archive-browser.tsx) del picker YMove: entrambi
// mostrano una miniatura lazy per riga e un'anteprima video-prima-di-scegliere
// con retry sugli URL scaduti. Estratti in questo file terzo (non importati
// direttamente da uno dei due componenti) per evitare un import circolare tra
// ymove-exercise-picker.tsx e ymove-archive-browser.tsx.

// Miniatura lazy per una card di risultato: richiede il dettaglio SOLO se non
// gia' in cache (fetchYmoveThumbnail/ymove-thumbnail-cache.ts gia' deduplica
// e limita a 2 richieste concorrenti globali), mai per tutti i risultati
// contemporaneamente al primo render della lista. Se l'immagine fallisce a
// caricare (URL scaduto, rete), richiede il dettaglio una sola volta e poi
// resta sul placeholder (mai un loop di retry).
export function YMoveResultThumbnail({ ymoveExerciseId, hasVideo }: { ymoveExerciseId: string; hasVideo?: boolean }) {
  const theme = useTheme();
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null | undefined>(() => getCachedYmoveThumbnail(ymoveExerciseId));
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    if (thumbnailUrl !== undefined) return;
    let cancelled = false;
    fetchYmoveThumbnail(ymoveExerciseId).then((url) => {
      if (!cancelled) setThumbnailUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [ymoveExerciseId, thumbnailUrl]);

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
      {hasVideo ? (
        <View style={styles.resultPlayBadge} pointerEvents="none">
          <Play size={11} color="#fff" fill="#fff" />
        </View>
      ) : null}
    </View>
  );
}

// Anteprima video PRIMA di scegliere l'esercizio (import o aggiunta
// dall'archivio): usa direttamente l'URL gia' ottenuto da GET /exercises/:id
// (mai salvato). Se il player fallisce, "Riprova" ripete la stessa chiamata
// per ottenere un URL fresco (gli URL YMove scadono dopo 48 ore).
export function PreviewVideo({ detail, onRefetch }: { detail: YmoveExerciseDetail; onRefetch: () => void }) {
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
      {thumbnailUrl && status === 'loading' ? (
        // Poster decorativo mostrato SOPRA la VideoView durante il caricamento
        // (zIndex 1): senza pointerEvents="none" intercetterebbe i tocchi
        // destinati ai controlli del player.
        <View style={styles.thumbnailOverlay} pointerEvents="none">
          <Image source={{ uri: thumbnailUrl }} style={[StyleSheet.absoluteFill, { borderRadius: Radius.md }]} resizeMode="cover" />
        </View>
      ) : null}
      <VideoView player={player} style={styles.video} nativeControls />
    </View>
  );
}

const styles = StyleSheet.create({
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
  previewError: {
    gap: 8,
    alignItems: 'flex-start',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.pill,
    paddingHorizontal: 12,
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
