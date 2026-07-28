import { useRouter } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppBadge, AppButton, AppCard } from './ui';

import { getMyActiveProgramCycle, runCycleReview } from '@/lib/auto-program-service';
import { AppFontSize, AppSpacing, useAppTheme } from '@/theme';
import type { ActiveProgramCycle } from '@/types/client-fitness-profile';

type CardState = { loading: boolean; cycle: ActiveProgramCycle | null; error: string | null };

// Mostrata solo per clienti self_guided con un ciclo automatico esistente:
// nessuna card per chi ha un coach (a quel punto il ciclo automatico e'
// sempre 'replaced' dal trigger del sotto-blocco 2.4, quindi non e' piu'
// tra gli stati non terminali letti da getMyActiveProgramCycle — la card
// si nasconde da sola, coerente con "aggiornamento quando viene assegnato
// un coach"), nessuna card per chi non ha ancora completato il
// questionario (auth-gate.tsx lo sta gia' reindirizzando altrove).
//
// Il server non pone mai un ciclo in 'checkin_due' (nessuna funzione lo
// scrive: vedi docs/DECISIONS.md, stesso gap noto di effective_active_days)
// — il segnale reale e' 'active' con review_due_at gia' passato, stesso
// identico controllo di STEP 7 di run_cycle_review lato server: qui e'
// solo un derivato di sola lettura, mai una logica decisionale duplicata.
export function AutoProgramCard() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [state, setState] = useState<CardState>({ loading: true, cycle: null, error: null });
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  async function load() {
    const result = await getMyActiveProgramCycle();
    if (!result.ok) {
      setState({ loading: false, cycle: null, error: result.message });
      return;
    }
    setState({ loading: false, cycle: result.data, error: null });
  }

  useEffect(() => {
    let active = true;
    (async () => {
      let result = await getMyActiveProgramCycle();
      if (!active) return;
      if (!result.ok) {
        setState({ loading: false, cycle: null, error: result.message });
        return;
      }
      // Tentativo silenzioso di ripresa: se l'abbonamento e' stato rinnovato
      // nel frattempo, run_cycle_review lo rileva e riporta il ciclo ad
      // 'active' (result_code 'resumed'), altrimenti risponde comunque
      // bloccato e qui non cambia nulla. Nessuna logica decisionale
      // duplicata: solo una chiamata silenziosa alla stessa RPC autorevole
      // gia' usata dal bottone "Aggiorna", poi si rilegge lo stato reale.
      if (result.data?.status === 'paused_subscription') {
        const retry = await runCycleReview(result.data.id);
        if (!active) return;
        if (retry.ok) {
          result = await getMyActiveProgramCycle();
          if (!active) return;
          if (!result.ok) {
            setState({ loading: false, cycle: null, error: result.message });
            return;
          }
        }
      }
      setState({ loading: false, cycle: result.data, error: null });
    })();
    return () => {
      active = false;
    };
  }, []);

  if (state.loading || state.error || !state.cycle) return null;

  const { cycle } = state;
  const isCheckinDue =
    (cycle.status === 'active' || cycle.status === 'checkin_due') &&
    !!cycle.reviewDueAt &&
    new Date(cycle.reviewDueAt).getTime() <= Date.now();

  async function retryReview() {
    setRetrying(true);
    setRetryError(null);
    const result = await runCycleReview(cycle!.id);
    setRetrying(false);
    if (!result.ok) {
      setRetryError(result.message);
      return;
    }
    await load();
  }

  if (cycle.status === 'review_pending') {
    return (
      <AppCard style={styles.card}>
        <CardHeader title="Il tuo programma automatico" badgeLabel="In elaborazione" badgeTone="amber" colors={colors} />
        <Text style={[styles.body, { color: colors.inkSoft }]}>
          Il tuo check-in è stato ricevuto e la revisione del programma è in corso.
        </Text>
        {retryError ? <Text style={[styles.body, { color: colors.rust }]}>{retryError}</Text> : null}
        <AppButton label="Aggiorna" onPress={retryReview} loading={retrying} variant="secondary" />
      </AppCard>
    );
  }

  if (cycle.status === 'pending_safety_review') {
    return (
      <AppCard style={styles.card}>
        <CardHeader title="Il tuo programma automatico" badgeLabel="In revisione" badgeTone="amber" colors={colors} />
        <Text style={[styles.body, { color: colors.inkSoft }]}>
          Il nostro team sta rivedendo il tuo profilo prima di assegnarti (o confermarti) un programma: riceverai una notifica appena sarà pronto.
        </Text>
      </AppCard>
    );
  }

  if (cycle.status === 'pending_template') {
    return (
      <AppCard style={styles.card}>
        <CardHeader title="Il tuo programma automatico" badgeLabel="In revisione" badgeTone="amber" colors={colors} />
        <Text style={[styles.body, { color: colors.inkSoft }]}>
          Non abbiamo trovato un programma compatibile con le tue ultime indicazioni: il nostro team ti contatterà a breve per assegnartene uno su misura.
        </Text>
      </AppCard>
    );
  }

  if (cycle.status === 'pending_subscription' || cycle.status === 'paused_subscription') {
    return (
      <AppCard style={styles.card}>
        <CardHeader title="Il tuo programma automatico" badgeLabel="In pausa" badgeTone="amber" colors={colors} />
        <Text style={[styles.body, { color: colors.inkSoft }]}>
          Il tuo abbonamento non risulta attivo: riattivalo per riprendere il programma e ricevere la prossima revisione.
        </Text>
        <AppButton label="Vai all'abbonamento" onPress={() => router.push('/abbonamento-cliente')} variant="secondary" />
      </AppCard>
    );
  }

  if (isCheckinDue) {
    return (
      <AppCard style={styles.card}>
        <CardHeader title="Il tuo programma automatico" badgeLabel="Check-in disponibile" badgeTone="moss" colors={colors} />
        <Text style={[styles.programName, { color: colors.ink }]} numberOfLines={2}>
          {cycle.templateName ?? 'Programma personalizzato'}
        </Text>
        <Text style={[styles.body, { color: colors.inkSoft }]}>
          È il momento di raccontarci come è andato l'ultimo ciclo: pochi minuti per ricevere un programma aggiornato.
        </Text>
        <AppButton label="Compila il check-in" onPress={() => router.push({ pathname: '/check-in-periodico', params: { cycleId: cycle.id } })} fullWidth />
      </AppCard>
    );
  }

  // Stati non terminali non ancora osservabili in produzione ('draft') o
  // scaduti/annullati che teoricamente non dovrebbero comparire come
  // "ciclo corrente" (getMyActiveProgramCycle li esclude gia'): fallback
  // difensivo, mai un crash silenzioso.
  return (
    <AppCard style={styles.card}>
      <CardHeader title="Il tuo programma automatico" badgeLabel={`Ciclo ${cycle.cycleNumber}`} badgeTone="moss" colors={colors} />
      <Text style={[styles.programName, { color: colors.ink }]} numberOfLines={2}>
        {cycle.templateName ?? 'Programma personalizzato'}
      </Text>
      {cycle.decisionReason ? (
        <Text style={[styles.body, { color: colors.inkSoft }]} numberOfLines={3}>
          {cycle.decisionReason}
        </Text>
      ) : null}
      {cycle.reviewDueAt ? (
        <Text style={[styles.meta, { color: colors.inkSoft }]}>
          Prossima revisione prevista: {new Date(cycle.reviewDueAt).toLocaleDateString('it-IT')}.
        </Text>
      ) : null}
    </AppCard>
  );
}

function CardHeader({
  title,
  badgeLabel,
  badgeTone,
  colors,
}: {
  title: string;
  badgeLabel: string;
  badgeTone: 'amber' | 'moss';
  colors: ReturnType<typeof useAppTheme>['colors'];
}) {
  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <Sparkles size={18} color={colors.moss} />
        <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
      </View>
      <AppBadge label={badgeLabel} tone={badgeTone} />
    </View>
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
