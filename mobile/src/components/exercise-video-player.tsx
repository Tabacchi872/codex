import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { resolveVideoSource } from '@/data/video-registry';

// Video guida SEMPRE locali (mai YouTube/WebView/embed esterni). Se il file non è
// stato ancora caricato in mobile/assets/videos/ e registrato in video-registry.ts,
// non si tenta nessuna riproduzione: si mostra un placeholder onesto. useVideoPlayer
// richiede una sorgente non nulla, quindi il player viene creato SOLO nel
// sottocomponente montato quando una sorgente reale esiste (mai in modo condizionale
// dentro lo stesso componente, per rispettare le regole degli hook).
export function ExerciseVideoPlayer({ videoFile }: { videoFile: string }) {
  const source = resolveVideoSource(videoFile);

  if (!source) {
    return (
      <ThemedView type="backgroundElement" style={styles.placeholder}>
        <ThemedText type="smallBold">Nessun video disponibile</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.placeholderText}>
          Il video guida per questo esercizio non è ancora disponibile.
        </ThemedText>
      </ThemedView>
    );
  }

  return <LoadedExerciseVideo source={source} videoFile={videoFile} />;
}

function LoadedExerciseVideo({ source, videoFile }: { source: number; videoFile: string }) {
  const player = useVideoPlayer(source, (p) => {
    p.loop = false;
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });

  if (status === 'error') {
    return (
      <ThemedView type="backgroundElement" style={styles.placeholder}>
        <ThemedText type="smallBold" themeColor="statusExpired">
          Errore di caricamento video
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.placeholderText}>
          Il file "{videoFile}" è registrato ma non è stato possibile riprodurlo (formato non valido o file
          danneggiato).
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <View style={styles.wrapper}>
      <VideoView player={player} style={styles.video} nativeControls />
      {status === 'loading' && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.loadingLabel}>
          Caricamento video…
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.one,
  },
  video: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 10,
    backgroundColor: '#000',
  },
  placeholder: {
    borderRadius: 10,
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
    gap: Spacing.one,
  },
  placeholderText: {
    textAlign: 'center',
  },
  loadingLabel: {
    textAlign: 'center',
  },
});
