import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Check, ChevronRight } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppCard, AppScreen, AppTextField } from '@/components/ui';
import { getCycleExerciseTransitionsSummary, runCycleReview, type CycleReviewOutcome, type ExerciseTransitionSummary } from '@/lib/auto-program-service';
import { getCurrentCycleExercises, submitMonthlyCheckin } from '@/lib/client-monthly-checkin-service';
import { useClientMonthlyCheckinStore } from '@/store/client-monthly-checkin-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import type { FitnessEquipmentLevel, FitnessLocation } from '@/types/client-fitness-profile';
import type { CurrentCycleExercise, MonthlyCheckinDraft, MonthlyCheckinPayload, PerceivedDifficulty } from '@/types/client-monthly-checkin';

const DIFFICULTY_OPTIONS: { value: PerceivedDifficulty; label: string; detail: string }[] = [
  { value: 'too_easy', label: 'Troppo facile', detail: 'Potrei fare di più' },
  { value: 'right', label: 'Giusta', detail: 'Il carico di lavoro mi sembra adatto' },
  { value: 'too_hard', label: 'Troppo impegnativa', detail: 'Ho fatto fatica a completare le sessioni' },
];

const LOCATION_OPTIONS: { value: FitnessLocation | 'unchanged'; label: string }[] = [
  { value: 'unchanged', label: 'Nessun cambiamento' },
  { value: 'gym', label: 'Palestra' },
  { value: 'home', label: 'Casa' },
];

const EQUIPMENT_OPTIONS: { value: FitnessEquipmentLevel | 'unchanged'; label: string }[] = [
  { value: 'unchanged', label: 'Nessun cambiamento' },
  { value: 'bodyweight_only', label: 'Solo corpo libero' },
  { value: 'home_basic', label: 'Attrezzatura di base' },
  { value: 'full_gym', label: 'Palestra completa' },
];

const PAIN_AREAS = ['Spalla', 'Gomito', 'Polso', 'Schiena bassa', 'Schiena alta', 'Anca', 'Ginocchio', 'Caviglia', 'Altro'];

const DECISION_LABELS: Record<string, { title: string; tone: 'positive' | 'neutral' | 'caution' }> = {
  progress: { title: 'Il tuo programma è progredito', tone: 'positive' },
  maintain: { title: 'Il tuo programma è confermato', tone: 'neutral' },
  regress: { title: 'Il tuo programma è stato semplificato', tone: 'caution' },
  partial_change: { title: 'Alcuni esercizi sono stati aggiornati', tone: 'neutral' },
  insufficient_data: { title: 'Dati insufficienti per una revisione completa', tone: 'caution' },
  blocked_safety: { title: 'In attesa di revisione per la sicurezza', tone: 'caution' },
  blocked_subscription: { title: 'Programma in pausa: abbonamento non attivo', tone: 'caution' },
  pending_template: { title: 'Nessun modello compatibile trovato', tone: 'caution' },
  manual_review: { title: 'Revisione manuale richiesta', tone: 'caution' },
};

const TOTAL_STEPS = 10;

type ScreenPhase = 'form' | 'submitting' | 'reviewing' | 'review_error' | 'result';

export default function CheckInPeriodicoScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const params = useLocalSearchParams<{ cycleId?: string }>();
  const cycleId = typeof params.cycleId === 'string' ? params.cycleId : '';

  const draft = useClientMonthlyCheckinStore((s) => (cycleId ? s.drafts[cycleId] : undefined));
  const upsertDraft = useClientMonthlyCheckinStore((s) => s.upsertDraft);
  const clearDraft = useClientMonthlyCheckinStore((s) => s.clearDraft);

  const [phase, setPhase] = useState<ScreenPhase>('form');
  const [error, setError] = useState<string | null>(null);
  const [reviewResult, setReviewResult] = useState<CycleReviewOutcome | null>(null);
  const [transitions, setTransitions] = useState<ExerciseTransitionSummary | null>(null);
  const [planExercises, setPlanExercises] = useState<{ loading: boolean; items: CurrentCycleExercise[] }>({ loading: true, items: [] });

  const currentDraft = useMemo<MonthlyCheckinDraft>(
    () =>
      draft ?? {
        cycleId,
        currentStep: 0,
        painAreas: [],
        dislikedExerciseIds: [],
        updatedAt: new Date().toISOString(),
      },
    [cycleId, draft],
  );

  useEffect(() => {
    if (!cycleId) return;
    let active = true;
    (async () => {
      const result = await getCurrentCycleExercises(cycleId);
      if (!active) return;
      setPlanExercises({ loading: false, items: result.ok ? result.data : [] });
    })();
    return () => {
      active = false;
    };
  }, [cycleId]);

  if (!cycleId) {
    return (
      <AppScreen>
        <Text style={{ color: colors.ink }}>Nessun ciclo indicato.</Text>
      </AppScreen>
    );
  }

  const step = currentDraft.currentStep;
  const valid = isStepValid(currentDraft, step);
  const canGoBack = step > 0 && phase === 'form';

  function patch(patchValue: Partial<Omit<MonthlyCheckinDraft, 'cycleId' | 'updatedAt'>>) {
    upsertDraft(cycleId, patchValue);
  }

  function goBack() {
    setError(null);
    if (step === 0) return;
    patch({ currentStep: step - 1 });
  }

  async function continueFlow() {
    if (!valid) return;

    if (step < TOTAL_STEPS - 1) {
      patch({ currentStep: step + 1 });
      return;
    }

    const payload = buildPayload(currentDraft);
    if (!payload) return;

    setError(null);
    setPhase('submitting');
    const saveResult = await submitMonthlyCheckin(payload, true);
    if (!saveResult.ok) {
      setPhase('form');
      setError(saveResult.message);
      return;
    }

    await startReview();
  }

  async function startReview() {
    setPhase('reviewing');
    const reviewOutcome = await runCycleReview(cycleId);
    if (!reviewOutcome.ok) {
      setPhase('review_error');
      setError(reviewOutcome.message);
      return;
    }

    setReviewResult(reviewOutcome.data);
    if (reviewOutcome.data.nextCycleId) {
      const summary = await getCycleExerciseTransitionsSummary(cycleId);
      if (summary.ok) setTransitions(summary.data);
    }
    clearDraft(cycleId);
    setPhase('result');
  }

  if (phase === 'submitting' || phase === 'reviewing') {
    return (
      <AppScreen contentStyle={styles.centerContent}>
        <ActivityIndicator size="large" color={colors.moss} />
        <Text style={[styles.processingText, { color: colors.ink }]}>
          {phase === 'submitting' ? 'Salvataggio del check-in in corso…' : 'Stiamo elaborando la revisione del tuo programma…'}
        </Text>
      </AppScreen>
    );
  }

  if (phase === 'review_error') {
    return (
      <AppScreen contentStyle={styles.centerContent}>
        <Text style={[styles.processingText, { color: colors.ink }]}>Il check-in è stato salvato, ma non siamo riusciti a completare la revisione.</Text>
        {error ? <Text style={[styles.errorText, { color: colors.rust }]}>{error}</Text> : null}
        <AppButton label="Riprova" onPress={startReview} size="lg" />
        <AppButton label="Torna alla home" variant="ghost" onPress={() => router.replace('/cliente-home')} />
      </AppScreen>
    );
  }

  if (phase === 'result' && reviewResult) {
    const meta = DECISION_LABELS[reviewResult.decision] ?? { title: 'Programma aggiornato', tone: 'neutral' as const };
    return (
      <AppScreen contentStyle={styles.content}>
        <View style={styles.step}>
          <Text style={[styles.title, { color: colors.ink }]}>{meta.title}</Text>
          {reviewResult.decisionReason ? <Text style={[styles.subtitle, { color: colors.inkSoft }]}>{reviewResult.decisionReason}</Text> : null}

          {transitions ? (
            <AppCard style={styles.transitionsCard}>
              <Text style={[styles.summaryLabel, { color: colors.inkSoft }]}>Confronto con il ciclo precedente</Text>
              <TransitionRow label="Esercizi mantenuti" value={transitions.kept} colors={colors} />
              <TransitionRow label="Esercizi sostituiti" value={transitions.replaced} colors={colors} />
              <TransitionRow label="Esercizi progrediti" value={transitions.progressed} colors={colors} />
              <TransitionRow label="Esercizi alleggeriti" value={transitions.regressed} colors={colors} />
            </AppCard>
          ) : null}

          <AppButton label="Torna alla home" onPress={() => router.replace('/cliente-home')} size="lg" fullWidth />
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen
      bottomTabInset={false}
      keyboardAvoiding
      contentStyle={styles.content}
      footer={
        <View style={[styles.footer, { backgroundColor: colors.background }]}>
          {error ? <Text style={[styles.errorText, { color: colors.rust }]}>{error}</Text> : null}
          <AppButton
            label={step === TOTAL_STEPS - 1 ? 'Invia il check-in' : 'Continua'}
            onPress={continueFlow}
            disabled={!valid}
            fullWidth
            size="lg"
          />
        </View>
      }>
      <View style={styles.topBar}>
        {canGoBack ? (
          <Pressable onPress={goBack} hitSlop={8} accessibilityRole="button" accessibilityLabel="Torna indietro" style={styles.backButton}>
            <ArrowLeft size={22} color={colors.ink} />
          </Pressable>
        ) : (
          <View style={styles.backButton} />
        )}
        <View style={[styles.progressTrack, { backgroundColor: colors.surfaceSubtle }]}>
          <View style={[styles.progressFill, { backgroundColor: colors.moss, width: `${((step + 1) / TOTAL_STEPS) * 100}%` }]} />
        </View>
        <Text style={[styles.progressText, { color: colors.inkSoft }]}>{step + 1}/{TOTAL_STEPS}</Text>
      </View>

      <StepContent step={step} draft={currentDraft} planExercises={planExercises.items} onPatch={patch} />
    </AppScreen>
  );
}

function TransitionRow({ label, value, colors }: { label: string; value: number; colors: ReturnType<typeof useAppTheme>['colors'] }) {
  if (value === 0) return null;
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryValueLabel, { color: colors.inkSoft }]}>{label}</Text>
      <Text style={[styles.summaryValueNumber, { color: colors.ink }]}>{value}</Text>
    </View>
  );
}

function StepContent({
  step,
  draft,
  planExercises,
  onPatch,
}: {
  step: number;
  draft: MonthlyCheckinDraft;
  planExercises: CurrentCycleExercise[];
  onPatch: (patch: Partial<Omit<MonthlyCheckinDraft, 'cycleId' | 'updatedAt'>>) => void;
}) {
  if (step === 0) {
    return (
      <StepShell title="Come è andato l'ultimo ciclo?" subtitle="La difficoltà percepita delle tue sessioni.">
        {DIFFICULTY_OPTIONS.map((option) => (
          <ChoiceCard
            key={option.value}
            title={option.label}
            detail={option.detail}
            selected={draft.perceivedDifficulty === option.value}
            onPress={() => onPatch({ perceivedDifficulty: option.value })}
          />
        ))}
      </StepShell>
    );
  }
  if (step === 1) {
    return (
      <StepShell title="Quante sessioni pensi di aver completato?" subtitle="Facoltativo: una stima approssimativa va bene.">
        <AppTextField
          keyboardType="number-pad"
          value={draft.sessionsCompletedEstimate ? String(draft.sessionsCompletedEstimate) : ''}
          onChangeText={(value) => {
            const parsed = Number(value.replace(/[^0-9]/g, ''));
            onPatch({ sessionsCompletedEstimate: Number.isFinite(parsed) && parsed > 0 ? parsed : undefined });
          }}
          placeholder="Es. 10"
          maxLength={2}
        />
      </StepShell>
    );
  }
  if (step === 2) {
    return (
      <StepShell title="Hai avvertito dolori o fastidi durante questo ciclo?">
        <ChoiceCard title="Sì" selected={draft.hasPainOrLimitation === true} onPress={() => onPatch({ hasPainOrLimitation: true })} />
        <ChoiceCard title="No" selected={draft.hasPainOrLimitation === false} onPress={() => onPatch({ hasPainOrLimitation: false, painAreas: [], painNotes: undefined })} />
        {draft.hasPainOrLimitation ? (
          <View style={styles.painBlock}>
            <ChipGrid
              items={PAIN_AREAS}
              selected={draft.painAreas}
              onToggle={(value) => {
                const next = draft.painAreas.includes(value) ? draft.painAreas.filter((item) => item !== value) : [...draft.painAreas, value];
                onPatch({ painAreas: next });
              }}
            />
            <AppTextField
              value={draft.painNotes ?? ''}
              onChangeText={(value) => onPatch({ painNotes: value })}
              placeholder="Descrivi brevemente"
              multiline
              style={styles.notesInput}
            />
          </View>
        ) : null}
      </StepShell>
    );
  }
  if (step === 3) {
    return (
      <StepShell title="Hai bisogno del parere di un professionista prima di continuare?" subtitle="Se rispondi sì, il tuo programma resterà invariato finché il nostro team non lo avrà rivisto.">
        <ChoiceCard title="Sì" selected={draft.requiresProfessionalSupervision === true} onPress={() => onPatch({ requiresProfessionalSupervision: true })} />
        <ChoiceCard title="No" selected={draft.requiresProfessionalSupervision === false} onPress={() => onPatch({ requiresProfessionalSupervision: false })} />
      </StepShell>
    );
  }
  if (step === 4) {
    return (
      <StepShell title="Vuoi continuare con questo tipo di programma?">
        <ChoiceCard title="Sì" selected={draft.wantsToContinue === true} onPress={() => onPatch({ wantsToContinue: true })} />
        <ChoiceCard title="No, preferirei qualcosa di diverso" selected={draft.wantsToContinue === false} onPress={() => onPatch({ wantsToContinue: false })} />
      </StepShell>
    );
  }
  if (step === 5) {
    return (
      <StepShell title="È cambiato il luogo in cui ti alleni?" subtitle="Facoltativo.">
        {LOCATION_OPTIONS.map((option) => (
          <ChoiceCard
            key={option.value}
            title={option.label}
            selected={(draft.location ?? 'unchanged') === option.value}
            onPress={() => onPatch({ location: option.value === 'unchanged' ? undefined : option.value })}
          />
        ))}
      </StepShell>
    );
  }
  if (step === 6) {
    return (
      <StepShell title="È cambiata l'attrezzatura a tua disposizione?" subtitle="Facoltativo.">
        {EQUIPMENT_OPTIONS.map((option) => (
          <ChoiceCard
            key={option.value}
            title={option.label}
            selected={(draft.equipmentLevel ?? 'unchanged') === option.value}
            onPress={() => onPatch({ equipmentLevel: option.value === 'unchanged' ? undefined : option.value })}
          />
        ))}
      </StepShell>
    );
  }
  if (step === 7) {
    return (
      <StepShell title="C'è qualche esercizio del tuo programma attuale che preferisci evitare?" subtitle="Facoltativo: puoi selezionarne più di uno, o nessuno.">
        {planExercises.length === 0 ? (
          <Text style={{ color: '#8a8a8a' }}>Nessun esercizio trovato nel ciclo corrente.</Text>
        ) : (
          <ChipGrid
            items={planExercises.map((item) => item.name)}
            selected={planExercises.filter((item) => draft.dislikedExerciseIds.includes(item.exerciseId)).map((item) => item.name)}
            onToggle={(label) => {
              const match = planExercises.find((item) => item.name === label);
              if (!match) return;
              const next = draft.dislikedExerciseIds.includes(match.exerciseId)
                ? draft.dislikedExerciseIds.filter((id) => id !== match.exerciseId)
                : [...draft.dislikedExerciseIds, match.exerciseId];
              onPatch({ dislikedExerciseIds: next });
            }}
          />
        )}
      </StepShell>
    );
  }
  if (step === 8) {
    return (
      <StepShell title="Vuoi aggiungere una nota per il tuo prossimo ciclo?" subtitle="Facoltativo.">
        <AppTextField
          value={draft.notes ?? ''}
          onChangeText={(value) => onPatch({ notes: value })}
          placeholder="Scrivi qui eventuali note"
          multiline
          style={styles.notesInput}
        />
      </StepShell>
    );
  }
  return <SummaryStep draft={draft} planExercises={planExercises} />;
}

function SummaryStep({ draft, planExercises }: { draft: MonthlyCheckinDraft; planExercises: CurrentCycleExercise[] }) {
  const { colors } = useAppTheme();
  const dislikedNames = planExercises.filter((item) => draft.dislikedExerciseIds.includes(item.exerciseId)).map((item) => item.name);
  return (
    <StepShell title="Controlla le tue risposte" subtitle="Prima di inviare il check-in.">
      <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SummaryRow label="Difficoltà percepita" value={DIFFICULTY_OPTIONS.find((o) => o.value === draft.perceivedDifficulty)?.label ?? '-'} />
        <SummaryRow label="Sessioni stimate" value={draft.sessionsCompletedEstimate ? String(draft.sessionsCompletedEstimate) : 'Non indicato'} />
        <SummaryRow label="Dolori/fastidi" value={draft.hasPainOrLimitation ? draft.painAreas.join(', ') || 'Segnalati' : 'Nessuno'} />
        <SummaryRow label="Parere professionista" value={draft.requiresProfessionalSupervision ? 'Richiesto' : 'Non richiesto'} />
        <SummaryRow label="Continuare il programma" value={draft.wantsToContinue ? 'Sì' : 'No'} />
        <SummaryRow label="Esercizi da evitare" value={dislikedNames.length > 0 ? dislikedNames.join(', ') : 'Nessuno'} />
      </View>
    </StepShell>
  );
}

function StepShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.step}>
      <View style={styles.titleBlock}>
        <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: colors.inkSoft }]}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function ChoiceCard({ title, detail, selected, onPress }: { title: string; detail?: string; selected?: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${title}. ${detail}` : title}
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [
        styles.choiceCard,
        { backgroundColor: colors.surface, borderColor: selected ? colors.moss : colors.border, opacity: pressed ? 0.9 : 1 },
      ]}>
      <View style={styles.choiceCopy}>
        <Text style={[styles.choiceTitle, { color: colors.ink }]}>{title}</Text>
        {detail ? <Text style={[styles.choiceDetail, { color: colors.inkSoft }]}>{detail}</Text> : null}
      </View>
      {selected ? <Check size={20} color={colors.moss} /> : <ChevronRight size={20} color={colors.inkFaint} />}
    </Pressable>
  );
}

function ChipGrid({ items, selected, onToggle }: { items: string[]; selected: string[]; onToggle: (value: string) => void }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.chips}>
      {items.map((item) => {
        const active = selected.includes(item);
        return (
          <Pressable
            key={item}
            onPress={() => onToggle(item)}
            accessibilityRole="button"
            accessibilityLabel={item}
            accessibilityState={{ selected: active }}
            style={[styles.chip, { backgroundColor: active ? colors.moss : colors.surface, borderColor: active ? colors.moss : colors.border }]}>
            <Text style={[styles.chipText, { color: active ? colors.onMoss : colors.ink }]}>{item}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, { color: colors.inkSoft }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color: colors.ink }]}>{value}</Text>
    </View>
  );
}

function isStepValid(draft: MonthlyCheckinDraft, step: number) {
  switch (step) {
    case 0:
      return !!draft.perceivedDifficulty;
    case 1:
      return true;
    case 2:
      return typeof draft.hasPainOrLimitation === 'boolean';
    case 3:
      return typeof draft.requiresProfessionalSupervision === 'boolean';
    case 4:
      return typeof draft.wantsToContinue === 'boolean';
    case 5:
    case 6:
    case 7:
    case 8:
      return true;
    case 9:
      return !!buildPayload(draft);
    default:
      return false;
  }
}

function buildPayload(draft: MonthlyCheckinDraft): MonthlyCheckinPayload | null {
  if (
    !draft.perceivedDifficulty ||
    typeof draft.hasPainOrLimitation !== 'boolean' ||
    typeof draft.requiresProfessionalSupervision !== 'boolean' ||
    typeof draft.wantsToContinue !== 'boolean'
  ) {
    return null;
  }
  return {
    cycleId: draft.cycleId,
    perceivedDifficulty: draft.perceivedDifficulty,
    sessionsCompletedEstimate: draft.sessionsCompletedEstimate,
    hasPainOrLimitation: draft.hasPainOrLimitation,
    painAreas: draft.painAreas,
    painNotes: draft.painNotes,
    requiresProfessionalSupervision: draft.requiresProfessionalSupervision,
    wantsToContinue: draft.wantsToContinue,
    availableMinutes: draft.availableMinutes,
    availableDaysPerWeek: draft.availableDaysPerWeek,
    location: draft.location,
    equipmentLevel: draft.equipmentLevel,
    goalChangedTo: draft.goalChangedTo,
    dislikedExerciseIds: draft.dislikedExerciseIds,
    notes: draft.notes,
  };
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingBottom: 132,
  },
  centerContent: {
    alignItems: 'center',
    flexGrow: 1,
    gap: AppSpacing[4],
    justifyContent: 'center',
    paddingHorizontal: AppSpacing[5],
  },
  processingText: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
    textAlign: 'center',
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[3],
  },
  backButton: {
    alignItems: 'center',
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  progressTrack: {
    borderRadius: AppRadius.pill,
    flex: 1,
    height: 7,
    overflow: 'hidden',
  },
  progressFill: {
    borderRadius: AppRadius.pill,
    height: '100%',
  },
  progressText: {
    fontSize: AppFontSize.xs,
    fontWeight: '800',
  },
  step: {
    gap: AppSpacing[3],
  },
  titleBlock: {
    gap: AppSpacing[2],
    marginBottom: AppSpacing[1],
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
  },
  subtitle: {
    fontSize: AppFontSize.base,
    fontWeight: '600',
    lineHeight: 22,
  },
  choiceCard: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: AppSpacing[3],
    minHeight: 76,
    padding: AppSpacing[4],
  },
  choiceCopy: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  choiceTitle: {
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 22,
  },
  choiceDetail: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
    lineHeight: 19,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  chip: {
    borderRadius: AppRadius.pill,
    borderWidth: 1,
    paddingHorizontal: AppSpacing[3],
    paddingVertical: 10,
  },
  chipText: {
    fontSize: AppFontSize.sm,
    fontWeight: '800',
  },
  painBlock: {
    gap: AppSpacing[3],
  },
  notesInput: {
    minHeight: 90,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  summaryCard: {
    borderRadius: 24,
    borderWidth: 1,
    gap: AppSpacing[2],
    padding: AppSpacing[4],
  },
  transitionsCard: {
    gap: AppSpacing[2],
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 3,
    justifyContent: 'space-between',
  },
  summaryLabel: {
    fontSize: AppFontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
    lineHeight: 19,
  },
  summaryValueLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  summaryValueNumber: {
    fontSize: AppFontSize.sm,
    fontWeight: '900',
  },
  footer: {
    gap: AppSpacing[2],
    paddingTop: AppSpacing[2],
  },
  errorText: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
    textAlign: 'center',
  },
});
