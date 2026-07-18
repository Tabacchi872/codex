import { Play } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FullscreenVideoModal, VideoPreviewButton } from '@/components/fullscreen-video-modal';
import { resolveVideoSource } from '@/data/video-registry';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';

type ExerciseVideoPlayerProps = {
  videoUrl?: string;
  videoFile?: string;
};

export function ExerciseVideoPlayer({ videoUrl, videoFile }: ExerciseVideoPlayerProps) {
  const localSource = videoUrl ? null : videoFile ? resolveVideoSource(videoFile) : null;
  const source = videoUrl ?? localSource;

  if (!source) {
    return <FallbackCard title="Nessun video disponibile" text="Il video guida per questo esercizio non e' ancora disponibile." />;
  }

  return <LoadedExerciseVideo source={source} label={videoUrl ?? videoFile ?? ''} />;
}

function LoadedExerciseVideo({ source, label }: { source: string | number; label: string }) {
  const [isFullscreenVisible, setFullscreenVisible] = useState(false);
  const [hasPlaybackError, setHasPlaybackError] = useState(false);

  if (hasPlaybackError) {
    return (
      <FallbackCard
        tone="rust"
        title="Errore di caricamento video"
        text={`Il video "${label}" e' registrato ma non e' stato possibile riprodurlo (formato non valido, file danneggiato o URL non raggiungibile).`}
      />
    );
  }

  return (
    <View style={styles.wrapper}>
      <VideoPreviewButton onPress={() => setFullscreenVisible(true)} />
      <FullscreenVideoModal
        visible={isFullscreenVisible}
        source={source}
        onClose={() => setFullscreenVisible(false)}
        onPlaybackError={() => {
          setFullscreenVisible(false);
          setHasPlaybackError(true);
        }}
      />
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
});
