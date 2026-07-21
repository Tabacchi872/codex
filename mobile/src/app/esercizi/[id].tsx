import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { ExerciseAttachments } from '@/components/exercise-attachments';
import { ExerciseHistory } from '@/components/exercise-history';
import { ExerciseThumbnail } from '@/components/exercise-thumbnail';
import { ExerciseSetLogger } from '@/components/exercise-set-logger';
import { ExerciseVideoPlayer } from '@/components/exercise-video-player';
import { ExerciseVideoUploadControl } from '@/components/exercise-video-upload';
import { Pill } from '@/components/pill';
import { PlaceholderBanner } from '@/components/placeholder-banner';
import { RestTimer } from '@/components/rest-timer';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { ThemedTextInput } from '@/components/themed-text-input';
import { ThemedView } from '@/components/themed-view';
import { BackHeader, UserAvatar } from '@/components/ui';
import { YMoveExercisePicker, type YmoveVideoLinkSelection } from '@/components/ymove-exercise-picker';
import { YMoveVideoPlayer } from '@/components/ymove-video-player';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useExerciseResolver } from '@/hooks/use-exercise-resolver';
import { useTheme } from '@/hooks/use-theme';
import { clientFullName, getClientById } from '@/lib/client-helpers';
import { invalidateExerciseVideoInfo } from '@/lib/exercise-video-info-cache';
import {
  findExerciseVideoLinkByYmoveId,
  getCurrentCoachIdForUpload,
  getExerciseVideo,
  linkExerciseVideoToYmove,
  unlinkExerciseVideoFromYmove,
} from '@/lib/exercise-video-service';
import { updateCustomExerciseText, upsertExerciseTextOverride } from '@/lib/fitcoach-exercises-service';
import { supabaseConfig } from '@/lib/supabase';
import { getWorkoutEntryLockLabel, isWorkoutExerciseCompleted, isWorkoutSessionCompleted } from '@/lib/workout-progress';
import { useAuthStore } from '@/store/auth-store';
import { useClientStore } from '@/store/client-store';
import { useTrainingStore } from '@/store/training-store';

const DIFFICULTY_LABEL: Record<string, string> = {
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  advanced: 'Avanzato',
};

type InfoTab = 'esecuzione' | 'descrizione';

export default function EsercizioDettaglioScreen() {
  const { id, planId, clientId: clientIdParam, returnTo } = useLocalSearchParams<{
    id: string;
    planId?: string;
    clientId?: string;
    returnTo?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const compactLayout = width < 370;
  const workoutPlans = useTrainingStore((s) => s.workoutPlans);
  const clients = useClientStore((s) => s.clients);
  const currentRole = useAuthStore((s) => s.currentRole);
  const currentClientId = useAuthStore((s) => s.currentClientId);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [infoTab, setInfoTab] = useState<InfoTab>('esecuzione');
  const [restToken, setRestToken] = useState<number>();
  // Video reale caricato su Supabase Storage (fase 2026-07-11): null finche'
  // non risolto o se nessun video esiste per il visualizzatore corrente (RLS
  // decide cosa e' visibile — coach vede il proprio, cliente quello del
  // proprio coach). Ha sempre priorita' sul videoUrl demo statico di
  // exercise-library.ts una volta noto, ma finche' e' null si ricade su
  // quest'ultimo (mai un player vuoto se esiste un fallback dimostrativo).
  const [remoteVideoUrl, setRemoteVideoUrl] = useState<string | null>(null);
  // Collegamento YMove su un esercizio ESISTENTE (locale storico o FitCoach
  // custom), 2026-07-13: alternativo al file caricato sopra, mai entrambi.
  const [remoteYmoveExerciseId, setRemoteYmoveExerciseId] = useState<string | null>(null);
  const [remoteYmoveSlug, setRemoteYmoveSlug] = useState<string | null>(null);
  const [showYMoveVideoPicker, setShowYMoveVideoPicker] = useState(false);
  const [videoLinkBusy, setVideoLinkBusy] = useState(false);
  const [videoLinkError, setVideoLinkError] = useState('');
  const [duplicateExerciseId, setDuplicateExerciseId] = useState<string | null>(null);

  // Testi italiani modificabili (2026-07-13) — solo per esercizi FitCoach su
  // Supabase (custom/ymove): i 44 storici locali restano di sola lettura,
  // nessuna riga DB su cui persistere una modifica.
  const [editingText, setEditingText] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [technicalNotesDraft, setTechnicalNotesDraft] = useState('');
  const [savingText, setSavingText] = useState(false);
  const [textError, setTextError] = useState('');

  useEffect(() => {
    if (!supabaseConfig.isConfigured) return;
    let cancelled = false;
    getExerciseVideo(id).then((result) => {
      if (cancelled || !result.ok) return;
      if (!result.data) {
        setRemoteVideoUrl(null);
        setRemoteYmoveExerciseId(null);
        setRemoteYmoveSlug(null);
      } else if (result.data.source === 'ymove') {
        setRemoteVideoUrl(null);
        setRemoteYmoveExerciseId(result.data.ymoveExerciseId);
        setRemoteYmoveSlug(result.data.ymoveSlug);
      } else {
        setRemoteVideoUrl(result.data.videoUrl);
        setRemoteYmoveExerciseId(null);
        setRemoteYmoveSlug(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const { resolve: resolveExercise, registerExercise } = useExerciseResolver();
  const exercise = resolveExercise(id);

  // Sincronizza le bozze testo quando l'esercizio (ri)diventa disponibile —
  // stesso principio del video sopra: l'oggetto puo' arrivare async (fetch
  // Supabase per esercizi custom/ymove) dopo il primo render.
  useEffect(() => {
    if (!exercise) return;
    setNameDraft(exercise.name);
    setDescriptionDraft(exercise.description);
    setTechnicalNotesDraft(exercise.technicalNotes);
  }, [exercise?.id, exercise?.name, exercise?.description, exercise?.technicalNotes]);

  if (!exercise) {
    return (
      <ScreenBackground>
        <ThemedView style={styles.notFound}>
          <ThemedText type="default">Esercizio non trovato.</ThemedText>
        </ThemedView>
      </ScreenBackground>
    );
  }

  // Associa/sostituisce il video di QUESTO esercizio con un video YMove
  // (mai un URL salvato: solo ymove_exercise_id/ymove_slug, il video resta
  // sempre richiesto live). Controllo anti-duplicati PRIMA di salvare: se lo
  // stesso video e' gia' collegato a un ALTRO esercizio di questo coach, non
  // si sovrascrive silenziosamente — si mostra quale esercizio lo usa gia'.
  async function handleVideoLinkSelected(selection: YmoveVideoLinkSelection) {
    setShowYMoveVideoPicker(false);
    setVideoLinkError('');
    setDuplicateExerciseId(null);
    if (!exercise) return;

    const coachId = await getCurrentCoachIdForUpload();
    if (!coachId) {
      setVideoLinkError('Nessuna sessione coach reale trovata.');
      return;
    }

    setVideoLinkBusy(true);
    const existingLink = await findExerciseVideoLinkByYmoveId(coachId, selection.ymoveExerciseId);
    if (existingLink.ok && existingLink.data && existingLink.data.exerciseId !== exercise.id) {
      setVideoLinkBusy(false);
      setDuplicateExerciseId(existingLink.data.exerciseId);
      return;
    }

    const result = await linkExerciseVideoToYmove(coachId, exercise.id, selection.ymoveExerciseId, selection.ymoveSlug);
    setVideoLinkBusy(false);
    if (!result.ok) {
      setVideoLinkError(result.message);
      return;
    }
    invalidateExerciseVideoInfo(exercise.id);
    setRemoteYmoveExerciseId(selection.ymoveExerciseId);
    setRemoteYmoveSlug(selection.ymoveSlug);
    setRemoteVideoUrl(null);
  }

  async function handleUnlinkYmoveVideo() {
    if (!exercise) return;
    const coachId = await getCurrentCoachIdForUpload();
    if (!coachId) {
      setVideoLinkError('Nessuna sessione coach reale trovata.');
      return;
    }
    setVideoLinkBusy(true);
    setVideoLinkError('');
    const result = await unlinkExerciseVideoFromYmove(coachId, exercise.id);
    setVideoLinkBusy(false);
    if (!result.ok) {
      setVideoLinkError(result.message);
      return;
    }
    invalidateExerciseVideoInfo(exercise.id);
    setRemoteYmoveExerciseId(null);
    setRemoteYmoveSlug(null);
  }

  // Modifica manuale dei testi italiani (name/description/technical_notes) —
  // solo per esercizi FitCoach su Supabase (custom/ymove): i 44 storici
  // locali non hanno una riga DB su cui salvare, quindi questa sezione non
  // viene mai mostrata per loro (vedi JSX sotto).
  //
  // 2026-07-13 (correzione): un esercizio 'custom' appartiene davvero a quel
  // coach, quindi si modifica direttamente (updateCustomExerciseText). Un
  // esercizio 'ymove' e' invece condiviso tra tutti i coach: non si tocca
  // MAI il testo globale (la RLS lo impedirebbe comunque, solo il superadmin
  // puo' farlo), si crea/aggiorna sempre una personalizzazione PROPRIA
  // (upsertExerciseTextOverride) — altri coach continuano a vedere il testo
  // globale (o la LORO personalizzazione), mai influenzati da questa modifica.
  async function handleSaveItalianText() {
    if (!exercise) return;
    if (!nameDraft.trim()) {
      setTextError('Il nome non puo\' essere vuoto.');
      return;
    }
    setSavingText(true);
    setTextError('');

    if (exercise.source === 'custom') {
      const result = await updateCustomExerciseText(exercise.id, {
        name: nameDraft,
        description: descriptionDraft,
        technicalNotes: technicalNotesDraft,
      });
      setSavingText(false);
      if (!result.ok) {
        setTextError(result.message);
        return;
      }
      registerExercise(result.data);
      setEditingText(false);
      return;
    }

    const coachId = await getCurrentCoachIdForUpload();
    if (!coachId) {
      setSavingText(false);
      setTextError('Nessuna sessione coach reale trovata.');
      return;
    }
    const result = await upsertExerciseTextOverride(coachId, exercise.id, {
      name: nameDraft,
      description: descriptionDraft,
      technicalNotes: technicalNotesDraft,
    });
    setSavingText(false);
    if (!result.ok) {
      setTextError(result.message);
      return;
    }
    registerExercise({
      ...exercise,
      name: nameDraft.trim(),
      description: descriptionDraft.trim(),
      technicalNotes: technicalNotesDraft.trim(),
    });
    setEditingText(false);
  }

  // Un cliente vede solo la propria assegnazione, mai quella di altri clienti.
  const allAssignments = workoutPlans.flatMap((plan) =>
    plan.exercises.filter((we) => we.exerciseId === exercise.id).map((we) => ({ plan, workoutExercise: we }))
  );

  // Si entra qui in due modi distinti, per ENTRAMBI i ruoli (schede/[id].tsx
  // e' condivisa da coach e cliente e passa sempre planId+clientId dalla riga
  // Supabase gia' caricata, mai da un nome o un indice — vedi openExerciseDetail
  // li'):
  // - da una sessione/scheda specifica (Clienti -> cliente -> Schede ->
  //   esercizio per il coach; Workout -> sessione -> esercizio per il
  //   cliente): la schermata deve mostrare SOLO quella sessione, MAI un
  //   selettore, MAI un'aggregazione di schede passate/future con lo stesso
  //   esercizio — anche quando appartengono allo stesso identico cliente
  //   (bug reale corretto qui: prima il ramo cliente ignorava planId e
  //   filtrava `allAssignments` solo per clientId, mostrando un chip
  //   duplicato con lo stesso nome per ogni scheda passata/attuale/futura
  //   contenente l'esercizio, e "selected" poteva finire su una scheda
  //   diversa da quella realmente aperta). La chiave autorevole e' la
  //   combinazione piano+esercizio (ogni scheda ha un solo giorno,
  //   day_order=1, quindi equivale a piano/giorno/esercizio). Per il coach
  //   clientId resta verificato contro il client_id reale del piano
  //   (clientIdParam da solo non e' mai attendibile); per il cliente si usa
  //   sempre currentClientId (derivato dalla sessione autenticata), mai il
  //   parametro URL.
  // - dal catalogo esercizi generico (/esercizi, coach-only, nessun planId):
  //   nessuna sessione da proteggere, resta la vista "chi ce l'ha assegnato"
  //   — un chip per CLIENTE (deduplicato per clientId, mai per nome: due
  //   clienti omonimi restano due chip distinti; un solo cliente con lo
  //   stesso esercizio in piu' schede non deve generare piu' chip identici),
  //   mai aprendo il logger dei carichi da li' (vedi sotto).
  const isSessionContext = Boolean(planId);
  const isCoachSessionContext = currentRole === 'coach' && isSessionContext;
  let assignments = allAssignments;
  let sessionContextInvalid = false;

  if (isSessionContext) {
    const sessionContextPlan = workoutPlans.find((p) => p.id === planId);
    const sessionContextExercise = sessionContextPlan?.exercises.find((we) => we.exerciseId === exercise.id);
    const expectedClientId = currentRole === 'cliente' ? currentClientId : clientIdParam;
    if (sessionContextPlan && sessionContextExercise && expectedClientId && sessionContextPlan.clientId === expectedClientId) {
      assignments = [{ plan: sessionContextPlan, workoutExercise: sessionContextExercise }];
    } else {
      assignments = [];
      sessionContextInvalid = true;
    }
  } else {
    const scoped = currentRole === 'cliente' ? allAssignments.filter((a) => a.plan.clientId === currentClientId) : allAssignments;
    const seenClientIds = new Set<string>();
    assignments = scoped.filter((a) => {
      if (seenClientIds.has(a.plan.clientId)) return false;
      seenClientIds.add(a.plan.clientId);
      return true;
    });
  }

  const selected = assignments[selectedIndex] ?? assignments[0] ?? null;
  const selectedClient = selected ? getClientById(clients, selected.plan.clientId) : null;
  const selectedSessionLocked = selected ? isWorkoutSessionCompleted(selected.plan) : false;
  const selectedExerciseLocked = selected ? isWorkoutExerciseCompleted(selected.plan, selected.workoutExercise.id) : false;

  // Sessione richiesta non valida (piano non trovato, esercizio non presente
  // nel piano, o client_id non corrispondente): blocca la schermata e riporta
  // a una route consentita per il ruolo corrente, MAI una scelta automatica
  // del primo cliente/assignment disponibile. Per il coach questo resta
  // /clienti (route coach-only); per il cliente deve restare nel proprio
  // spazio (/workout, route cliente-only) — mai la stessa destinazione per
  // entrambi, altrimenti l'uno o l'altro ruolo finirebbe su una route a cui
  // AuthGate non gli consente accesso.
  if (sessionContextInvalid) {
    const isClient = currentRole === 'cliente';
    return (
      <ScreenBackground>
        <ThemedView style={styles.notFound}>
          <ThemedText type="default">{isClient ? 'Sessione non valida.' : 'Cliente non valido per questa sessione.'}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.blockingSubtext}>
            {isClient ? "Torna al tuo workout e riapri l'esercizio da li'." : "Torna alla lista clienti e riapri la scheda da li'."}
          </ThemedText>
          <Pressable onPress={() => router.replace(isClient ? '/workout' : '/clienti')} hitSlop={6}>
            <View style={[styles.blockingButton, { backgroundColor: theme.primary }]}>
              <ThemedText type="smallBold" themeColor="onPrimary">
                {isClient ? 'Torna al workout' : 'Torna alla lista clienti'}
              </ThemedText>
            </View>
          </Pressable>
        </ThemedView>
      </ScreenBackground>
    );
  }

  // Navigazione sequenziale tra gli esercizi della STESSA scheda: attiva solo
  // quando si arriva qui da schede/[id].tsx (client, planId nell'URL), mai per
  // il coach e mai se l'esercizio viene aperto da un altro punto dell'app
  // (dove "avanti/indietro nella scheda" non avrebbe senso).
  const sessionPlan = currentRole === 'cliente' && planId ? workoutPlans.find((p) => p.id === planId) : null;
  const sessionOrder = sessionPlan ? [...sessionPlan.exercises].sort((a, b) => a.order - b.order) : [];
  const sessionPosition = sessionOrder.findIndex((we) => we.exerciseId === exercise.id);
  const nextInSession = sessionPosition >= 0 ? sessionOrder[sessionPosition + 1] : undefined;
  const prevInSession = sessionPosition >= 0 ? sessionOrder[sessionPosition - 1] : undefined;
  const explicitReturnHref = getExplicitReturnHref(returnTo, planId);
  const fallbackHref = (explicitReturnHref ?? (currentRole === 'cliente' ? '/workout' : '/esercizi')) as Href;
  const hasYMoveVideo = Boolean((exercise.source === 'ymove' && exercise.ymoveExerciseId) || remoteYmoveExerciseId);
  const hasStandardVideo = Boolean(remoteVideoUrl ?? exercise.videoUrl ?? exercise.videoFile);
  const showVideoInHero = hasYMoveVideo || hasStandardVideo;

  function handleBack() {
    if (explicitReturnHref) {
      router.dismissTo(explicitReturnHref);
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(fallbackHref);
  }

  return (
    <ScreenBackground>
    <ScrollView
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Platform.OS === 'web' ? Spacing.four : insets.top + Spacing.two,
          paddingBottom: insets.bottom + BottomTabInset + Spacing.five,
        },
      ]}>
      <BackHeader
        title="Dettaglio esercizio"
        fallbackHref={fallbackHref}
        onBack={handleBack}
      />

      <Card style={styles.exerciseHero}>
        <View
          style={[
            styles.exerciseMediaFrame,
            showVideoInHero && styles.exerciseVideoFrame,
            { backgroundColor: showVideoInHero ? '#000' : theme.backgroundSelected, borderColor: theme.border },
          ]}>
          {exercise.source === 'ymove' && exercise.ymoveExerciseId ? (
            <YMoveVideoPlayer ymoveExerciseId={exercise.ymoveExerciseId} />
          ) : remoteYmoveExerciseId ? (
            <YMoveVideoPlayer ymoveExerciseId={remoteYmoveExerciseId} />
          ) : hasStandardVideo ? (
            <ExerciseVideoPlayer videoUrl={remoteVideoUrl ?? exercise.videoUrl} videoFile={exercise.videoFile} />
          ) : (
            <ExerciseThumbnail exercise={exercise} exerciseId={exercise.id} size={compactLayout ? 112 : 128} />
          )}
        </View>
        <View style={styles.exerciseHeroCopy}>
          <ThemedText type="subtitle" style={styles.exerciseTitle} numberOfLines={3} ellipsizeMode="tail">
            {exercise.name}
          </ThemedText>
          <View style={styles.badgeRow}>
            <Pill label={exercise.muscleGroup} />
            <Pill label={exercise.equipment} />
            <Pill label={DIFFICULTY_LABEL[exercise.difficulty] ?? exercise.difficulty} />
          </View>
        </View>
      </Card>

      {currentRole === 'coach' && supabaseConfig.isConfigured && exercise.source !== 'ymove' ? (
        <Card style={styles.coachToolsCard}>
          <ThemedText type="smallBold">Video YMove</ThemedText>
          {remoteYmoveExerciseId ? (
            <View style={styles.coachToolsRow}>
              <Pressable onPress={() => setShowYMoveVideoPicker(true)} disabled={videoLinkBusy} hitSlop={6}>
                <ThemedText type="small" style={{ color: theme.primary }}>
                  Sostituisci video
                </ThemedText>
              </Pressable>
              <Pressable onPress={handleUnlinkYmoveVideo} disabled={videoLinkBusy} hitSlop={6}>
                <ThemedText type="small" themeColor="statusExpired">
                  Rimuovi collegamento YMove
                </ThemedText>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setShowYMoveVideoPicker(true)} disabled={videoLinkBusy}>
              <View style={[styles.addButton, { borderColor: theme.primary }]}>
                <ThemedText type="smallBold" style={{ color: theme.primary }}>
                  Associa video YMove
                </ThemedText>
              </View>
            </Pressable>
          )}
          {videoLinkBusy ? <ActivityIndicator /> : null}
          {videoLinkError ? (
            <ThemedText type="small" themeColor="statusExpired">
              {videoLinkError}
            </ThemedText>
          ) : null}
          {duplicateExerciseId ? (
            <View style={styles.coachToolsRow}>
              <ThemedText type="small" themeColor="statusExpired">
                Questo video e' gia' associato a "{resolveExercise(duplicateExerciseId)?.name ?? duplicateExerciseId}".
              </ThemedText>
              <Pressable onPress={() => router.push(`/esercizi/${duplicateExerciseId}`)} hitSlop={6}>
                <ThemedText type="small" style={{ color: theme.primary }}>
                  Vai a quell'esercizio
                </ThemedText>
              </Pressable>
            </View>
          ) : null}
          {showYMoveVideoPicker ? (
            <YMoveExercisePicker
              mode="link-video"
              onVideoLinkSelected={handleVideoLinkSelected}
              onClose={() => setShowYMoveVideoPicker(false)}
            />
          ) : null}
          {/* Nessun upload/collegamento contemporaneo: associare un video YMove
              sostituisce sempre un eventuale file caricato (vedi
              linkExerciseVideoToYmove/uploadExerciseVideo). */}
          {!remoteYmoveExerciseId ? (
            <ExerciseVideoUploadControl
              exerciseId={exercise.id}
              hasExistingVideo={Boolean(remoteVideoUrl)}
              onUploaded={(url) => {
                invalidateExerciseVideoInfo(exercise.id);
                setRemoteVideoUrl(url);
              }}
            />
          ) : null}
        </Card>
      ) : null}

      <View style={styles.infoTabsRow}>
        <InfoTabButton label="Esecuzione" active={infoTab === 'esecuzione'} onPress={() => setInfoTab('esecuzione')} />
        <InfoTabButton label="Descrizione" active={infoTab === 'descrizione'} onPress={() => setInfoTab('descrizione')} />
      </View>
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          {infoTab === 'esecuzione' ? exercise.technicalNotes : exercise.description}
        </ThemedText>
      </Card>

      {currentRole === 'coach' && (exercise.source === 'custom' || exercise.source === 'ymove') ? (
        <Card style={styles.coachToolsCard}>
          <View style={styles.coachToolsHeader}>
            <ThemedText type="smallBold">Testi italiani</ThemedText>
            {!editingText ? (
              <Pressable onPress={() => setEditingText(true)} hitSlop={6}>
                <ThemedText type="small" style={{ color: theme.primary }}>
                  Modifica
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
          {editingText ? (
            <>
              <ThemedTextInput value={nameDraft} onChangeText={setNameDraft} placeholder="Nome esercizio" />
              <ThemedTextInput
                value={descriptionDraft}
                onChangeText={setDescriptionDraft}
                placeholder="Descrizione"
                multiline
              />
              <ThemedTextInput
                value={technicalNotesDraft}
                onChangeText={setTechnicalNotesDraft}
                placeholder="Note tecniche / esecuzione"
                multiline
              />
              {textError ? (
                <ThemedText type="small" themeColor="statusExpired">
                  {textError}
                </ThemedText>
              ) : null}
              <View style={styles.coachToolsRow}>
                <Pressable
                  onPress={() => {
                    setEditingText(false);
                    setTextError('');
                    setNameDraft(exercise.name);
                    setDescriptionDraft(exercise.description);
                    setTechnicalNotesDraft(exercise.technicalNotes);
                  }}
                  disabled={savingText}
                  hitSlop={6}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Annulla
                  </ThemedText>
                </Pressable>
                <Pressable onPress={handleSaveItalianText} disabled={savingText}>
                  <View style={[styles.saveTextButton, { backgroundColor: theme.primary, opacity: savingText ? 0.7 : 1 }]}>
                    {savingText ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <ThemedText type="small" themeColor="onPrimary">
                        Salva
                      </ThemedText>
                    )}
                  </View>
                </Pressable>
              </View>
            </>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              {exercise.source === 'ymove'
                ? "Nome, descrizione e note sono modificabili: la modifica crea una tua personalizzazione, senza cambiare il testo che vedono gli altri coach."
                : 'Nome, descrizione e note sono modificabili.'}
            </ThemedText>
          )}
        </Card>
      ) : null}

      {assignments.length === 0 ? (
        <PlaceholderBanner text="Esercizio non ancora assegnato in nessuna scheda cliente: timer e storico si attivano quando fa parte di una scheda." />
      ) : (
        <>
          {!isSessionContext && assignments.length > 1 && (
            <View style={styles.chipsRow}>
              {assignments.map((a, index) => {
                const client = getClientById(clients, a.plan.clientId);
                const active = index === selectedIndex;
                return (
                  <Pressable key={a.workoutExercise.id} onPress={() => setSelectedIndex(index)}>
                    <View
                      style={[
                        styles.chip,
                        {
                          backgroundColor: active ? theme.primary : theme.backgroundElement,
                          borderColor: active ? theme.primary : theme.border,
                        },
                      ]}>
                      <ThemedText type="small" themeColor={active ? 'onPrimary' : 'text'}>
                        {client ? clientFullName(client) : 'Cliente'}
                      </ThemedText>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          {selected && (
            <>
              <Card>
                {isCoachSessionContext && selectedClient ? (
                  <View style={styles.sessionClientHeader}>
                    <UserAvatar
                      firstName={selectedClient.firstName}
                      lastName={selectedClient.lastName}
                      imageUrl={selectedClient.avatarUrl}
                      preset={selectedClient.avatarPreset}
                      size={40}
                    />
                    <View style={styles.sessionClientHeaderText}>
                      <ThemedText type="smallBold">{clientFullName(selectedClient)}</ThemedText>
                      <Pressable onPress={() => router.push(`/clienti/${selectedClient.id}`)} hitSlop={6}>
                        <ThemedText type="small" style={{ color: theme.primary }}>
                          Torna al cliente
                        </ThemedText>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <ThemedText type="smallBold">
                    Assegnato a {selectedClient ? clientFullName(selectedClient) : 'cliente'}
                  </ThemedText>
                )}
                <View style={[styles.summaryRow, compactLayout && styles.summaryRowCompact]}>
                  <SummaryStat icon="▦" label="Serie" value={String(selected.workoutExercise.sets)} />
                  <SummaryStat
                    icon="↻"
                    label="Ripetizioni"
                    value={
                      selected.workoutExercise.repsMin && selected.workoutExercise.repsMax
                        ? `${selected.workoutExercise.repsMin}–${selected.workoutExercise.repsMax}`
                        : String(selected.workoutExercise.reps)
                    }
                  />
                  <SummaryStat icon="⏱" label="Recupero" value={`${selected.workoutExercise.restSeconds}s`} />
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {selected.workoutExercise.targetWeight !== null
                    ? `Peso target: ${selected.workoutExercise.targetWeight} kg`
                    : 'A corpo libero'}
                </ThemedText>
                {selected.workoutExercise.notes ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    Nota: {selected.workoutExercise.notes}
                  </ThemedText>
                ) : null}
              </Card>

              <RestTimer restSeconds={selected.workoutExercise.restSeconds} autoStartToken={restToken} />

              {selectedClient && (
                <ExerciseHistory clientId={selectedClient.id} exerciseId={exercise.id} workoutPlanId={selected.plan.id} />
              )}

              {(currentRole === 'cliente' || isCoachSessionContext) && selectedClient && (
                <>
                  {selectedExerciseLocked ? (
                    <Card style={styles.lockedStateCard}>
                      <Pill label={getWorkoutEntryLockLabel(selected.plan, selected.workoutExercise.id)} />
                      <ThemedText type="small" themeColor="textSecondary">
                        I dati di questo {selectedSessionLocked ? 'workout' : 'esercizio'} completato non possono essere modificati.
                      </ThemedText>
                    </Card>
                  ) : (
                    <>
                      <ExerciseSetLogger
                        clientId={selectedClient.id}
                        exerciseId={exercise.id}
                        workoutExerciseId={selected.workoutExercise.id}
                        workoutPlanId={selected.plan.id}
                        plannedSets={selected.workoutExercise.sets}
                        restSeconds={selected.workoutExercise.restSeconds}
                        onRequestRest={() => setRestToken(Date.now())}
                      />
                      {currentRole === 'cliente' ? (
                        <ExerciseAttachments clientId={selectedClient.id} workoutExerciseId={selected.workoutExercise.id} />
                      ) : null}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      {sessionPlan && sessionPosition >= 0 && (
        <View style={[styles.sessionNav, compactLayout && styles.sessionNavCompact, { borderTopColor: theme.border }]}>
          <Pressable
            onPress={() => prevInSession && router.setParams({ id: prevInSession.exerciseId, planId: sessionPlan.id })}
            disabled={!prevInSession}>
            <ThemedText type="title" style={[styles.navArrow, !prevInSession && styles.navArrowDisabled]}>
              ‹
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={sessionPlan.sessionStatus === 'completed' ? undefined : () => router.push(`/schede/${sessionPlan.id}`)}
            disabled={sessionPlan.sessionStatus === 'completed'}
            style={styles.sessionNavCenter}>
            <View style={[styles.sessionNavButton, { backgroundColor: theme.primary, opacity: sessionPlan.sessionStatus === 'completed' ? 0.72 : 1 }]}>
              <ThemedText type="smallBold" themeColor="onPrimary">
                {sessionPlan.sessionStatus === 'completed' ? 'Workout completato' : sessionPlan.startedAt ? 'Continua' : 'Inizia allenamento'}
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {sessionPosition + 1}/{sessionOrder.length}
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={() => nextInSession && router.setParams({ id: nextInSession.exerciseId, planId: sessionPlan.id })}
            disabled={!nextInSession}>
            <ThemedText type="title" style={[styles.navArrow, { color: theme.primary }, !nextInSession && styles.navArrowDisabled]}>
              ›
            </ThemedText>
          </Pressable>
        </View>
      )}
    </ScrollView>
    </ScreenBackground>
  );
}

function getParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isSafeInternalHref(value: string) {
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('://');
}

function getExplicitReturnHref(returnTo: string | string[] | undefined, planId: string | string[] | undefined): Href | null {
  const returnToValue = getParamValue(returnTo)?.trim();
  if (returnToValue && isSafeInternalHref(returnToValue)) {
    return returnToValue as Href;
  }

  const planIdValue = getParamValue(planId)?.trim();
  if (!planIdValue) {
    return null;
  }

  return { pathname: '/schede/[id]', params: { id: planIdValue } };
}

function InfoTabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.infoTabButton}>
      <View style={[styles.infoTabPill, { backgroundColor: active ? theme.primary : theme.backgroundElement, borderColor: active ? theme.primary : theme.border }]}>
        <ThemedText type="smallBold" themeColor={active ? 'onPrimary' : 'textSecondary'}>
          {label}
        </ThemedText>
      </View>
    </Pressable>
  );
}

function SummaryStat({ icon, label, value }: { icon: string; label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.summaryStat}>
      <ThemedText style={[styles.summaryIcon, { color: theme.primary }]}>{icon}</ThemedText>
      <ThemedText type="smallBold" style={styles.summaryValue}>
        {value}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  exerciseHero: {
    gap: Spacing.three,
    minWidth: 0,
  },
  exerciseMediaFrame: {
    alignItems: 'center',
    aspectRatio: 16 / 9,
    borderRadius: Radius.lg,
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    width: '100%',
  },
  exerciseVideoFrame: {
    alignItems: 'stretch',
    justifyContent: 'flex-start',
  },
  exerciseHeroCopy: {
    gap: Spacing.two,
    minWidth: 0,
  },
  exerciseTitle: {
    fontSize: 29,
    letterSpacing: 0,
    lineHeight: 35,
    minWidth: 0,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  coachToolsCard: {
    gap: Spacing.two,
  },
  coachToolsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  coachToolsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
    alignItems: 'center',
  },
  addButton: {
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    padding: Spacing.three,
    alignItems: 'center',
  },
  lockedStateCard: {
    gap: Spacing.one,
  },
  saveTextButton: {
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  infoTabsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginBottom: -Spacing.two,
  },
  infoTabButton: {
    flex: 1,
  },
  infoTabPill: {
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.two,
  },
  summaryRowCompact: {
    flexWrap: 'wrap',
    rowGap: Spacing.three,
  },
  summaryStat: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
    minWidth: 82,
  },
  summaryIcon: {
    fontSize: 18,
  },
  summaryValue: {
    fontSize: 18,
  },
  sessionClientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  sessionClientHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  blockingSubtext: {
    textAlign: 'center',
    paddingHorizontal: Spacing.four,
  },
  blockingButton: {
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.three,
    marginTop: Spacing.two,
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  sessionNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.three,
    marginTop: Spacing.two,
  },
  sessionNavCompact: {
    gap: Spacing.one,
  },
  navArrow: {
    fontSize: 32,
    lineHeight: 36,
    paddingHorizontal: Spacing.two,
  },
  navArrowDisabled: {
    opacity: 0.25,
  },
  sessionNavCenter: {
    alignItems: 'center',
    gap: 4,
  },
  sessionNavButton: {
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
});
