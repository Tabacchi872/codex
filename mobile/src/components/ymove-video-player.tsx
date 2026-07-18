import { Play, RefreshCw, TriangleAlert } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { FullscreenVideoModal, VideoPreviewButton } from '@/components/fullscreen-video-modal';
import { getYmoveExerciseDetail, type YmoveExerciseDetail } from '@/lib/ymove-service';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';

type YMoveVideoPlayerProps = {
  ymoveExerciseId: string;
};

export function YMoveVideoPlayer({ ymoveExerciseId }: YMoveVideoPlayerProps) {
  const [detail, setDetail] = useState<YmoveExerciseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorCode(null);
    const result = await getYmoveExerciseDetail(ymoveExerciseId);
    if (result.ok) {
      setDetail(result.data);
    } else {
      setDetail(null);
      setErrorCode(result.code);
      setErrorMessage(result.message);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ymoveExerciseId, attempt]);

  useEffect(() => {
    load();
  }, [load]);

  function retry() {
    setAttempt((n) => n + 1);
  }

  if (loading) {
    return (
      <StatusCard icon={<ActivityIndicator />} title="Caricamento video..." text="Richiesta in corso al catalogo YMove." />
    );
  }

  if (errorCode) {
    return <YMoveErrorCard code={errorCode} message={errorMessage} onRetry={retry} />;
  }

  if (!detail || (!detail.videoUrl && !detail.videoHlsUrl)) {
    return <StatusCard title="Nessun video disponibile" text="YMove non ha ancora un video per questo esercizio." />;
  }

  return <LoadedYMoveVideo detail={detail} onError={retry} />;
}

function LoadedYMoveVideo({ detail, onError }: { detail: YmoveExerciseDetail; onError: () => void }) {
  const [isFullscreenVisible, setFullscreenVisible] = useState(false);
  const source = detail.videoUrl ?? detail.videoHlsUrl ?? '';

  return (
    <View style={styles.wrapper}>
      <VideoPreviewButton onPress={() => setFullscreenVisible(true)} />
      <FullscreenVideoModal
        visible={isFullscreenVisible}
        source={source}
        onClose={() => setFullscreenVisible(false)}
        onPlaybackError={() => {
          setFullscreenVisible(false);
          onError();
        }}
      />
    </View>
  );
}

function describeError(code: string, message: string): { title: string; text: string } {
  if (code === 'rate_limited') {
    return {
      title: 'Limite YMove raggiunto',
      text: "Il limite mensile di richieste video YMove e' stato raggiunto. Riprova piu' tardi.",
    };
  }
  if (code === 'forbidden') {
    return { title: 'Video non disponibile', text: "Questo video non e' disponibile per il tuo account." };
  }
  if (code === 'not_found') {
    return { title: 'Esercizio non trovato', text: "YMove non ha trovato questo esercizio." };
  }
  if (code === 'expired_url') {
    return { title: 'Link video scaduto', text: message };
  }
  return { title: 'Video non disponibile', text: message || "Si e' verificato un errore imprevisto." };
}

function YMoveErrorCard({ code, message, onRetry }: { code: string; message: string; onRetry: () => void }) {
  const { colors } = useAppTheme();
  const { title, text } = describeError(code, message);
  return (
    <View style={[styles.fallback, { backgroundColor: colors.surfaceSubtle }]}>
      <View style={[styles.fallbackIconWrap, { backgroundColor: colors.rustSoft }]}>
        <TriangleAlert size={22} color={colors.rust} />
      </View>
      <Text style={[styles.fallbackTitle, { color: colors.rust }]}>{title}</Text>
      <Text style={[styles.fallbackText, { color: colors.inkSoft }]}>{text}</Text>
      <Pressable onPress={onRetry} hitSlop={6} style={[styles.retryButton, { borderColor: colors.rust }]}>
        <RefreshCw size={14} color={colors.rust} />
        <Text style={[styles.retryLabel, { color: colors.rust }]}>Riprova</Text>
      </Pressable>
    </View>
  );
}

function StatusCard({ icon, title, text }: { icon?: ReactNode; title: string; text: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.fallback, { backgroundColor: colors.surfaceSubtle }]}>
      <View style={[styles.fallbackIconWrap, { backgroundColor: colors.mossSoft }]}>
        {icon ?? <Play size={22} color={colors.moss} />}
      </View>
      <Text style={[styles.fallbackTitle, { color: colors.ink }]}>{title}</Text>
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
  retryButton: {
    alignItems: 'center',
    borderRadius: AppRadius.pill,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: 6,
    marginTop: AppSpacing[1],
    paddingHorizontal: AppSpacing[3],
    paddingVertical: 6,
  },
  retryLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
});
