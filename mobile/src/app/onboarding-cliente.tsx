import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ArrowLeft, Check, ChevronRight, Minus, Plus } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppButton, AppScreen } from '@/components/ui';
import { loadClientProfile } from '@/lib/auth-service';
import {
  calculateBmi,
  completeCoachGuidedOnboarding,
  createPendingClientOnboarding,
  getBmiCategory,
  saveSelfGuidedOnboarding,
} from '@/lib/client-onboarding-service';
import { normalizeCoachCode } from '@/lib/coach-code';
import { useAuthStore } from '@/store/auth-store';
import { useClientOnboardingStore } from '@/store/client-onboarding-store';
import { useClientStore } from '@/store/client-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import type {
  BmiCategory,
  ClientOnboardingExperience,
  ClientOnboardingGender,
  ClientOnboardingMode,
  SelfGuidedOnboardingPayload,
} from '@/types/client-onboarding';

const MUSCLE_REFERENCE = require('../../assets/muscles/anatomy-fitness-lines.png');

const GENDER_OPTIONS: { value: ClientOnboardingGender; label: string; detail: string }[] = [
  { value: 'male', label: 'Uomo', detail: 'Profilo maschile' },
  { value: 'female', label: 'Donna', detail: 'Profilo femminile' },
  { value: 'unspecified', label: 'Preferisco non specificarlo', detail: 'Continua senza indicarlo' },
];

const GOALS = [
  'Costruire muscoli',
  'Diventare più forte',
  'Perdere peso',
  'Migliorare i fondamentali',
  'Migliorare il condizionamento',
  'Preparazione sportiva',
];

const FOCUS_AREAS = ['Schiena', 'Braccia', 'Spalle', 'Addominali', 'Petto', 'Gambe', 'Glutei', 'Tutto il corpo'];

const TRAINING_REASONS = [
  'Per tracciare i miei progressi nel tempo',
  'Per restare motivato e costante',
  'Per avere una struttura chiara per i miei allenamenti',
  'Per raggiungere obiettivi di fitness specifici',
  'Per capire meglio recupero e riposo',
  'Altro',
];

const EXPERIENCE_OPTIONS: { value: ClientOnboardingExperience; label: string }[] = [
  { value: 'beginner', label: 'Sono nuovo all’allenamento di forza' },
  { value: 'novice', label: 'Mi alleno da qualche mese' },
  { value: 'intermediate', label: 'Mi alleno da circa un anno' },
  { value: 'advanced', label: 'Mi alleno da diversi anni' },
  { value: 'competitive', label: 'Partecipo a competizioni' },
];

const DAYS = [
  { value: 1, label: '1 giorno', detail: 'Essenziale' },
  { value: 2, label: '2 giorni', detail: 'Buona partenza' },
  { value: 3, label: '3 giorni', detail: 'Consigliato' },
  { value: 4, label: '4 giorni', detail: 'Strutturato' },
  { value: 5, label: '5 giorni', detail: 'Impegnativo' },
  { value: 6, label: '6 giorni', detail: 'Avanzato' },
  { value: 7, label: '7 giorni', detail: 'Richiede programmazione specifica' },
];

export default function ClientOnboardingScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const clientId = useAuthStore((s) => s.currentClientId);
  const currentUserEmail = useAuthStore((s) => s.currentUserEmail);
  const draft = useClientOnboardingStore((s) => (clientId ? s.drafts[clientId] : undefined));
  const upsertDraft = useClientOnboardingStore((s) => s.upsertDraft);
  const clearDraft = useClientOnboardingStore((s) => s.clearDraft);
  const markOnboardingCompleted = useClientOnboardingStore((s) => s.markCompleted);
  const updateClient = useClientStore((s) => s.updateClient);
  const clients = useClientStore((s) => s.clients);
  const client = clients.find((item) => item.id === clientId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>('kg');
  const [heightUnit, setHeightUnit] = useState<'cm' | 'ft'>('cm');

  const currentDraft = useMemo(
    () =>
      draft ?? {
        clientId: clientId ?? '',
        currentStep: 0,
        goals: [],
        focusAreas: [],
        trainingReasons: [],
        updatedAt: new Date().toISOString(),
      },
    [clientId, draft],
  );
  const mode = currentDraft.mode;
  const step = currentDraft.currentStep;
  const totalSteps = mode === 'self_guided' ? 10 : mode === 'coach_guided' ? 2 : 1;
  const progressIndex = mode === 'self_guided' ? step + 1 : mode === 'coach_guided' ? Math.min(step + 1, 2) : 1;
  const weightKg = currentDraft.weightKg ?? 75;
  const heightCm = currentDraft.heightCm ?? 175;
  const bmi = calculateBmi(weightKg, heightCm);
  const bmiCategory = getBmiCategory(bmi);
  const valid = isStepValid(currentDraft);
  const canGoBack = !!mode && step > 0;

  useEffect(() => {
    if (!clientId || mode !== 'self_guided') return;
    if (step === 7 && currentDraft.weightKg == null) {
      upsertDraft(clientId, { weightKg: 75 });
    }
    if (step === 8 && currentDraft.heightCm == null) {
      upsertDraft(clientId, { heightCm: 175 });
    }
  }, [clientId, currentDraft.heightCm, currentDraft.weightKg, mode, step, upsertDraft]);

  function patch(patchValue: Parameters<typeof upsertDraft>[1]) {
    if (!clientId) return;
    upsertDraft(clientId, patchValue);
  }

  async function selectMode(nextMode: ClientOnboardingMode) {
    if (!clientId) return;
    setError(null);
    patch({ mode: nextMode, currentStep: nextMode === 'coach_guided' ? 1 : 1 });
    await createPendingClientOnboarding(clientId);
  }

  function goBack() {
    setError(null);
    if (!mode || step === 0) {
      return;
    }
    if (step === 1) {
      patch({ mode: undefined, currentStep: 0 });
      return;
    }
    patch({ currentStep: step - 1 });
  }

  async function continueFlow() {
    if (!clientId || !valid || submitting) return;
    setError(null);

    if (mode === 'coach_guided') {
      setSubmitting(true);
      const result = await completeCoachGuidedOnboarding(currentDraft.coachCode ?? '');
      setSubmitting(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const profileResult = await loadClientProfile(clientId, client?.email ?? currentUserEmail ?? '');
      if (profileResult.ok) {
        updateClient(profileResult.data.client);
      } else if (__DEV__) {
        console.warn('CLIENT_ONBOARDING_PROFILE_REFRESH_ERROR', profileResult.message);
      }
      markOnboardingCompleted(clientId);
      clearDraft(clientId);
      router.replace(result.data.linked ? '/cliente-home' : '/collega-coach');
      return;
    }

    if (mode !== 'self_guided') return;

    if (step < 9) {
      patch({
        currentStep: step + 1,
        ...(step === 6 && currentDraft.weightKg == null ? { weightKg: 75 } : {}),
        ...(step === 7 && currentDraft.heightCm == null ? { heightCm: 175 } : {}),
      });
      return;
    }

    const payload = buildPayload(currentDraft, bmi, bmiCategory);
    if (!payload) return;

    setSubmitting(true);
    const result = await saveSelfGuidedOnboarding(payload);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (client) {
      updateClient({ ...client, goal: payload.goals.join(', ') });
    }
    markOnboardingCompleted(clientId);
    clearDraft(clientId);
    router.replace('/cliente-home');
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
            label={mode === 'self_guided' && step === 9 ? 'Conferma e inizia il mio percorso' : 'Continua'}
            onPress={continueFlow}
            disabled={!valid || submitting}
            loading={submitting}
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
          <View style={[styles.progressFill, { backgroundColor: colors.moss, width: `${(progressIndex / totalSteps) * 100}%` }]} />
        </View>
        <Text style={[styles.progressText, { color: colors.inkSoft }]}>{progressIndex}/{totalSteps}</Text>
      </View>

      {!mode ? (
        <IntroStep onSelect={selectMode} />
      ) : mode === 'coach_guided' ? (
        <CoachCodeStep value={currentDraft.coachCode ?? ''} onChange={(value) => patch({ coachCode: normalizeCoachCode(value) })} />
      ) : (
        <SelfGuidedStep
          step={step}
          draft={currentDraft}
          weightUnit={weightUnit}
          heightUnit={heightUnit}
          bmi={bmi}
          bmiCategory={bmiCategory}
          onPatch={patch}
          onWeightUnitChange={setWeightUnit}
          onHeightUnitChange={setHeightUnit}
        />
      )}
    </AppScreen>
  );
}

function IntroStep({ onSelect }: { onSelect: (mode: ClientOnboardingMode) => void }) {
  return (
    <StepShell title="Come vuoi iniziare?">
      <ChoiceCard
        title="Ho un coach"
        detail="Inserisci il codice del tuo coach per collegarti e iniziare."
        onPress={() => onSelect('coach_guided')}
      />
      <ChoiceCard
        title="Mi alleno da solo"
        detail="Rispondi a poche domande e prepareremo il tuo percorso."
        onPress={() => onSelect('self_guided')}
      />
    </StepShell>
  );
}

function CoachCodeStep({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { colors } = useAppTheme();
  return (
    <StepShell title="Codice coach" subtitle="Puoi inserirlo anche successivamente.">
      <View style={[styles.inputCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="FC-XXXX-XXXX"
          placeholderTextColor={colors.inkFaint}
          autoCapitalize="characters"
          style={[styles.codeInput, { color: colors.ink }]}
          accessibilityLabel="Codice coach"
        />
      </View>
    </StepShell>
  );
}

function SelfGuidedStep({
  step,
  draft,
  weightUnit,
  heightUnit,
  bmi,
  bmiCategory,
  onPatch,
  onWeightUnitChange,
  onHeightUnitChange,
}: {
  step: number;
  draft: ReturnType<typeof useClientOnboardingStore.getState>['drafts'][string];
  weightUnit: 'kg' | 'lb';
  heightUnit: 'cm' | 'ft';
  bmi: number;
  bmiCategory: BmiCategory;
  onPatch: (patch: Partial<typeof draft>) => void;
  onWeightUnitChange: (unit: 'kg' | 'lb') => void;
  onHeightUnitChange: (unit: 'cm' | 'ft') => void;
}) {
  if (step === 1) {
    return (
      <StepShell title="Qual è il tuo genere?" subtitle="Così adattiamo meglio l’app a te.">
        {GENDER_OPTIONS.map((option) => (
          <ChoiceCard
            key={option.value}
            title={option.label}
            detail={option.detail}
            selected={draft.gender === option.value}
            onPress={() => onPatch({ gender: option.value })}
          />
        ))}
      </StepShell>
    );
  }
  if (step === 2) {
    return (
      <StepShell title="Quali sono i tuoi obiettivi?" subtitle="Scegli tutte le opzioni che desideri.">
        <ChipGrid items={GOALS} selected={draft.goals} onToggle={(value) => onPatch({ goals: toggle(draft.goals, value) })} />
      </StepShell>
    );
  }
  if (step === 3) {
    return (
      <StepShell title="Scegli le aree di interesse">
        <ChipGrid items={FOCUS_AREAS} selected={draft.focusAreas} onToggle={(value) => onPatch({ focusAreas: toggleFocusArea(draft.focusAreas, value) })} />
        <View style={styles.anatomyWrap}>
          <Image source={MUSCLE_REFERENCE} style={styles.anatomyImage} contentFit="contain" />
          <Text style={styles.anatomyLabel}>Vista frontale e posteriore dei principali gruppi muscolari.</Text>
        </View>
      </StepShell>
    );
  }
  if (step === 4) {
    return (
      <StepShell title="Perché registri i tuoi allenamenti?">
        <ChipGrid
          items={TRAINING_REASONS}
          selected={draft.trainingReasons}
          onToggle={(value) => onPatch({ trainingReasons: toggle(draft.trainingReasons, value) })}
        />
      </StepShell>
    );
  }
  if (step === 5) {
    return (
      <StepShell title="Quanta esperienza hai con l’allenamento di forza?">
        {EXPERIENCE_OPTIONS.map((option) => (
          <ChoiceCard
            key={option.value}
            title={option.label}
            selected={draft.experienceLevel === option.value}
            onPress={() => onPatch({ experienceLevel: option.value })}
          />
        ))}
      </StepShell>
    );
  }
  if (step === 6) {
    return (
      <StepShell title="Quanti giorni a settimana vorresti allenarti?" subtitle="Potrai modificarlo anche in seguito.">
        {DAYS.map((option) => (
          <ChoiceCard
            key={option.value}
            title={option.label}
            detail={option.detail}
            selected={draft.trainingDaysPerWeek === option.value}
            onPress={() => onPatch({ trainingDaysPerWeek: option.value })}
          />
        ))}
      </StepShell>
    );
  }
  if (step === 7) {
    return (
      <MeasureStep
        title="Quanto pesi?"
        unit={weightUnit}
        units={['kg', 'lb']}
        value={weightUnit === 'kg' ? draft.weightKg ?? 75 : kgToLb(draft.weightKg ?? 75)}
        display={weightUnit === 'kg' ? `${(draft.weightKg ?? 75).toFixed(1)} kg` : `${kgToLb(draft.weightKg ?? 75).toFixed(1)} lb`}
        onUnitChange={(unit) => onWeightUnitChange(unit as 'kg' | 'lb')}
        onChange={(next) => onPatch({ weightKg: clamp(weightUnit === 'kg' ? next : lbToKg(next), 30, 300) })}
      />
    );
  }
  if (step === 8) {
    const cm = draft.heightCm ?? 175;
    return (
      <MeasureStep
        title="Quanto sei alto?"
        unit={heightUnit}
        units={['cm', 'ft']}
        value={heightUnit === 'cm' ? cm : cmToTotalInches(cm)}
        display={heightUnit === 'cm' ? `${Math.round(cm)} cm` : formatFeetInches(cm)}
        stepSize={heightUnit === 'cm' ? 1 : 1}
        onUnitChange={(unit) => onHeightUnitChange(unit as 'cm' | 'ft')}
        onChange={(next) => onPatch({ heightCm: clamp(heightUnit === 'cm' ? next : inchesToCm(next), 120, 230) })}
      />
    );
  }
  return <SummaryStep draft={draft} bmi={bmi} bmiCategory={bmiCategory} />;
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

function ChoiceCard({
  title,
  detail,
  selected,
  onPress,
}: {
  title: string;
  detail?: string;
  selected?: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${title}. ${detail}` : title}
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [
        styles.choiceCard,
        {
          backgroundColor: colors.surface,
          borderColor: selected ? colors.moss : colors.border,
          opacity: pressed ? 0.9 : 1,
        },
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

function MeasureStep({
  title,
  unit,
  units,
  value,
  display,
  stepSize = 0.5,
  onUnitChange,
  onChange,
}: {
  title: string;
  unit: string;
  units: string[];
  value: number;
  display: string;
  stepSize?: number;
  onUnitChange: (unit: string) => void;
  onChange: (value: number) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <StepShell title={title}>
      <View style={styles.unitToggle}>
        {units.map((item) => (
          <Pressable
            key={item}
            onPress={() => onUnitChange(item)}
            accessibilityRole="button"
            accessibilityState={{ selected: unit === item }}
            style={[styles.unitButton, { backgroundColor: unit === item ? colors.moss : colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.unitLabel, { color: unit === item ? colors.onMoss : colors.ink }]}>{item.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>
      <View style={[styles.measureCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Pressable onPress={() => onChange(value - stepSize)} accessibilityRole="button" accessibilityLabel="Diminuisci" style={styles.measureButton}>
          <Minus size={24} color={colors.ink} />
        </Pressable>
        <Text style={[styles.measureValue, { color: colors.ink }]}>{display}</Text>
        <Pressable onPress={() => onChange(value + stepSize)} accessibilityRole="button" accessibilityLabel="Aumenta" style={styles.measureButton}>
          <Plus size={24} color={colors.ink} />
        </Pressable>
      </View>
    </StepShell>
  );
}

function SummaryStep({
  draft,
  bmi,
  bmiCategory,
}: {
  draft: ReturnType<typeof useClientOnboardingStore.getState>['drafts'][string];
  bmi: number;
  bmiCategory: BmiCategory;
}) {
  const { colors } = useAppTheme();
  const indicator = Math.min(Math.max((bmi - 15) / 25, 0), 1) * 100;
  return (
    <StepShell title="Ecco il tuo profilo" subtitle="Controlla e conferma i tuoi dati.">
      <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SummaryRow label="Genere" value={genderLabel(draft.gender)} />
        <SummaryRow label="Obiettivi" value={draft.goals.join(', ')} />
        <SummaryRow label="Aree" value={draft.focusAreas.join(', ')} />
        <SummaryRow label="Esperienza" value={experienceLabel(draft.experienceLevel)} />
        <SummaryRow label="Giorni" value={`${draft.trainingDaysPerWeek} a settimana`} />
        <SummaryRow label="Peso" value={`${(draft.weightKg ?? 75).toFixed(1)} kg`} />
        <SummaryRow label="Altezza" value={`${Math.round(draft.heightCm ?? 175)} cm`} />
        <View style={[styles.bmiBox, { backgroundColor: colors.surfaceSubtle }]}>
          <Text style={[styles.bmiValue, { color: colors.ink }]}>{bmi.toFixed(1)}</Text>
          <Text style={[styles.bmiCategory, { color: colors.moss }]}>{displayBmiCategory(bmiCategory)}</Text>
          <View style={[styles.bmiTrack, { backgroundColor: colors.border }]}>
            <View style={[styles.bmiIndicator, { backgroundColor: colors.moss, left: `${indicator}%` }]} />
          </View>
          <Text style={[styles.bmiNote, { color: colors.inkSoft }]}>
            Il BMI è un indicatore generale e non sostituisce una valutazione professionale.
          </Text>
        </View>
      </View>
    </StepShell>
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

function isStepValid(draft: ReturnType<typeof useClientOnboardingStore.getState>['drafts'][string]) {
  if (!draft.mode) return false;
  if (draft.mode === 'coach_guided') return true;
  switch (draft.currentStep) {
    case 1:
      return !!draft.gender;
    case 2:
      return draft.goals.length > 0;
    case 3:
      return draft.focusAreas.length > 0;
    case 4:
      return draft.trainingReasons.length > 0;
    case 5:
      return !!draft.experienceLevel;
    case 6:
      return !!draft.trainingDaysPerWeek;
    case 7:
      return (draft.weightKg ?? 75) >= 30 && (draft.weightKg ?? 75) <= 300;
    case 8:
      return (draft.heightCm ?? 175) >= 120 && (draft.heightCm ?? 175) <= 230;
    case 9:
      return !!buildPayload(draft, calculateBmi(draft.weightKg ?? 75, draft.heightCm ?? 175), getBmiCategory(calculateBmi(draft.weightKg ?? 75, draft.heightCm ?? 175)));
    default:
      return false;
  }
}

function buildPayload(
  draft: ReturnType<typeof useClientOnboardingStore.getState>['drafts'][string],
  bmi: number,
  bmiCategory: BmiCategory,
): SelfGuidedOnboardingPayload | null {
  const weightKg = draft.weightKg ?? 75;
  const heightCm = draft.heightCm ?? 175;
  if (
    !draft.gender ||
    draft.goals.length === 0 ||
    draft.focusAreas.length === 0 ||
    draft.trainingReasons.length === 0 ||
    !draft.experienceLevel ||
    !draft.trainingDaysPerWeek
  ) {
    return null;
  }
  return {
    gender: draft.gender,
    goals: draft.goals,
    focusAreas: draft.focusAreas,
    trainingReasons: draft.trainingReasons,
    experienceLevel: draft.experienceLevel,
    trainingDaysPerWeek: draft.trainingDaysPerWeek,
    weightKg,
    heightCm,
    bmi,
    bmiCategory,
  };
}

function toggle(items: string[], value: string) {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
}

function toggleFocusArea(items: string[], value: string) {
  if (value === 'Tutto il corpo') return items.includes(value) ? [] : [value];
  return toggle(items.filter((item) => item !== 'Tutto il corpo'), value);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function kgToLb(value: number) {
  return value * 2.20462;
}

function lbToKg(value: number) {
  return Math.round((value / 2.20462) * 10) / 10;
}

function cmToTotalInches(value: number) {
  return value / 2.54;
}

function inchesToCm(value: number) {
  return Math.round(value * 2.54);
}

function formatFeetInches(cm: number) {
  const total = Math.round(cmToTotalInches(cm));
  const ft = Math.floor(total / 12);
  const inch = total % 12;
  return `${ft} ft ${inch} in`;
}

function genderLabel(value?: ClientOnboardingGender) {
  return GENDER_OPTIONS.find((item) => item.value === value)?.label ?? '-';
}

function experienceLabel(value?: ClientOnboardingExperience) {
  return EXPERIENCE_OPTIONS.find((item) => item.value === value)?.label ?? '-';
}

function displayBmiCategory(value: BmiCategory) {
  return value === 'Obesita' ? 'Obesità' : value;
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingBottom: 132,
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
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 36,
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
    minHeight: 92,
    padding: AppSpacing[4],
  },
  choiceCopy: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  choiceTitle: {
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 23,
  },
  choiceDetail: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
    lineHeight: 19,
  },
  inputCard: {
    borderRadius: 22,
    borderWidth: 1,
    minHeight: 74,
    justifyContent: 'center',
    paddingHorizontal: AppSpacing[4],
  },
  codeInput: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 1,
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
  anatomyWrap: {
    alignItems: 'center',
    gap: AppSpacing[2],
  },
  anatomyImage: {
    aspectRatio: 1.37,
    maxHeight: 250,
    width: '100%',
  },
  anatomyLabel: {
    color: '#9AA4AD',
    fontSize: AppFontSize.xs,
    fontWeight: '600',
    textAlign: 'center',
  },
  unitToggle: {
    flexDirection: 'row',
    gap: AppSpacing[2],
  },
  unitButton: {
    borderRadius: AppRadius.pill,
    borderWidth: 1,
    paddingHorizontal: AppSpacing[4],
    paddingVertical: 9,
  },
  unitLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '900',
  },
  measureCard: {
    alignItems: 'center',
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    gap: AppSpacing[3],
    justifyContent: 'space-between',
    minHeight: 140,
    padding: AppSpacing[4],
  },
  measureButton: {
    alignItems: 'center',
    borderRadius: AppRadius.pill,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  measureValue: {
    flex: 1,
    fontSize: 38,
    fontWeight: '900',
    lineHeight: 44,
    textAlign: 'center',
  },
  summaryCard: {
    borderRadius: 24,
    borderWidth: 1,
    gap: AppSpacing[2],
    padding: AppSpacing[4],
  },
  summaryRow: {
    gap: 3,
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
  bmiBox: {
    borderRadius: 18,
    gap: AppSpacing[2],
    marginTop: AppSpacing[2],
    padding: AppSpacing[3],
  },
  bmiValue: {
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 38,
  },
  bmiCategory: {
    fontSize: AppFontSize.base,
    fontWeight: '900',
  },
  bmiTrack: {
    borderRadius: AppRadius.pill,
    height: 8,
    marginVertical: AppSpacing[1],
  },
  bmiIndicator: {
    borderRadius: AppRadius.pill,
    height: 18,
    marginLeft: -5,
    marginTop: -5,
    position: 'absolute',
    width: 10,
  },
  bmiNote: {
    fontSize: AppFontSize.xs,
    fontWeight: '600',
    lineHeight: 17,
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
