import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from './card';
import { ThemedText } from './themed-text';
import { ThemedTextInput } from './themed-text-input';

import { DEFAULT_COACH_ID } from '@/constants/app-info';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
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
  const theme = useTheme();
  const [packageName, setPackageName] = useState(initialSubscription?.packageName ?? '');
  const [totalWorkoutsPurchased, setTotalWorkoutsPurchased] = useState(
    String(initialSubscription?.totalWorkoutsPurchased ?? 12)
  );
  const [completedWorkouts, setCompletedWorkouts] = useState(String(initialSubscription?.completedWorkouts ?? 0));
  const [startDate, setStartDate] = useState(initialSubscription?.startDate ?? new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(initialSubscription?.endDate ?? '');
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
    if (!startDate.trim()) {
      setError('Inserisci una data di inizio (formato AAAA-MM-GG).');
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
      startDate: startDate.trim(),
      endDate: endDate.trim() || undefined,
      status,
      notes: notes.trim() || undefined,
      createdAt: initialSubscription?.createdAt ?? now,
      updatedAt: now,
    });
  }

  return (
    <View style={styles.container}>
      <Card style={styles.card}>
        <Field label="Nome pacchetto">
          <ThemedTextInput value={packageName} onChangeText={setPackageName} placeholder="Es. 12 allenamenti" />
        </Field>

        <Field label="Totale acquistati">
          <ThemedTextInput
            value={totalWorkoutsPurchased}
            onChangeText={setTotalWorkoutsPurchased}
            placeholder="12"
            keyboardType="number-pad"
          />
        </Field>

        <Field label="Completati">
          <ThemedTextInput
            value={completedWorkouts}
            onChangeText={setCompletedWorkouts}
            placeholder="0"
            keyboardType="number-pad"
          />
        </Field>

        <Field label="Data inizio (AAAA-MM-GG)">
          <ThemedTextInput value={startDate} onChangeText={setStartDate} placeholder="2026-07-05" />
        </Field>

        <Field label="Data fine (opzionale)">
          <ThemedTextInput value={endDate} onChangeText={setEndDate} placeholder="2026-09-05" />
        </Field>

        <Field label="Stato">
          <View style={styles.chipsRow}>
            {STATUS_OPTIONS.map((option) => {
              const active = option === status;
              return (
                <Pressable key={option} onPress={() => setStatus(option)}>
                  <View
                    style={[
                      styles.chip,
                      { backgroundColor: active ? theme.primary : theme.background, borderColor: active ? theme.primary : theme.border },
                    ]}>
                    <ThemedText type="small" themeColor={active ? 'onPrimary' : 'text'}>
                      {SUBSCRIPTION_STATUS_LABEL[option]}
                    </ThemedText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Field>

        <Field label="Note (opzionale)">
          <ThemedTextInput value={notes} onChangeText={setNotes} placeholder="Note interne" multiline />
        </Field>
      </Card>

      {error && (
        <ThemedText type="small" themeColor="statusExpired">
          {error}
        </ThemedText>
      )}

      <Pressable onPress={handleSave}>
        <View style={[styles.saveButton, { backgroundColor: theme.primary }]}>
          <ThemedText type="smallBold" themeColor="onPrimary">
            {saveLabel}
          </ThemedText>
        </View>
      </Pressable>
    </View>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  card: {
    gap: Spacing.three,
  },
  field: {
    gap: 4,
    width: '100%',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
  },
  saveButton: {
    borderRadius: Radius.md,
    padding: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
});
