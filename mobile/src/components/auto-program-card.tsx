import { Sparkles } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppBadge, AppCard } from './ui';

import { getMyActiveProgramCycle } from '@/lib/auto-program-service';
import { AppFontSize, AppSpacing, useAppTheme } from '@/theme';
import type { ActiveProgramCycle } from '@/types/client-fitness-profile';

// Mostrata solo per clienti self_guided con un ciclo automatico esistente
// (attivo o in attesa di revisione Superadmin): nessuna card per chi ha un
// coach, nessuna card per chi non ha ancora completato il questionario
// (in quel caso auth-gate.tsx lo sta gia' reindirizzando altrove). Dati
// minimi per il Blocco 1: nessun indicatore di andamento/prossima revisione
// puntuale (dati non ancora raccolti in questo blocco).
export function AutoProgramCard() {
  const { colors } = useAppTheme();
  const [state, setState] = useState<{ loading: boolean; cycle: ActiveProgramCycle | null; error: string | null }>({
    loading: true,
    cycle: null,
    error: null,
  });

  useEffect(() => {
    let active = true;
    (async () => {
      const result = await getMyActiveProgramCycle();
      if (!active) return;
      if (!result.ok) {
        setState({ loading: false, cycle: null, error: result.message });
        return;
      }
      setState({ loading: false, cycle: result.data, error: null });
    })();
    return () => {
      active = false;
    };
  }, []);

  if (state.loading || state.error || !state.cycle) return null;

  const { cycle } = state;
  const isPendingReview = cycle.status === 'pending_review';

  return (
    <AppCard style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Sparkles size={18} color={colors.moss} />
          <Text style={[styles.title, { color: colors.ink }]}>Il tuo programma automatico</Text>
        </View>
        <AppBadge label={isPendingReview ? 'In revisione' : `Ciclo ${cycle.cycleNumber}`} tone={isPendingReview ? 'amber' : 'moss'} />
      </View>

      {isPendingReview ? (
        <Text style={[styles.body, { color: colors.inkSoft }]}>
          Il nostro team sta rivedendo il tuo questionario prima di assegnarti un programma: riceverai una notifica appena sarà pronto.
        </Text>
      ) : (
        <>
          <Text style={[styles.programName, { color: colors.ink }]} numberOfLines={2}>
            {cycle.templateName ?? 'Programma personalizzato'}
          </Text>
          {cycle.decisionReason ? (
            <Text style={[styles.body, { color: colors.inkSoft }]} numberOfLines={3}>
              {cycle.decisionReason}
            </Text>
          ) : null}
          <Text style={[styles.meta, { color: colors.inkSoft }]}>
            Il ciclo dura 4 settimane; la prossima revisione verrà calcolata al tuo prossimo accesso.
          </Text>
        </>
      )}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: AppSpacing[2],
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[2],
    justifyContent: 'space-between',
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[2],
    minWidth: 0,
  },
  title: {
    fontSize: AppFontSize.base,
    fontWeight: '800',
  },
  programName: {
    fontSize: AppFontSize.base + 2,
    fontWeight: '800',
    lineHeight: 21,
  },
  body: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
    lineHeight: 19,
  },
  meta: {
    fontSize: AppFontSize.xs,
    fontWeight: '600',
    lineHeight: 16,
  },
});
