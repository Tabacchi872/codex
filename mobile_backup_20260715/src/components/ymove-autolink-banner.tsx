import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppCard } from './ui/app-card';

import { useYmoveAutoLinkStore } from '@/store/ymove-autolink-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';

const AUTO_DISMISS_MS = 6000;

// Banner non bloccante (2026-07-13) mostrato nella dashboard coach mentre
// ymove-auto-link-service.ts collega automaticamente i video YMove agli
// esercizi storici/custom. Non impedisce l'uso del resto della dashboard
// (nessun overlay/modale): solo una card informativa in cima, che sparisce
// da sola pochi secondi dopo il completamento o puo' essere chiusa subito.
export function YmoveAutoLinkBanner() {
  const state = useYmoveAutoLinkStore((s) => s.state);
  const dismiss = useYmoveAutoLinkStore((s) => s.dismiss);
  const { colors } = useAppTheme();

  useEffect(() => {
    if (state.status !== 'done') return;
    const timer = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [state.status, dismiss]);

  if (state.status === 'idle') return null;

  return (
    <AppCard style={styles.card}>
      {state.status === 'running' ? (
        <View style={styles.row}>
          <ActivityIndicator size="small" color={colors.moss} />
          <Text style={[styles.label, { color: colors.ink }]}>
            Associazione automatica video: {state.processed}/{state.total}
          </Text>
        </View>
      ) : (
        <View style={styles.row}>
          <Text style={[styles.label, styles.summaryLabel, { color: colors.ink }]}>
            Video associati: {state.summary.linked} · Non trovati: {state.summary.notFound} · Ambigui: {state.summary.ambiguous}
            {state.summary.duplicate > 0 ? ` · Duplicati: ${state.summary.duplicate}` : ''}
          </Text>
          <Pressable onPress={dismiss} hitSlop={8} accessibilityLabel="Chiudi">
            <Text style={[styles.dismiss, { color: colors.inkSoft }]}>✕</Text>
          </Pressable>
        </View>
      )}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: AppSpacing[2],
    paddingHorizontal: AppSpacing[3],
    marginBottom: AppSpacing[2],
    borderRadius: AppRadius.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: AppSpacing[2],
  },
  label: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
    flexShrink: 1,
  },
  summaryLabel: {
    flex: 1,
  },
  dismiss: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
});
