import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppCard, AppTextField } from './ui';

import { DEFAULT_COACH_ID } from '@/constants/app-info';
import { formatDateForDisplay, parseDateFromDisplay } from '@/lib/format-date';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import { SUBSCRIPTION_STATUS_LABEL, type SubscriptionPackage, type SubscriptionStatus } from '@/types/subscription';

const STATUS_OPTIONS: SubscriptionStatus[] = ['active', 'paused', 'completed', 'expired', 'cancelled'];

// Form condiviso creazione/modifica abbonamento. `completedWorkouts` è un
// campo editabile esplicito (non calcolato) perché il coach deve poter
// "azzerare o mantenere completati, con scelta chiara" in fase di rinnovo
// (regola esplicita del prodotto) — vedi types/subscription.ts.
export function SubscriptionForm({
  initialSubscription,
  clientId,
  onSave,
  saveLabel,
}: {
  initialSubscription?: SubscriptionPackage;
  clientId: string;
  onSave: (subscription: SubscriptionPackage) => void;
  saveLabel: string;
}) {
  const { colors } = useAppTheme();
  const [packageName, setPackageName] = useState(initialSubscription?.packageName ?? '');
  const [totalWorkoutsPurchased, setTotalWorkoutsPurchased] = useState(
    String(initialSubscription?.totalWorkoutsPurchased ?? 12)
  );
  const [completedWorkouts, setCompletedWorkouts] = useState(String(initialSubscription?.completedWorkouts ?? 0));
  const [startDate, setStartDate] = useState(
    formatDateForDisplay(initialSubscription?.startDate ?? new Date().toISOString().slice(0, 10))
  );
  const [endDate, setEndDate] = useState(initialSubscription?.endDate ? formatDateForDisplay(initialSubscription.endDate) : '');
  const [status, setStatus] = useState<SubscriptionStatus>(initialSubscription?.status ?? 'active');
  const [notes, setNotes] = useState(initialSubscription?.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    if (!packageName.trim()) {
      setError('Inserisci un nome per il pacchetto (es. "12 allenamenti").');
      return;
    }
    const total = Number(totalWorkoutsPurchased);
    if (!Number.isFinite(total) || total <= 0) {
      setError('Inserisci un totale allenamenti valido (numero maggiore di 0).');
      return;
    }
    const completed = Number(completedWorkouts);
    if (!Number.isFinite(completed) || completed < 0) {
      setError('Inserisci un numero di allenamenti completati valido (0 o più).');
      return;
    }
    const isoStartDate = parseDateFromDisplay(startDate);
    const isoEndDate = endDate.trim() ? parseDateFromDisplay(endDate) : '';
    if (!isoStartDate) {
      setError('Inserisci una data di inizio valida nel formato GG/MM/AAAA.');
      return;
    }
    if (endDate.trim() && !isoEndDate) {
      setError('Inserisci una data di fine valida nel formato GG/MM/AAAA.');
      return;
    }
    setError(null);
    const now = new Date().toISOString();
    onSave({
      id: initialSubscription?.id ?? `sub-${Date.now()}`,
      clientId,
      coachId: initialSubscription?.coachId ?? DEFAULT_COACH_ID,
      packageName: packageName.trim(),
      totalWorkoutsPurchased: total,
      completedWorkouts: completed,
      startDate: isoStartDate,
      endDate: isoEndDate || undefined,
      status,
      notes: notes.trim() || undefined,
      createdAt: initialSubscription?.createdAt ?? now,
      updatedAt: now,
    });
  }

  return (
    <View style={styles.container}>
      <AppCard style={styles.card}>
        <AppTextField label="Nome pacchetto" value={packageName} onChangeText={setPackageName} placeholder="Es. 12 allenamenti" />
        <AppTextField
          label="Totale acquistati"
          value={totalWorkoutsPurchased}
          onChangeText={setTotalWorkoutsPurchased}
          placeholder="12"
          keyboardType="number-pad"
        />
        <AppTextField
          label="Completati"
          value={completedWorkouts}
          onChangeText={setCompletedWorkouts}
          placeholder="0"
          keyboardType="number-pad"
        />
        <AppTextField label="Data inizio" value={startDate} onChangeText={setStartDate} placeholder="gg/mm/aaaa" />
        <AppTextField label="Data fine (opzionale)" value={endDate} onChangeText={setEndDate} placeholder="gg/mm/aaaa" />

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>Stato</Text>
          <View style={styles.chipsRow}>
            {STATUS_OPTIONS.map((option) => {
              const active = option === status;
              return (
                <Pressable
                  key={option}
                  onPress={() => setStatus(option)}
                  style={[styles.chip, { backgroundColor: active ? colors.moss : 'transparent', borderColor: colors.moss }]}>
                  <Text style={[styles.chipLabel, { color: active ? colors.onMoss : colors.moss }]}>
                    {SUBSCRIPTION_STATUS_LABEL[option]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <AppTextField label="Note (opzionale)" value={notes} onChangeText={setNotes} placeholder="Note interne" multiline />
      </AppCard>

      {error ? <Text style={[styles.errorText, { color: colors.rust }]}>{error}</Text> : null}

      <AppButton label={saveLabel} onPress={handleSave} fullWidth size="lg" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: AppSpacing[3],
  },
  card: {
    gap: AppSpacing[3],
  },
  field: {
    gap: 4,
    width: '100%',
  },
  fieldLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  chip: {
    borderRadius: AppRadius.pill,
    borderWidth: 1.5,
    paddingHorizontal: AppSpacing[3],
    paddingVertical: 7,
  },
  chipLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  errorText: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
  },
});
