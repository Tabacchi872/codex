import { CheckCircle2, Play, Square } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton, AppCard } from '@/components/ui';
import { AppFontSize, AppSpacing, useAppTheme } from '@/theme';

function formatDuration(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function WorkoutSessionControls({
  startedAt,
  isCompleted,
  savedDurationSeconds,
  onStart,
  onFinish,
}: {
  startedAt: string | null | undefined;
  isCompleted: boolean;
  savedDurationSeconds: number | undefined;
  onStart: () => void;
  onFinish: (durationSeconds: number) => void;
}) {
  const { colors } = useAppTheme();
  const [elapsed, setElapsed] = useState(() => (startedAt ? Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)) : 0));

  useEffect(() => {
    if (!startedAt) return undefined;
    const startMs = new Date(startedAt).getTime();
    setElapsed(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    const interval = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  if (isCompleted) {
    return (
      <AppCard style={styles.completedCard}>
        <View style={[styles.statusIcon, { backgroundColor: colors.mossSoft }]}>
          <CheckCircle2 size={24} color={colors.moss} />
        </View>
        <View style={styles.completedCopy}>
          <Text style={[styles.completedTitle, { color: colors.ink }]}>Allenamento completato</Text>
          {savedDurationSeconds !== undefined ? (
            <Text style={[styles.caption, { color: colors.inkSoft }]}>Durata registrata: {formatDuration(savedDurationSeconds)}</Text>
          ) : null}
        </View>
      </AppCard>
    );
  }

  if (!startedAt) {
    return <AppButton label="Inizia allenamento" onPress={onStart} icon={<Play size={18} color={colors.onMoss} fill={colors.onMoss} />} size="lg" fullWidth />;
  }

  return (
    <AppCard style={styles.runningCard}>
      <View style={styles.runningHeader}>
        <View>
          <Text style={[styles.runningTitle, { color: colors.ink }]}>Allenamento in corso</Text>
          <Text style={[styles.caption, { color: colors.moss }]}>Sessione attiva</Text>
        </View>
        <View style={[styles.liveDot, { backgroundColor: colors.moss }]} />
      </View>
      <Text style={[styles.timer, { color: colors.ink }]}>{formatDuration(elapsed)}</Text>
      <AppButton
        label="Completa allenamento"
        onPress={() => onFinish(elapsed)}
        icon={<Square size={16} color={colors.onMoss} fill={colors.onMoss} />}
        size="lg"
        fullWidth
      />
    </AppCard>
  );
}

const styles = StyleSheet.create({
  completedCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[3],
  },
  statusIcon: {
    alignItems: 'center',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  completedCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  completedTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  caption: {
    fontSize: AppFontSize.sm,
    fontWeight: '500',
  },
  runningCard: {
    alignItems: 'stretch',
    gap: AppSpacing[3],
  },
  runningHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  runningTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  liveDot: {
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  timer: {
    fontSize: 44,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    letterSpacing: -1,
    lineHeight: 50,
    textAlign: 'center',
  },
});
