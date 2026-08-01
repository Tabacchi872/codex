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
import { AppBadge, AppButton, AppCard, AppPressableCard, BackHeader } from '@/components/ui';
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
  type WorkoutTemplateSaveInput,
} from '@/lib/workout-plan-service';
import { useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import { useTrainingStore } from '@/store/training-store';
import type { TemplateFolder, WorkoutTemplate } from '@/types/template-library';

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
// duplica/sposta/elimina + "Assegna a cliente". Per un modello DI SISTEMA
// (isSystem, letto da tutti i coach) le uniche azioni disponibili sono
// "Duplica nella mia libreria" e "Assegna a cliente" — mai modifica/sposta/
// elimina, ne' lato UI ne' lato server (RLS le rifiuta comunque). L'unico
// punto di tutta la libreria modelli in cui e' legittimo leggere
// useClientStore — e SOLO per popolare l'elenco di clienti active tra cui
// scegliere, mai per pre-selezionare o aprire automaticamente qualcosa.
export default function ModelloDettaglioScreen() {
  const { templateId } = useLocalSearchParams<{ templateId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { resolve: resolveExercise } = useExerciseResolver();
  const isCoach = useAuthStore((s) => s.currentRole !== 'cliente');
  const clients = useClientStore((s) => s.clients);
  const addWorkoutPlan = useTrainingStore((s) => s.addWorkoutPlan);

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
  const [assignedConfirmation, setAssignedConfirmation] = useState<{ clientId: string; clientName: string; dayCount: number } | null>(null);

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

  async function handleSaveEdit(input: Omit<WorkoutTemplateSaveInput, 'id'>) {
    if (!template) return;
    setSaving(true);
    setError('');
    const result = await saveWorkoutTemplate({ ...input, id: template.id });
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
      if (__DEV__) {
        console.error('TEMPLATE_ASSIGN_ERROR', { templateId: template.id, isSystem: template.isSystem, clientId: assignClientId, message: result.message });
      }
      setAssignError(result.message);
      return;
    }
    // Bug reale corretto (2026-07-21): questa schermata leggeva le nuove
    // schede solo per la conferma a video (getWorkoutPlanById dentro
    // assignWorkoutTemplateToClient), senza mai scriverle nello store locale
    // useTrainingStore — l'unica fonte letta da Clienti -> [id] -> Schede
    // (clienti/[id].tsx). La scheda esisteva davvero su Supabase (l'RPC e la
    // rilettura post-insert funzionavano), ma restava invisibile nella lista
    // cliente finche' qualcos'altro non forzava un refresh completo (evento
    // Realtime, se attivo, o il mount di un'altra schermata). Stesso pattern
    // gia' usato da schede/new.tsx/schede/modelli/[id].tsx dopo un
    // salvataggio riuscito: aggiornare subito lo store locale, mai fare
    // affidamento solo su Realtime per il proprio salvataggio.
    result.data.forEach((plan) => addWorkoutPlan(plan));
    if (__DEV__) {
      const exerciseCount = result.data.reduce((sum, plan) => sum + plan.exercises.length, 0);
      console.log('TEMPLATE_ASSIGN_SUCCESS', {
        templateId: template.id,
        isSystem: template.isSystem,
        clientId: assignClientId,
        workoutPlanIds: result.data.map((plan) => plan.id),
        dayCount: result.data.length,
        exerciseCount,
      });
    }
    const client = activeClients.find((c) => c.id === assignClientId);
    setAssigning(false);
    setAssignClientId(null);
    setAssignedConfirmation({ clientId: assignClientId, clientName: client ? clientFullName(client) : 'cliente', dayCount: result.data.length });
  }

  const folderName = template?.folderId ? (folders.find((f) => f.id === template.folderId)?.name ?? 'Cartella') : 'Senza categoria';
  const backHref = template?.folderId ? (`/schede/cartella/${template.folderId}` as const) : '/schede';
  const totalExercises = template ? template.days.reduce((sum, d) => sum + d.exercises.length, 0) : 0;

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
        ) : mode === 'edit' && !template.isSystem ? (
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
                <AppBadge label={template.isSystem ? 'Modello professionale' : 'Modello personale'} tone={template.isSystem ? 'coral' : 'moss'} />
                {template.goal ? <AppBadge label={template.goal} tone="moss" /> : null}
                {template.level ? <AppBadge label={template.level} /> : null}
                {!template.isSystem ? <AppBadge label={folderName} /> : null}
              </View>
              <View style={styles.metaGrid}>
                {template.durationWeeks ? <MetaItem label="Durata" value={`${template.durationWeeks} settimane`} /> : null}
                {template.sessionsPerWeek ? <MetaItem label="Frequenza" value={`${template.sessionsPerWeek}x/settimana`} /> : null}
                {template.estimatedSessionMinutes ? <MetaItem label="Seduta" value={`${template.estimatedSessionMinutes} min`} /> : null}
                {template.equipment ? <MetaItem label="Attrezzatura" value={template.equipment} /> : null}
                {template.location ? <MetaItem label="Luogo" value={template.location} /> : null}
                {template.trainingStyle ? <MetaItem label="Stile" value={template.trainingStyle} /> : null}
                {template.muscleFocus ? <MetaItem label="Focus" value={template.muscleFocus} /> : null}
                {template.intensity ? <MetaItem label="Intensita'" value={template.intensity} /> : null}
              </View>
              {template.deloadWeek ? (
                <ThemedText type="small" themeColor="textSecondary">Include una settimana di scarico programmata.</ThemedText>
              ) : null}
              {template.progressionNotes ? (
                <ThemedText type="small" themeColor="textSecondary">Progressione: {template.progressionNotes}</ThemedText>
              ) : null}
              <ThemedText type="small" themeColor="textSecondary">
                {template.days.length} {template.days.length === 1 ? 'giorno' : 'giorni'} · {totalExercises} esercizi
              </ThemedText>
            </AppCard>

            {assignedConfirmation ? (
              <AppCard style={styles.confirmationCard}>
                <ThemedText type="smallBold">
                  {assignedConfirmation.dayCount} {assignedConfirmation.dayCount === 1 ? 'scheda assegnata' : 'schede assegnate'} a {assignedConfirmation.clientName}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  E' stata creata una copia indipendente di ogni giorno: modificare in futuro questo modello non cambierà le schede del cliente.
                </ThemedText>
                <View style={styles.confirmationActions}>
                  <View style={styles.confirmationActionItem}>
                    <AppButton label="Resta qui" onPress={() => setAssignedConfirmation(null)} variant="outline" fullWidth />
                  </View>
                  <View style={styles.confirmationActionItem}>
                    <AppButton
                      label="Vai al cliente"
                      onPress={() =>
                        router.push({ pathname: '/clienti/[id]', params: { id: assignedConfirmation.clientId, tab: 'schede' } })
                      }
                      fullWidth
                    />
                  </View>
                </View>
              </AppCard>
            ) : null}

            {template.days.map((day) => (
              <View key={day.id} style={styles.dayBlock}>
                <View style={styles.sectionHeader}>
                  <ThemedText type="subtitle">{day.name}</ThemedText>
                  {day.focus ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {day.focus}
                    </ThemedText>
                  ) : null}
                </View>
                {day.exercises.map((te) => {
                  const exercise = resolveExercise(te.exerciseId);
                  const exerciseName = exercise?.name ?? te.exerciseId;
                  return (
                    <AppPressableCard
                      key={te.id}
                      style={styles.exerciseRow}
                      accessibilityLabel={`Apri dettaglio esercizio ${exerciseName}`}
                      // Stesso identificatore (te.exerciseId, UUID o chiave
                      // legacy indifferentemente) e stessa route gia' usate da
                      // WorkoutTemplateForm.onOpenDetails (modalita' modifica
                      // di questa stessa schermata) e da workout-plan-form.tsx
                      // — nessun planId/clientId/workoutExerciseId: non e' una
                      // sessione reale, esercizi/[id].tsx apre correttamente la
                      // vista libreria generica quando planId e' assente.
                      onPress={() => router.push({ pathname: '/esercizi/[id]', params: { id: te.exerciseId } })}>
                      {exercise ? (
                        <ExerciseThumbnail exercise={exercise} exerciseId={exercise.id} size={52} />
                      ) : (
                        <View style={[styles.exercisePlaceholder, { backgroundColor: theme.backgroundElement }]}>
                          <Dumbbell size={20} color={theme.textSecondary} />
                        </View>
                      )}
                      <View style={styles.exerciseCopy}>
                        <ThemedText type="smallBold" numberOfLines={2}>
                          {exerciseName}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                          {te.sets} serie · {te.repsMin && te.repsMax ? `${te.repsMin}-${te.repsMax} rip.` : `${te.reps} rip.`} · recupero {te.restSeconds}s
                          {te.rpeRir ? ` · ${te.rpeRir}` : ''}
                          {te.notes ? ` · ${te.notes}` : ''}
                        </ThemedText>
                      </View>
                    </AppPressableCard>
                  );
                })}
              </View>
            ))}

            {error ? (
              <ThemedText type="small" themeColor="statusExpired">
                {error}
              </ThemedText>
            ) : null}

            <View style={styles.actionsGrid}>
              {template.isSystem ? (
                <View style={styles.actionItem}>
                  <AppButton label="Duplica nella mia libreria" onPress={handleDuplicate} variant="outline" fullWidth disabled={saving} />
                </View>
              ) : (
                <>
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
                </>
              )}
            </View>

            {assigning ? (
              <AppCard style={styles.assignCard}>
                <ThemedText type="smallBold">Assegna a cliente</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Solo i clienti active possono ricevere una nuova scheda. Verrà creata una copia indipendente per ciascun giorno del modello.
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
                      Creazione schede…
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

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
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
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  metaItem: {
    minWidth: 100,
    gap: 2,
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
  dayBlock: {
    gap: Spacing.two,
  },
  sectionHeader: {
    marginTop: Spacing.two,
    gap: 2,
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
