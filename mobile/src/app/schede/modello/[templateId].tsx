import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Dumbbell } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CoachOnlyNotice } from '@/components/coach-only-notice';
import { ExerciseThumbnail } from '@/components/exercise-thumbnail';
import { ScreenBackground } from '@/components/screen-background';
import { TemplateFolderPickerModal } from '@/components/template-folder-picker-modal';
import { ThemedText } from '@/components/themed-text';
import { AppBadge, AppButton, AppCard, BackHeader } from '@/components/ui';
import { WorkoutTemplateForm } from '@/components/workout-template-form';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useExerciseResolver } from '@/hooks/use-exercise-resolver';
import { useTheme } from '@/hooks/use-theme';
import { clientFullName } from '@/lib/client-helpers';
import { supabaseConfig } from '@/lib/supabase';
import {
  assignWorkoutTemplateToClient,
  deleteWorkoutTemplate,
  duplicateWorkoutTemplate,
  getWorkoutTemplateById,
  listTemplateFolders,
  moveWorkoutTemplateToFolder,
  saveWorkoutTemplate,
} from '@/lib/workout-plan-service';
import { useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import type { TemplateFolder, WorkoutTemplate } from '@/types/template-library';
import type { WorkoutExercise } from '@/types/training';

async function confirmDestructive(title: string, message: string, confirmLabel: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return globalThis.confirm(`${title}\n\n${message}`);
  }
  return new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: 'Annulla', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

// Dettaglio di UNA scheda modello della libreria globale: vista/modifica/
// duplica/sposta/elimina + "Assegna a cliente". L'unico punto di tutta la
// libreria modelli in cui e' legittimo leggere useClientStore — e SOLO per
// popolare l'elenco di clienti active tra cui scegliere, mai per
// pre-selezionare o aprire automaticamente qualcosa.
export default function ModelloDettaglioScreen() {
  const { templateId } = useLocalSearchParams<{ templateId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { resolve: resolveExercise } = useExerciseResolver();
  const isCoach = useAuthStore((s) => s.currentRole !== 'cliente');
  const clients = useClientStore((s) => s.clients);

  const [template, setTemplate] = useState<WorkoutTemplate | null | undefined>(undefined);
  const [folders, setFolders] = useState<TemplateFolder[]>([]);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [saving, setSaving] = useState(false);
  const [showMovePicker, setShowMovePicker] = useState(false);

  const [assigning, setAssigning] = useState(false);
  const [assignClientId, setAssignClientId] = useState<string | null>(null);
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState('');
  const [assignedConfirmation, setAssignedConfirmation] = useState<{ clientId: string; clientName: string; planId: string } | null>(null);

  const load = useCallback(async () => {
    if (!supabaseConfig.isConfigured) {
      setError("Supabase non e' configurato: impossibile leggere la libreria modelli.");
      setTemplate(null);
      return;
    }
    setError('');
    const [templateResult, foldersResult] = await Promise.all([getWorkoutTemplateById(templateId), listTemplateFolders()]);
    if (!templateResult.ok) {
      setError(templateResult.message);
      setTemplate(null);
      return;
    }
    if (foldersResult.ok) setFolders(foldersResult.data);
    setTemplate(templateResult.data);
  }, [templateId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!isCoach) {
    return <CoachOnlyNotice />;
  }

  const activeClients = clients.filter((c) => c.connectionStatus !== 'suspended' && c.connectionStatus !== 'removed');

  async function handleSaveEdit(input: {
    name: string;
    description: string;
    goal: string;
    level: string;
    folderId: string | null;
    exercises: WorkoutExercise[];
  }) {
    if (!template) return;
    setSaving(true);
    setError('');
    const result = await saveWorkoutTemplate({
      id: template.id,
      folderId: input.folderId,
      name: input.name,
      description: input.description,
      goal: input.goal,
      level: input.level,
      exercises: input.exercises.map((e) => ({
        id: e.id,
        exerciseId: e.exerciseId,
        order: e.order,
        sets: e.sets,
        reps: e.reps,
        repsMin: e.repsMin,
        repsMax: e.repsMax,
        targetWeight: e.targetWeight,
        restSeconds: e.restSeconds,
        notes: e.notes,
        techniqueType: e.techniqueType,
        supersetGroupId: e.supersetGroupId,
      })),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setTemplate(result.data);
    setMode('view');
  }

  async function handleDuplicate() {
    if (!template) return;
    setSaving(true);
    setError('');
    const result = await duplicateWorkoutTemplate(template.id);
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.replace(`/schede/modello/${result.data.id}`);
  }

  async function handleMove(folderId: string | null) {
    if (!template) return;
    setShowMovePicker(false);
    setSaving(true);
    setError('');
    const result = await moveWorkoutTemplateToFolder(template.id, folderId);
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setTemplate({ ...template, folderId });
  }

  async function handleDelete() {
    if (!template) return;
    const confirmed = await confirmDestructive('Elimina scheda modello', `Eliminare "${template.name}"? L'azione non è reversibile.`, 'Elimina');
    if (!confirmed) return;
    setSaving(true);
    setError('');
    const result = await deleteWorkoutTemplate(template.id);
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.replace(template.folderId ? (`/schede/cartella/${template.folderId}` as const) : '/schede');
  }

  async function handleConfirmAssign() {
    if (!template || !assignClientId) return;
    setAssignBusy(true);
    setAssignError('');
    const result = await assignWorkoutTemplateToClient(template.id, assignClientId);
    setAssignBusy(false);
    if (!result.ok) {
      setAssignError(result.message);
      return;
    }
    const client = activeClients.find((c) => c.id === assignClientId);
    setAssigning(false);
    setAssignClientId(null);
    setAssignedConfirmation({ clientId: assignClientId, clientName: client ? clientFullName(client) : 'cliente', planId: result.data.id });
  }

  const folderName = template?.folderId ? (folders.find((f) => f.id === template.folderId)?.name ?? 'Cartella') : 'Senza categoria';
  const backHref = template?.folderId ? (`/schede/cartella/${template.folderId}` as const) : '/schede';

  return (
    <ScreenBackground>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Platform.OS === 'web' ? Spacing.four : insets.top + Spacing.three,
            paddingBottom: insets.bottom + BottomTabInset + Spacing.five,
          },
        ]}>
        <BackHeader title={mode === 'edit' ? 'Modifica scheda modello' : 'Scheda modello'} fallbackHref={backHref} />

        {template === undefined ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator />
            <ThemedText type="small" themeColor="textSecondary">
              Caricamento…
            </ThemedText>
          </View>
        ) : template === null ? (
          <ThemedText type="default">{error || 'Scheda modello non trovata.'}</ThemedText>
        ) : mode === 'edit' ? (
          <WorkoutTemplateForm
            initialTemplate={template}
            initialFolderId={template.folderId}
            folders={folders}
            onSave={handleSaveEdit}
            saveLabel="Salva modifiche"
          />
        ) : (
          <>
            <AppCard style={styles.hero}>
              <ThemedText type="title">{template.name}</ThemedText>
              {template.description ? <ThemedText type="default" themeColor="textSecondary">{template.description}</ThemedText> : null}
              <View style={styles.badges}>
                {template.goal ? <AppBadge label={template.goal} tone="moss" /> : null}
                {template.level ? <AppBadge label={template.level} /> : null}
                <AppBadge label={folderName} />
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {template.exercises.length} esercizi
              </ThemedText>
            </AppCard>

            {assignedConfirmation ? (
              <AppCard style={styles.confirmationCard}>
                <ThemedText type="smallBold">Scheda assegnata a {assignedConfirmation.clientName}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  E' stata creata una copia indipendente: modificare in futuro questo modello non cambierà la scheda del cliente.
                </ThemedText>
                <View style={styles.confirmationActions}>
                  <View style={styles.confirmationActionItem}>
                    <AppButton
                      label="Resta qui"
                      onPress={() => setAssignedConfirmation(null)}
                      variant="outline"
                      fullWidth
                    />
                  </View>
                  <View style={styles.confirmationActionItem}>
                    <AppButton
                      label="Vai al cliente"
                      onPress={() => router.push(`/clienti/${assignedConfirmation.clientId}`)}
                      fullWidth
                    />
                  </View>
                </View>
              </AppCard>
            ) : null}

            <View style={styles.sectionHeader}>
              <ThemedText type="subtitle">Esercizi</ThemedText>
            </View>
            {template.exercises.map((te) => {
              const exercise = resolveExercise(te.exerciseId);
              return (
                <AppCard key={te.id} style={styles.exerciseRow}>
                  {exercise ? (
                    <ExerciseThumbnail exercise={exercise} exerciseId={exercise.id} size={52} />
                  ) : (
                    <View style={[styles.exercisePlaceholder, { backgroundColor: theme.backgroundElement }]}>
                      <Dumbbell size={20} color={theme.textSecondary} />
                    </View>
                  )}
                  <View style={styles.exerciseCopy}>
                    <ThemedText type="smallBold" numberOfLines={2}>
                      {exercise?.name ?? te.exerciseId}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                      {te.sets} serie · {te.repsMin && te.repsMax ? `${te.repsMin}-${te.repsMax} rip.` : `${te.reps} rip.`} · recupero {te.restSeconds}s
                      {te.notes ? ` · ${te.notes}` : ''}
                    </ThemedText>
                  </View>
                </AppCard>
              );
            })}

            {error ? (
              <ThemedText type="small" themeColor="statusExpired">
                {error}
              </ThemedText>
            ) : null}

            <View style={styles.actionsGrid}>
              <View style={styles.actionItem}>
                <AppButton label="Modifica" onPress={() => setMode('edit')} variant="outline" fullWidth disabled={saving} />
              </View>
              <View style={styles.actionItem}>
                <AppButton label="Duplica" onPress={handleDuplicate} variant="outline" fullWidth disabled={saving} />
              </View>
              <View style={styles.actionItem}>
                <AppButton label="Sposta in altra cartella" onPress={() => setShowMovePicker(true)} variant="outline" fullWidth disabled={saving} />
              </View>
              <View style={styles.actionItem}>
                <AppButton label="Elimina" onPress={handleDelete} variant="outline" fullWidth disabled={saving} />
              </View>
            </View>

            {assigning ? (
              <AppCard style={styles.assignCard}>
                <ThemedText type="smallBold">Assegna a cliente</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Solo i clienti active possono ricevere una nuova scheda. Verrà creata una copia indipendente di questo modello.
                </ThemedText>
                {activeClients.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    Nessun cliente active al momento.
                  </ThemedText>
                ) : (
                  <View style={styles.chipsRow}>
                    {activeClients.map((client) => {
                      const active = client.id === assignClientId;
                      return (
                        <Pressable
                          key={client.id}
                          onPress={() => setAssignClientId(client.id)}
                          accessibilityRole="button"
                          accessibilityLabel={`Scegli ${clientFullName(client)}`}
                          style={[
                            styles.chip,
                            { backgroundColor: active ? theme.primary : theme.background, borderColor: active ? theme.primary : theme.border },
                          ]}>
                          <ThemedText type="small" themeColor={active ? 'onPrimary' : 'text'}>
                            {clientFullName(client)}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
                {assignError ? (
                  <ThemedText type="small" themeColor="statusExpired">
                    {assignError}
                  </ThemedText>
                ) : null}
                {assignBusy ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator />
                    <ThemedText type="small" themeColor="textSecondary">
                      Creazione scheda…
                    </ThemedText>
                  </View>
                ) : null}
                <View style={styles.confirmationActions}>
                  <View style={styles.confirmationActionItem}>
                    <AppButton
                      label="Annulla"
                      onPress={() => {
                        setAssigning(false);
                        setAssignClientId(null);
                        setAssignError('');
                      }}
                      variant="outline"
                      fullWidth
                      disabled={assignBusy}
                    />
                  </View>
                  <View style={styles.confirmationActionItem}>
                    <AppButton label="Conferma assegnazione" onPress={handleConfirmAssign} fullWidth disabled={!assignClientId || assignBusy} />
                  </View>
                </View>
              </AppCard>
            ) : (
              <AppButton
                label="Assegna a cliente"
                onPress={() => {
                  setAssignedConfirmation(null);
                  setAssignError('');
                  setAssignClientId(null);
                  setAssigning(true);
                }}
                size="lg"
                fullWidth
              />
            )}
          </>
        )}
      </ScrollView>

      <TemplateFolderPickerModal
        visible={showMovePicker}
        folders={folders}
        selectedFolderId={template?.folderId ?? null}
        onCancel={() => setShowMovePicker(false)}
        onSelect={handleMove}
      />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  hero: {
    gap: Spacing.two,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  confirmationCard: {
    gap: Spacing.two,
  },
  confirmationActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  confirmationActionItem: {
    flex: 1,
    minWidth: 0,
  },
  sectionHeader: {
    marginTop: Spacing.two,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  exercisePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    height: 52,
    width: 52,
    backgroundColor: 'rgba(154,165,160,0.16)',
  },
  exerciseCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  actionItem: {
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 0,
  },
  assignCard: {
    gap: Spacing.two,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: 8,
    maxWidth: '100%',
  },
});
