import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Play } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { resolveVideoSource } from '@/data/video-registry';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';

type ExerciseVideoPlayerProps = {
  // Video guida remoto (fase 1): URL pubblico, mai un file nel repo. Ha
  // priorità su videoFile se presente.
  videoUrl?: string;
  // Sistema locale precedente (require() statico + video-registry.ts): resta
  // come fallback per compatibilità, oggi non popolato per nessun esercizio.
  videoFile?: string;
};

// Video guida: preferisce sempre un URL remoto (videoUrl, fase 1 — nessun
// file bundlato nel repo) e ricade sul sistema locale precedente (videoFile +
// video-registry.ts) solo se l'URL manca. Se nessuna delle due sorgenti è
// disponibile, mostra un fallback onesto con icona Play (mai un player rotto
// o un embed esterno). useVideoPlayer richiede una sorgente non nulla, quindi
// il player viene creato SOLO nel sottocomponente montato quando una sorgente
// reale esiste (mai in modo condizionale nello stesso componente, per
// rispettare le regole degli hook).
export function ExerciseVideoPlayer({ videoUrl, videoFile }: ExerciseVideoPlayerProps) {
  const localSource = videoUrl ? null : videoFile ? resolveVideoSource(videoFile) : null;
  const source = videoUrl ?? localSource;

  if (!source) {
    return <FallbackCard title="Nessun video disponibile" text="Il video guida per questo esercizio non è ancora disponibile." />;
  }

  return <LoadedExerciseVideo source={source} label={videoUrl ?? videoFile ?? ''} />;
}

function LoadedExerciseVideo({ source, label }: { source: string | number; label: string }) {
  const { colors } = useAppTheme();
  const player = useVideoPlayer(source, (p) => {
    p.loop = false;
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });

  if (status === 'error') {
    return (
      <FallbackCard
        tone="rust"
        title="Errore di caricamento video"
        text={`Il video "${label}" è registrato ma non è stato possibile riprodurlo (formato non valido, file danneggiato o URL non raggiungibile).`}
      />
    );
  }

  return (
    <View style={styles.wrapper}>
      <VideoView player={player} style={styles.video} nativeControls />
      {status === 'loading' ? <Text style={[styles.loadingLabel, { color: colors.inkSoft }]}>Caricamento video…</Text> : null}
    </View>
  );
}

function FallbackCard({ title, text, tone = 'moss' }: { title: string; text: string; tone?: 'moss' | 'rust' }) {
  const { colors } = useAppTheme();
  const iconBg = tone === 'moss' ? colors.mossSoft : colors.rustSoft;
  const iconColor = tone === 'moss' ? colors.moss : colors.rust;

  return (
    <View style={[styles.fallback, { backgroundColor: colors.surfaceSubtle }]}>
      <View style={[styles.fallbackIconWrap, { backgroundColor: iconBg }]}>
        <Play size={22} color={iconColor} fill={tone === 'moss' ? iconColor : 'transparent'} />
      </View>
      <Text style={[styles.fallbackTitle, { color: tone === 'rust' ? colors.rust : colors.ink }]}>{title}</Text>
      <Text style={[styles.fallbackText, { color: colors.inkSoft }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: AppSpacing[1],
  },
  video: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: AppRadius.xl,
    backgroundColor: '#000',
  },
  fallback: {
    borderRadius: AppRadius.xl,
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
    padding: AppSpacing[4],
    gap: AppSpacing[2],
  },
  fallbackIconWrap: {
    width: 48,
    height: 48,
    borderRadius: AppRadius.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackTitle: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  fallbackText: {
    fontSize: AppFontSize.sm,
    textAlign: 'center',
  },
  loadingLabel: {
    fontSize: AppFontSize.sm,
    textAlign: 'center',
  },
});
