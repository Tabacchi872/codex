import { useRouter } from 'expo-router';
import { ArrowLeft, Check, ChevronRight } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { LegalConsentCheckbox } from '@/components/legal-consent-checkbox';
import { AppButton, AppScreen, AppTextField } from '@/components/ui';
import { PRIVACY_POLICY_URL } from '@/constants/app-info';
import { assignInitialAutoProgram } from '@/lib/auto-program-service';
import { saveInitialFitnessQuestionnaire } from '@/lib/client-fitness-profile-service';
import { recordHealthDataConsent } from '@/lib/legal-acceptance-service';
import { useAuthStore } from '@/store/auth-store';
import { useClientFitnessProfileStore } from '@/store/client-fitness-profile-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import type {
  ClientFitnessProfileDraft,
  FitnessEquipmentLevel,
  FitnessLocation,
  InitialFitnessQuestionnairePayload,
  PreferredTrainingStyle,
} from '@/types/client-fitness-profile';

const LOCATION_OPTIONS: { value: FitnessLocation; label: string; detail: string }[] = [
  { value: 'gym', label: 'Palestra', detail: 'Ho accesso a una palestra attrezzata' },
  { value: 'home', label: 'Casa', detail: 'Mi alleno principalmente a casa' },
];

const EQUIPMENT_OPTIONS: { value: FitnessEquipmentLevel; label: string; detail: string }[] = [
  { value: 'bodyweight_only', label: 'Solo corpo libero', detail: 'Nessun attrezzo' },
  { value: 'home_basic', label: 'Attrezzatura di base', detail: 'Manubri, elastici, tappetino' },
  { value: 'full_gym', label: 'Palestra completa', detail: 'Bilancieri, macchine, cavi' },
];

const DURATION_OPTIONS = [30, 45, 60, 90];

const STYLE_OPTIONS: { value: PreferredTrainingStyle; label: string; detail: string }[] = [
  { value: 'full_body', label: 'Full body', detail: 'Tutto il corpo ad ogni seduta' },
  { value: 'upper_lower', label: 'Upper/Lower', detail: 'Alterna parte alta e bassa' },
  { value: 'split', label: 'Split per gruppo muscolare', detail: 'Un focus diverso ogni seduta' },
  { value: 'hybrid', label: 'Misto pesi e cardio', detail: 'Combina forza e condizionamento' },
  { value: 'no_preference', label: 'Nessuna preferenza', detail: 'Decida il sistema per me' },
];

// Elenco curato di esercizi comuni (id reali di mobile/src/data/exercise-library.ts):
// non e' un catalogo di ricerca completo, solo le esclusioni piu' frequenti.
// Una ricerca completa e' fuori scope per il questionario iniziale (Blocco 1).
const COMMON_EXERCISES: { id: string; name: string }[] = [
  { id: 'petto-panca-piana', name: 'Panca piana' },
  { id: 'petto-push-up', name: 'Push up' },
  { id: 'dorso-lat-machine-avanti', name: 'Lat machine avanti' },
  { id: 'dorso-rematore-manubrio', name: 'Rematore con manubrio' },
  { id: 'gambe-squat', name: 'Squat' },
  { id: 'gambe-affondi', name: 'Affondi' },
  { id: 'gambe-leg-press', name: 'Leg press' },
  { id: 'gambe-stacco-rumeno', name: 'Stacco rumeno' },
  { id: 'gambe-hip-thrust', name: 'Hip thrust' },
  { id: 'spalle-shoulder-press', name: 'Shoulder press' },
  { id: 'spalle-alzate-laterali', name: 'Alzate laterali' },
  { id: 'bicipiti-curl-bilanciere', name: 'Curl bilanciere' },
  { id: 'tricipiti-pushdown-cavo', name: 'Pushdown al cavo' },
  { id: 'core-crunch', name: 'Crunch' },
  { id: 'core-plank', name: 'Plank' },
  { id: 'cardio-burpees', name: 'Burpees' },
];

const PAIN_AREAS = ['Spalla', 'Gomito', 'Polso', 'Schiena bassa', 'Schiena alta', 'Anca', 'Ginocchio', 'Caviglia', 'Altro'];

const TOTAL_STEPS = 10;

export default function QuestionarioFitnessScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const clientId = useAuthStore((s) => s.currentClientId);
  const draft = useClientFitnessProfileStore((s) => (clientId ? s.drafts[clientId] : undefined));
  const upsertDraft = useClientFitnessProfileStore((s) => s.upsertDraft);
  const clearDraft = useClientFitnessProfileStore((s) => s.clearDraft);
  const markCompleted = useClientFitnessProfileStore((s) => s.markCompleted);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [healthConsentAccepted, setHealthConsentAccepted] = useState(false);
  const [healthConsentRecorded, setHealthConsentRecorded] = useState(false);

  const currentDraft = useMemo<ClientFitnessProfileDraft>(
    () =>
      draft ?? {
        clientId: clientId ?? '',
        currentStep: 0,
        excludedExerciseIds: [],
        painAreas: [],
        updatedAt: new Date().toISOString(),
      },
    [clientId, draft],
  );

  const step = currentDraft.currentStep;
  const formValid = isStepValid(currentDraft, step, healthConsentAccepted);
  const disabledReason = getDisabledReason(currentDraft, step, healthConsentAccepted, submitting);
  const canGoBack = step > 0;

  useEffect(() => {
    if (!__DEV__) return;
    console.info('FITNESS_QUESTIONNAIRE_STATE', {
      healthConsentChecked: healthConsentAccepted,
      healthConsentRecorded,
      isSubmitting: submitting,
      formValid,
      disabledReason,
    });
  }, [disabledReason, formValid, healthConsentAccepted, healthConsentRecorded, submitting]);

  function patch(patchValue: Partial<Omit<ClientFitnessProfileDraft, 'clientId' | 'updatedAt'>>) {
    if (!clientId) return;
    upsertDraft(clientId, patchValue);
  }

  function goBack() {
    setError(null);
    if (step === 0) return;
    patch({ currentStep: step - 1 });
  }

  async function continueFlow() {
    if (!clientId || disabledReason) return;
    setError(null);

    if (step === 6) {
      setSubmitting(true);
      const consentOk = await recordHealthConsentForFlow();
      setSubmitting(false);
      if (!consentOk) return;
      patch({ currentStep: step + 1 });
      return;
    }

    if (step < TOTAL_STEPS - 1) {
      patch({ currentStep: step + 1 });
      return;
    }

    const payload = buildPayload(currentDraft);
    if (!payload) return;

    setSubmitting(true);
    const consentOk = await recordHealthConsentForFlow();
    if (!consentOk) {
      setSubmitting(false);
      return;
    }

    const saveResult = await saveInitialFitnessQuestionnaire(payload);
    if (!saveResult.ok) {
      setSubmitting(false);
      setError(saveResult.message);
      return;
    }

    const assignResult = await assignInitialAutoProgram();
    setSubmitting(false);
    if (!assignResult.ok) {
      setError(assignResult.message);
      return;
    }

    markCompleted(clientId);
    clearDraft(clientId);
    router.replace('/cliente-home');
  }

  async function recordHealthConsentForFlow() {
    if (healthConsentRecorded) return true;

    const healthConsentResult = await recordHealthDataConsent();
    const recorded = healthConsentResult.ok;
    setHealthConsentRecorded(recorded);

    if (__DEV__) {
      console.info('FITNESS_HEALTH_CONSENT_RECORD_RESULT', {
        healthConsentChecked: healthConsentAccepted,
        healthConsentRecorded: recorded,
        isSubmitting: true,
        formValid,
        disabledReason,
      });
    }

    if (!healthConsentResult.ok) {
      setError(healthConsentResult.message);
      return false;
    }
    return true;
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
            label={step === TOTAL_STEPS - 1 ? 'Conferma e genera il mio programma' : 'Continua'}
            onPress={continueFlow}
            disabled={Boolean(disabledReason)}
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
          <View style={[styles.progressFill, { backgroundColor: colors.moss, width: `${((step + 1) / TOTAL_STEPS) * 100}%` }]} />
        </View>
        <Text style={[styles.progressText, { color: colors.inkSoft }]}>{step + 1}/{TOTAL_STEPS}</Text>
      </View>

      <StepContent
        step={step}
        draft={currentDraft}
        healthConsentAccepted={healthConsentAccepted}
        onHealthConsentToggle={(checked) => setHealthConsentAccepted(checked)}
        onPatch={patch}
      />
    </AppScreen>
  );
}

function StepContent({
  step,
  draft,
  healthConsentAccepted,
  onHealthConsentToggle,
  onPatch,
}: {
  step: number;
  draft: ClientFitnessProfileDraft;
  healthConsentAccepted: boolean;
  onHealthConsentToggle: (checked: boolean) => void;
  onPatch: (patch: Partial<Omit<ClientFitnessProfileDraft, 'clientId' | 'updatedAt'>>) => void;
}) {
  if (step === 0) {
    return (
      <StepShell title="Quanti anni hai?" subtitle="Il servizio e' destinato a utenti maggiorenni.">
        <AppTextField
          keyboardType="number-pad"
          value={draft.age ? String(draft.age) : ''}
          onChangeText={(value) => {
            const parsed = Number(value.replace(/[^0-9]/g, ''));
            onPatch({ age: Number.isFinite(parsed) && parsed > 0 ? parsed : undefined });
          }}
          placeholder="Es. 32"
          maxLength={3}
        />
      </StepShell>
    );
  }
  if (step === 1) {
    return (
      <StepShell title="Dove ti alleni di solito?">
        {LOCATION_OPTIONS.map((option) => (
          <ChoiceCard
            key={option.value}
            title={option.label}
            detail={option.detail}
            selected={draft.location === option.value}
            onPress={() => onPatch({ location: option.value })}
          />
        ))}
      </StepShell>
    );
  }
  if (step === 2) {
    return (
      <StepShell title="Che attrezzatura hai a disposizione?">
        {EQUIPMENT_OPTIONS.map((option) => (
          <ChoiceCard
            key={option.value}
            title={option.label}
            detail={option.detail}
            selected={draft.equipmentLevel === option.value}
            onPress={() => onPatch({ equipmentLevel: option.value })}
          />
        ))}
      </StepShell>
    );
  }
  if (step === 3) {
    return (
      <StepShell title="Quanto tempo vuoi dedicare ad ogni allenamento?">
        {DURATION_OPTIONS.map((minutes) => (
          <ChoiceCard
            key={minutes}
            title={`${minutes} minuti`}
            selected={draft.sessionDurationMinutes === minutes}
            onPress={() => onPatch({ sessionDurationMinutes: minutes })}
          />
        ))}
      </StepShell>
    );
  }
  if (step === 4) {
    return (
      <StepShell title="Che tipo di allenamento preferisci?">
        {STYLE_OPTIONS.map((option) => (
          <ChoiceCard
            key={option.value}
            title={option.label}
            detail={option.detail}
            selected={draft.preferredTrainingStyle === option.value}
            onPress={() => onPatch({ preferredTrainingStyle: option.value })}
          />
        ))}
      </StepShell>
    );
  }
  if (step === 5) {
    return (
      <StepShell title="C'è qualche esercizio che preferisci evitare?" subtitle="Facoltativo: puoi selezionarne più di uno, o nessuno.">
        <ChipGrid
          items={COMMON_EXERCISES.map((item) => item.name)}
          selected={COMMON_EXERCISES.filter((item) => draft.excludedExerciseIds.includes(item.id)).map((item) => item.name)}
          onToggle={(label) => {
            const match = COMMON_EXERCISES.find((item) => item.name === label);
            if (!match) return;
            const next = draft.excludedExerciseIds.includes(match.id)
              ? draft.excludedExerciseIds.filter((id) => id !== match.id)
              : [...draft.excludedExerciseIds, match.id];
            onPatch({ excludedExerciseIds: next });
          }}
        />
      </StepShell>
    );
  }
  if (step === 6) {
    return (
      <StepShell
        title="Consenso per informazioni su salute e limitazioni"
        subtitle="Il prossimo passaggio puo raccogliere dolori, fastidi o limitazioni fisiche utili a evitare esercizi non adatti.">
        <LegalConsentCheckbox
          checked={healthConsentAccepted}
          label="Acconsento al trattamento delle informazioni relative alla mia salute e alle mie limitazioni fisiche per la creazione e gestione dei programmi di allenamento."
          linkLabel="Apri Informativa privacy"
          linkUrl={PRIVACY_POLICY_URL}
          onToggle={onHealthConsentToggle}
        />
      </StepShell>
    );
  }
  if (step === 7) {
    return (
      <StepShell title="Hai dolori o fastidi di cui dovremmo tenere conto?">
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
              placeholder="Descrivi brevemente (es. fastidio al ginocchio destro sotto sforzo)"
              multiline
              style={styles.notesInput}
            />
          </View>
        ) : null}
      </StepShell>
    );
  }
  if (step === 8) {
    return (
      <StepShell
        title="Hai un infortunio attivo o una condizione fisica che richiede il parere di un professionista prima di allenarti?"
        subtitle="Rispondi con onestà: se la risposta è sì, ti prepareremo un programma prudente e chiederemo la revisione del nostro team prima di assegnartelo.">
        <ChoiceCard title="Sì" selected={draft.requiresProfessionalSupervision === true} onPress={() => onPatch({ requiresProfessionalSupervision: true })} />
        <ChoiceCard title="No" selected={draft.requiresProfessionalSupervision === false} onPress={() => onPatch({ requiresProfessionalSupervision: false })} />
      </StepShell>
    );
  }
  return <SummaryStep draft={draft} />;
}

function SummaryStep({ draft }: { draft: ClientFitnessProfileDraft }) {
  const { colors } = useAppTheme();
  const excludedNames = COMMON_EXERCISES.filter((item) => draft.excludedExerciseIds.includes(item.id)).map((item) => item.name);
  return (
    <StepShell title="Ecco il tuo profilo" subtitle="Controlla le risposte prima di confermare.">
      <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SummaryRow label="Età" value={draft.age ? `${draft.age} anni` : '-'} />
        <SummaryRow label="Luogo" value={LOCATION_OPTIONS.find((o) => o.value === draft.location)?.label ?? '-'} />
        <SummaryRow label="Attrezzatura" value={EQUIPMENT_OPTIONS.find((o) => o.value === draft.equipmentLevel)?.label ?? '-'} />
        <SummaryRow label="Durata sessione" value={draft.sessionDurationMinutes ? `${draft.sessionDurationMinutes} minuti` : '-'} />
        <SummaryRow label="Stile" value={STYLE_OPTIONS.find((o) => o.value === draft.preferredTrainingStyle)?.label ?? '-'} />
        <SummaryRow label="Esercizi evitati" value={excludedNames.length > 0 ? excludedNames.join(', ') : 'Nessuno'} />
        <SummaryRow label="Dolori/fastidi" value={draft.hasPainOrLimitation ? draft.painAreas.join(', ') || 'Segnalati' : 'Nessuno'} />
        <SummaryRow label="Parere professionista" value={draft.requiresProfessionalSupervision ? 'Richiesto' : 'Non richiesto'} />
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

function isStepValid(draft: ClientFitnessProfileDraft, step: number, healthConsentAccepted: boolean) {
  switch (step) {
    case 0:
      return !!draft.age && draft.age >= 18 && draft.age <= 100;
    case 1:
      return !!draft.location;
    case 2:
      return !!draft.equipmentLevel;
    case 3:
      return !!draft.sessionDurationMinutes;
    case 4:
      return !!draft.preferredTrainingStyle;
    case 5:
      return true;
    case 6:
      return healthConsentAccepted;
    case 7:
      return typeof draft.hasPainOrLimitation === 'boolean';
    case 8:
      return typeof draft.requiresProfessionalSupervision === 'boolean';
    case 9:
      return !!buildPayload(draft);
    default:
      return false;
  }
}

function getDisabledReason(
  draft: ClientFitnessProfileDraft,
  step: number,
  healthConsentAccepted: boolean,
  submitting: boolean,
) {
  if (submitting) return 'submitting';

  switch (step) {
    case 0:
      return !!draft.age && draft.age >= 18 && draft.age <= 100 ? null : 'age_invalid';
    case 1:
      return draft.location ? null : 'location_missing';
    case 2:
      return draft.equipmentLevel ? null : 'equipment_missing';
    case 3:
      return draft.sessionDurationMinutes ? null : 'duration_missing';
    case 4:
      return draft.preferredTrainingStyle ? null : 'training_style_missing';
    case 5:
      return null;
    case 6:
      return healthConsentAccepted ? null : 'health_consent_unchecked';
    case 7:
      return typeof draft.hasPainOrLimitation === 'boolean' ? null : 'pain_choice_missing';
    case 8:
      return typeof draft.requiresProfessionalSupervision === 'boolean' ? null : 'supervision_choice_missing';
    case 9:
      return buildPayload(draft) ? null : 'summary_payload_incomplete';
    default:
      return 'unknown_step';
  }
}

function buildPayload(draft: ClientFitnessProfileDraft): InitialFitnessQuestionnairePayload | null {
  if (
    !draft.age ||
    !draft.location ||
    !draft.equipmentLevel ||
    !draft.sessionDurationMinutes ||
    !draft.preferredTrainingStyle ||
    typeof draft.hasPainOrLimitation !== 'boolean' ||
    typeof draft.requiresProfessionalSupervision !== 'boolean'
  ) {
    return null;
  }
  return {
    age: draft.age,
    location: draft.location,
    equipmentLevel: draft.equipmentLevel,
    sessionDurationMinutes: draft.sessionDurationMinutes,
    preferredTrainingStyle: draft.preferredTrainingStyle,
    excludedExerciseIds: draft.excludedExerciseIds,
    hasPainOrLimitation: draft.hasPainOrLimitation,
    painAreas: draft.painAreas,
    painNotes: draft.painNotes,
    requiresProfessionalSupervision: draft.requiresProfessionalSupervision,
  };
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
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 32,
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
