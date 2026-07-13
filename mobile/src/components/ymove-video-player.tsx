import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Play, RefreshCw, TriangleAlert } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { getYmoveExerciseDetail, type YmoveExerciseDetail } from '@/lib/ymove-service';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';

type YMoveVideoPlayerProps = {
  ymoveExerciseId: string;
};

// Video live dal catalogo YMove: NESSUN url viene mai salvato nel database
// (scadono, sono firmati) — richiesto ogni volta che questo componente viene
// montato (cioe' ogni volta che il video viene "aperto") e ri-richiedibile
// manualmente ("Riprova") se il player segnala un errore, tipicamente un URL
// scaduto. Fallback distinti per limite YMove raggiunto (429), account non
// autorizzato, esercizio non trovato, o nessun video disponibile.
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
      <StatusCard icon={<ActivityIndicator />} title="Caricamento video…" text="Richiesta in corso al catalogo YMove." />
    );
  }

  if (errorCode) {
    return <YMoveErrorCard code={errorCode} message={errorMessage} onRetry={retry} />;
  }

  if (!detail || (!detail.videoUrl && !detail.videoHlsUrl)) {
    return (
      <StatusCard title="Nessun video disponibile" text="YMove non ha ancora un video per questo esercizio." />
    );
  }

  return <LoadedYMoveVideo detail={detail} onError={retry} />;
}

function LoadedYMoveVideo({ detail, onError }: { detail: YmoveExerciseDetail; onError: () => void }) {
  const { colors } = useAppTheme();
  const source = detail.videoUrl ?? detail.videoHlsUrl ?? '';
  const player = useVideoPlayer(source, (p) => {
    p.loop = false;
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });

  if (status === 'error') {
    return (
      <YMoveErrorCard
        code="expired_url"
        message="Il link del video potrebbe essere scaduto o non piu' raggiungibile."
        onRetry={onError}
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
