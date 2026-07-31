import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { SuperadminShell } from '@/components/superadmin-shell';
import { AppBadge, AppButton, AppCard, AppEmptyState, AppErrorState } from '@/components/ui';
import { supabase, supabaseConfig } from '@/lib/supabase';
import { AppSpacing, AppTextStyle, useAppTheme } from '@/theme';

const SOURCE_AUDIT_RUN_ID = 'b9916930-7479-42b6-a705-577128b14318';
const STATUSES = ['LINK_EXISTING', 'CREATE_NEW', 'REVIEW_POSSIBLE_DUPLICATE', 'EXCLUDE_NOT_RELEVANT', 'CONFLICT'] as const;
const REVIEW_FILTERS = ['all', 'safe_create', 'needs_review', 'linked', 'ymove_duplicate', 'translation_uncertain'] as const;
const SEMANTIC_ALGORITHM_VERSION = 'ymove-semantic-research-2026-07-31-v1';
const PILOT_IMPORT_RUN_ID = 'b2a8cb33-061b-489e-bbe5-c2fce38d0ecc';
const PILOT_EXTERNAL_EXERCISE_ID = '1158c681-55e9-4db0-bb73-3dab32d99aa5';
const PILOT_TARGET_KEY = 'legacy:bicipiti-curl-bilanciere';
const SEMANTIC_STATUSES = [
  'LINK_EXISTING_VERIFIED',
  'CREATE_NEW_RESEARCHED',
  'REVIEW_POSSIBLE_MATCH',
  'EXCLUDE_EDITORIAL_DUPLICATE',
  'RESEARCH_REQUIRED',
  'CONFLICT',
] as const;

type Classification = typeof STATUSES[number];
type ReviewFilter = typeof REVIEW_FILTERS[number];
type SemanticStatus = typeof SEMANTIC_STATUSES[number];
type ImportRun = {
  id: string;
  source_import_run_id: string | null;
  algorithm_version: string | null;
  run_mode: string | null;
  status: string;
  total_catalog: number;
  processed_count: number;
  link_existing_count: number;
  create_new_count: number;
  review_count: number;
  excluded_count: number;
  conflict_count: number;
  created_at: string;
  updated_at: string;
};
type Candidate = {
  external_exercise_id: string;
  ymove_title: string;
  proposed_italian_name: string | null;
  classification: Classification;
  existing_exercise_key: string | null;
  score: number | null;
  score_gap: number | null;
  reasons: string[];
  contradictions: string[];
  alternatives: Array<{ exerciseKey: string; name: string; score: number }>;
  translation_status: string;
  safe_create: boolean;
  decision: string | null;
  approved_italian_name: string | null;
  approved_existing_exercise_key: string | null;
  researched_italian_name?: string | null;
  researched_italian_aliases?: string[] | null;
  english_aliases?: string[] | null;
  research_status?: SemanticStatus | null;
  research_sources?: Array<{ title?: string; url?: string; term?: string; reason?: string }> | null;
  technical_fingerprint?: Record<string, unknown> | null;
  technical_variant?: Record<string, unknown> | null;
  match_reason?: string | null;
  contradiction_flags?: string[] | null;
  compared_existing_exercise_key?: string | null;
  primary_duplicate_external_id?: string | null;
  candidate_rejected_reason?: string | null;
  source_confidence?: number | null;
  semantic_review_status?: SemanticStatus | null;
  research_algorithm_version?: string | null;
  metadata_match?: {
    duplicateYmove?: boolean;
    metadataTriplet?: boolean;
    bestFitKey?: string | null;
  } | null;
  proposed_payload?: {
    primary_muscles?: string[];
    equipment?: string[];
  } | null;
};
type FunctionResult =
  | {
      ok: true;
      importRunId?: string;
      run?: ImportRun | null;
      results?: Candidate[];
      total?: number;
      processed?: number;
      nextCursor?: number;
      completed?: boolean;
      reused?: boolean;
      newSafeCreate?: number;
      linkExisting?: number;
      totalWithVideo?: number;
      safeCreateTotal?: number;
      approvedNewCount?: number;
      approvedLinkCount?: number;
      missingApprovedName?: number;
      duplicateExternalIds?: number;
      duplicatePrimaryTargets?: number;
      invalidCandidates?: number;
      pilotPreflight?: { approvedLinks: number; approvedNew: number; totalPlanned: number; targetExerciseKey: string; duplicatePrimaryTarget: boolean; contradictions: string[] };
      approvedLinks?: number;
      approvedNew?: number;
      targetExerciseKey?: string;
      duplicatePrimaryTarget?: boolean;
      contradictions?: string[];
      externalExerciseIds?: string[];
      batchCount?: number;
      totalPlanned?: number;
      batchSize?: number;
      result?: { processed?: number; createdNew?: number; linkedExisting?: number; idempotent?: number; remaining?: number };
      success?: boolean;
      created?: number;
      linked?: number;
      alreadyPresent?: number;
      failed?: number;
      remaining?: number;
      summary?: SemanticSummary;
      candidates?: Candidate[];
      updated?: number;
      counts?: Record<string, number>;
      candidate?: { externalExerciseId: string; approvedItalianName: string; approvedItalianNameConfirmedAt?: string | null; reviewedAt: string; decision: string | null };
    }
  | { ok: false; code: string; message: string; dbCode?: string | null; dbMessage?: string | null };

type SemanticSummary = {
  totalCandidates: number;
  researched: number;
  remaining: number;
  linkVerified: number;
  createNewResearched: number;
  reviewPossibleMatch: number;
  editorialDuplicate: number;
  researchRequired: number;
  conflict: number;
};

type CandidateDecision = 'approved_new' | 'approved_link' | 'excluded' | 'deferred' | 'rejected';
type PilotPreflight = { approvedLinks: number; approvedNew: number; totalPlanned: number; targetExerciseKey: string; duplicatePrimaryTarget: boolean; contradictions: string[] };

export default function SuperadminYmoveLibraryImport() {
  const { colors } = useAppTheme();
  const [run, setRun] = useState<ImportRun | null>(null);
  const [activeStatus, setActiveStatus] = useState<Classification>('CREATE_NEW');
  const [results, setResults] = useState<Record<Classification, Candidate[]>>({
    LINK_EXISTING: [],
    CREATE_NEW: [],
    REVIEW_POSSIBLE_DUPLICATE: [],
    EXCLUDE_NOT_RELEVANT: [],
    CONFLICT: [],
  });
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all');
  const [applySummary, setApplySummary] = useState<{
    safeCreateTotal: number;
    approvedNewCount: number;
    approvedLinkCount: number;
    missingApprovedName: number;
    duplicateExternalIds: number;
    duplicatePrimaryTargets: number;
    invalidCandidates: number;
    batchCount: number;
    totalPlanned: number;
    batchSize: number;
  } | null>(null);
  const [applyProgress, setApplyProgress] = useState<{ createdNew: number; linkedExisting: number; idempotent: number; remainingEstimate: number } | null>(null);
  const [semanticSummary, setSemanticSummary] = useState<SemanticSummary | null>(null);
  const [nextSemanticBatch, setNextSemanticBatch] = useState<Candidate[]>([]);
  const [pilotPreflight, setPilotPreflight] = useState<PilotPreflight | null>(null);

  useEffect(() => {
    void refreshRun();
  }, []);

  const progress = useMemo(() => {
    if (!run?.total_catalog) return 0;
    return Math.round(Math.min(1, run.processed_count / run.total_catalog) * 100);
  }, [run]);
  const allRows = useMemo(() => STATUSES.flatMap((status) => results[status]), [results]);
  const derivedMetrics = useMemo(() => buildDerivedMetrics(allRows), [allRows]);
  const semanticMetrics = useMemo(() => buildSemanticMetrics(allRows), [allRows]);
  const duplicateTitles = useMemo(() => buildDuplicateTitles(allRows), [allRows]);
  const filteredRows = useMemo(
    () => visibleRows(results[activeStatus] ?? [], activeStatus, reviewFilter, duplicateTitles),
    [activeStatus, duplicateTitles, results, reviewFilter],
  );

  async function invoke(body: Record<string, unknown>): Promise<FunctionResult> {
    if (!supabaseConfig.isConfigured || !supabase) return { ok: false, code: 'NOT_CONFIGURED', message: 'Supabase non configurato.' };
    const { data, error: fnError } = await supabase.functions.invoke<FunctionResult>('ymove-library-import', { body });
    if (fnError) return { ok: false, code: 'IMPORT_ERROR', message: fnError.message };
    return data ?? { ok: false, code: 'EMPTY_RESPONSE', message: 'Risposta vuota.' };
  }

  async function refreshRun() {
    const status = await invoke({ action: 'status' });
    if (status.ok && status.run) {
      setRun(status.run);
      if (status.run.processed_count > 0) {
        await loadResults(status.run.id);
        await loadNextSemanticBatch(status.run.id, false);
        await loadApplyPreview(status.run.id);
      }
    }
  }

  async function loadApplyPreview(importRunId: string) {
    const preview = await invoke({ action: 'import_preflight', importRunId });
    if (preview.ok) {
      setApplySummary(buildApplySummary(preview, derivedMetrics.safeCreate));
    }
  }

  async function startImport() {
    if (running) return;
    const ok = await confirmStart();
    if (!ok) return;
    setRunning(true);
    setError('');
    setNotice('');
    try {
      const started = await invoke({ action: 'start', sourceAuditRunId: SOURCE_AUDIT_RUN_ID });
      if (!started.ok || !started.importRunId) throw new Error(started.ok ? 'Import non avviato.' : started.message);
      await continueImport(started.importRunId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import interrotto.');
    } finally {
      setRunning(false);
    }
  }

  async function startReclassification() {
    if (!run?.id || running) return;
    const ok = await confirmReclassification();
    if (!ok) return;
    setRunning(true);
    setError('');
    setNotice('');
    try {
      const started = await invoke({ action: 'start_reclassification', sourceImportRunId: run.id });
      if (!started.ok || !started.importRunId) throw new Error(started.ok ? 'Riclassificazione non avviata.' : started.message);
      if (started.run) setRun(started.run);
      setResults({ LINK_EXISTING: [], CREATE_NEW: [], REVIEW_POSSIBLE_DUPLICATE: [], EXCLUDE_NOT_RELEVANT: [], CONFLICT: [] });
      await continueImport(started.importRunId, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Riclassificazione interrotta.');
    } finally {
      setRunning(false);
    }
  }

  async function resumeImport() {
    if (!run?.id || running) return;
    setRunning(true);
    setError('');
    setNotice('');
    try {
      await continueImport(run.id, run.run_mode === 'reclassification');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import interrotto.');
    } finally {
      setRunning(false);
    }
  }

  async function continueImport(importRunId: string, reclassification = false) {
    for (;;) {
      const current = await invoke({ action: 'status', importRunId });
      if (!current.ok || !current.run) throw new Error(current.ok ? 'Import non trovato.' : current.message);
      setRun(current.run);
      if (current.run.processed_count >= current.run.total_catalog) {
        await invoke({ action: 'finalize_review', importRunId });
        await refreshRun();
        break;
      }
      const batch = await invoke({ action: reclassification ? 'reclassify_batch' : 'analyze_batch', importRunId, cursor: 0, batchSize: 10 });
      if (!batch.ok) throw new Error(batch.message);
      await pause(150);
    }
  }

  async function loadResults(importRunId: string) {
    const next = { LINK_EXISTING: [], CREATE_NEW: [], REVIEW_POSSIBLE_DUPLICATE: [], EXCLUDE_NOT_RELEVANT: [], CONFLICT: [] } as Record<Classification, Candidate[]>;
    for (const classification of STATUSES) {
      const rows: Candidate[] = [];
      let page = 1;
      for (;;) {
        const result = await invoke({ action: 'results', importRunId, classification, page, pageSize: 100 });
        if (!result.ok) break;
        rows.push(...(result.results ?? []));
        if (rows.length >= (result.total ?? 0)) break;
        page += 1;
      }
      next[classification] = rows;
    }
    setResults(next);
  }

  async function decideCandidate(row: Candidate, decision: CandidateDecision) {
    if (!run?.id || running) return;
    const approvedName = (row.approved_italian_name ?? '').trim();
    if (decision === 'approved_new') {
      if (!approvedName) {
        setError('Salva un nome italiano confermato prima di approvare il nuovo esercizio.');
        return;
      }
    }
    setRunning(true);
    setError('');
    setNotice('');
    try {
      const result = await invoke({
        action: 'approve_candidate',
        importRunId: run.id,
        externalExerciseId: row.external_exercise_id,
        decision,
        approvedExistingExerciseKey: decision === 'approved_link' ? row.existing_exercise_key : null,
      });
      if (!result.ok) throw new Error(result.message);
      await loadResults(run.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Decisione non salvata.');
    } finally {
      setRunning(false);
    }
  }

  async function saveCandidateItalianName(row: Candidate, approvedItalianName: string): Promise<boolean> {
    if (!run?.id || running) return false;
    const cleanName = approvedItalianName.trim();
    if (!cleanName) {
      setError('Il nome italiano non puo essere vuoto.');
      return false;
    }
    if (cleanName.length < 3) {
      setError('Il nome italiano deve contenere almeno 3 caratteri.');
      return false;
    }
    setRunning(true);
    setError('');
    setNotice('');
    try {
      const result = await invoke({
        action: 'update_candidate_name',
        importRunId: run.id,
        externalExerciseId: row.external_exercise_id,
        approvedItalianName: cleanName,
      });
      if (!result.ok) throw new Error(result.message);
      if (!result.candidate?.approvedItalianName) throw new Error('Il server non ha confermato il nome salvato.');
      setResults((current) => {
        const next = { ...current };
        for (const status of STATUSES) {
          next[status] = current[status].map((candidate) =>
            candidate.external_exercise_id === result.candidate?.externalExerciseId
              ? {
                  ...candidate,
                  approved_italian_name: result.candidate.approvedItalianName,
                  decision: result.candidate.decision,
                }
              : candidate,
          );
        }
        return next;
      });
      setNotice('Nome salvato');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nome italiano non salvato.');
      return false;
    } finally {
      setRunning(false);
    }
  }

  async function applySafeCreateBatch() {
    if (!run?.id || running || !applySummary) return;
    const preflight = await invoke({ action: 'import_preflight', importRunId: run.id });
    if (!preflight.ok) {
      setError(preflight.message);
      return;
    }
    const freshSummary = buildApplySummary(preflight, derivedMetrics.safeCreate);
    setApplySummary(freshSummary);
    if (freshSummary.totalPlanned !== applySummary.totalPlanned) {
      setError('PREFLIGHT_COUNT_MISMATCH: aggiorna il riepilogo prima di importare.');
      return;
    }
    const ok = await confirmSafeImport(freshSummary);
    if (!ok) return;
    setRunning(true);
    setError('');
    setNotice('Importazione in corso...');
    setApplyProgress({ createdNew: 0, linkedExisting: 0, idempotent: 0, remainingEstimate: freshSummary.totalPlanned });
    try {
      const result = await invoke({ action: 'apply_approved_batch', importRunId: run.id, batchSize: Math.min(10, freshSummary.totalPlanned) });
      if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
      const payload = result.result ?? {};
      const createdNew = result.created ?? payload.createdNew ?? 0;
      const linkedExisting = result.linked ?? payload.linkedExisting ?? 0;
      const idempotent = result.alreadyPresent ?? payload.idempotent ?? 0;
      const remaining = result.remaining ?? payload.remaining ?? Math.max(0, freshSummary.totalPlanned - createdNew - linkedExisting - idempotent);
      setApplyProgress({ createdNew, linkedExisting, idempotent, remainingEstimate: remaining });
      setNotice(`Import completato. Creati: ${createdNew} - Collegati: ${linkedExisting} - Gia presenti: ${idempotent} - Restanti: ${remaining}`);
      await loadApplyPreview(run.id);
      await refreshRun();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import sicuro interrotto.');
    } finally {
      setRunning(false);
    }
  }

  async function loadPilotPreflight() {
    const result = await invoke({ action: 'pilot_link_preflight', importRunId: PILOT_IMPORT_RUN_ID, externalExerciseId: PILOT_EXTERNAL_EXERCISE_ID, targetExerciseKey: PILOT_TARGET_KEY });
    if (!result.ok) { setError(`${result.code}: ${result.message}`); return null; }
    setPilotPreflight(result.pilotPreflight ?? {
      approvedLinks: result.approvedLinks ?? 0,
      approvedNew: result.approvedNew ?? 0,
      totalPlanned: result.totalPlanned ?? 0,
      targetExerciseKey: result.targetExerciseKey ?? PILOT_TARGET_KEY,
      duplicatePrimaryTarget: result.duplicatePrimaryTarget ?? false,
      contradictions: result.contradictions ?? [],
    });
    return result;
  }

  async function approvePilotLink() {
    if (running) return;
    setRunning(true); setError(''); setNotice('Approvazione in corso...');
    try {
      const result = await invoke({ action: 'approve_pilot_link', importRunId: PILOT_IMPORT_RUN_ID, externalExerciseId: PILOT_EXTERNAL_EXERCISE_ID, targetExerciseKey: PILOT_TARGET_KEY });
      if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
      setNotice('Collegamento pilota approvato nello staging.');
      await loadPilotPreflight();
    } catch (err) { setError(err instanceof Error ? err.message : 'Approvazione pilota non riuscita.'); }
    finally { setRunning(false); }
  }

  async function applyPilotLink() {
    if (running) return;
    const preflight = await loadPilotPreflight();
    if (!preflight?.ok || preflight.totalPlanned !== 1 || preflight.approvedLinks !== 1 || preflight.approvedNew !== 0 || preflight.duplicatePrimaryTarget || (preflight.contradictions?.length ?? 0) > 0) {
      setError('PILOT_PREFLIGHT_FAILED: il collegamento pilota non e applicabile.');
      return;
    }
    setRunning(true); setError(''); setNotice('Collegamento in corso...');
    try {
      const result = await invoke({ action: 'apply_pilot_link', importRunId: PILOT_IMPORT_RUN_ID, externalExerciseId: PILOT_EXTERNAL_EXERCISE_ID });
      if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
      setNotice(result.alreadyPresent ? 'Collegamento pilota gia presente.' : 'Collegamento YMove creato.');
      await loadPilotPreflight();
    } catch (err) { setError(err instanceof Error ? err.message : 'Collegamento pilota non riuscito.'); }
    finally { setRunning(false); }
  }

  async function loadNextSemanticBatch(importRunId = run?.id, showNotice = true) {
    if (!importRunId) return;
    const result = await invoke({
      action: 'get_next_semantic_research_batch',
      importRunId,
      algorithmVersion: SEMANTIC_ALGORITHM_VERSION,
      limit: 20,
    });
    if (!result.ok) {
      if (showNotice) setError(result.message);
      return;
    }
    setSemanticSummary(result.summary ?? null);
    setNextSemanticBatch(result.candidates ?? []);
    if (showNotice) setNotice('Prossimo batch semantico caricato');
  }

  return (
    <SuperadminShell title="Import libreria YMove" description="Staging esercizi YMove senza modificare la libreria FitCoach.">
      <AppCard>
        <Text style={[AppTextStyle.cardTitle, { color: colors.ink }]}>Analisi a blocchi</Text>
        <Text style={[styles.description, { color: colors.inkSoft }]}>
          Usa il catalogo YMove gia salvato nell'audit completato. Non richiama YMove e non scrive in public.exercises.
        </Text>
        <AppButton
          label={run && run.status !== 'review_ready' ? 'Riprendi analisi' : 'Avvia staging import'}
          onPress={run && run.status !== 'review_ready' ? resumeImport : startImport}
          loading={running}
          disabled={running}
          fullWidth
        />
        {run?.status === 'review_ready' ? (
          <AppButton
            label="Riclassifica senza chiamare YMove"
            onPress={startReclassification}
            loading={running}
            disabled={running}
            variant="outline"
            fullWidth
          />
        ) : null}
      </AppCard>

      {run ? (
        <AppCard>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>Progresso {progress}%</Text>
          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <View style={[styles.progressFill, { backgroundColor: colors.moss, width: `${progress}%` }]} />
          </View>
          <Metrics run={run} derived={derivedMetrics} />
          <Text style={[styles.description, { color: colors.inkSoft }]}>Run: {shortId(run.id)}{run.source_import_run_id ? ` - Sorgente: ${shortId(run.source_import_run_id)}` : ''}</Text>
          <Text style={[styles.description, { color: colors.inkSoft }]}>Data run: {formatDateTime(run.updated_at ?? run.created_at)}</Text>
          <Text style={[styles.description, { color: colors.inkSoft }]}>
            Modalita: {run.run_mode ?? 'initial_import'} · Algoritmo: {run.algorithm_version ?? 'n/d'}
          </Text>
        </AppCard>
      ) : null}

      {error ? <AppErrorState message={error} onRetry={resumeImport} /> : null}
      {notice ? (
        <AppCard>
          <Text style={[styles.description, { color: colors.moss }]}>{notice}</Text>
        </AppCard>
      ) : null}

      {run?.status === 'review_ready' && applySummary ? (
        <AppCard>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>Import controllato</Text>
          <Text style={[styles.description, { color: colors.inkSoft }]}>
            Verranno applicati solo candidati approvati esplicitamente e gia validati dal preflight. Batch da {applySummary.batchSize}. Nessuna modifica ai programmi automatici.
          </Text>
          <View style={styles.metricsGrid}>
            <Metric label="SAFE_CREATE totali" value={applySummary.safeCreateTotal} />
            <Metric label="Approvati nuovi" value={applySummary.approvedNewCount} />
            <Metric label="Approvati link" value={applySummary.approvedLinkCount} />
            <Metric label="Da revisionare" value={Math.max(0, applySummary.safeCreateTotal - applySummary.approvedNewCount)} />
            <Metric label="Nomi modificati" value={allRows.filter((row) => Boolean(row.approved_italian_name?.trim())).length} />
            <Metric label="Nomi non confermati" value={applySummary.missingApprovedName} />
            <Metric label="Duplicati external ID" value={applySummary.duplicateExternalIds} />
            <Metric label="Target duplicati" value={applySummary.duplicatePrimaryTargets} />
            <Metric label="Totale previsto" value={applySummary.totalPlanned} />
          </View>
          {applyProgress ? (
            <Text style={[styles.description, { color: colors.inkSoft }]}>
              Creati: {applyProgress.createdNew} - Collegati: {applyProgress.linkedExisting} - Gia presenti: {applyProgress.idempotent} - Restanti stimati: {applyProgress.remainingEstimate}
            </Text>
          ) : null}
          <Text style={[styles.description, { color: colors.coral }]}>Importazione temporaneamente bloccata per verifica dati</Text>
          <AppButton
            label="Importa esercizi approvati"
            onPress={applySafeCreateBatch}
            loading={running}
            disabled
            variant="outline"
            fullWidth
          />
        </AppCard>
      ) : null}

      {run?.id === PILOT_IMPORT_RUN_ID ? (
        <AppCard>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>Collegamento pilota</Text>
          <Text style={[styles.description, { color: colors.inkSoft }]}>Barbell Curls → Curl con bilanciere FitCoach</Text>
          <Text style={[styles.description, { color: colors.inkSoft }]}>Nuovi esercizi: 0 · Link: 1 · Totale: 1</Text>
          <Text style={[styles.description, { color: colors.coral }]}>Importazione generale: IMPORT_TEMPORARILY_DISABLED</Text>
          {pilotPreflight ? (
            <Text style={[styles.description, { color: colors.inkSoft }]}>Preflight: link approvati {pilotPreflight.approvedLinks} · nuovi {pilotPreflight.approvedNew} · totale {pilotPreflight.totalPlanned}</Text>
          ) : null}
          <View style={styles.buttonStack}>
            <AppButton label="Verifica preflight pilota" onPress={loadPilotPreflight} loading={running} disabled={running} variant="outline" fullWidth />
      <AppButton label={pilotPreflight?.approvedLinks === 1 ? 'Approvato' : 'Approva collegamento pilota'} onPress={approvePilotLink} loading={running} disabled={running || pilotPreflight?.approvedLinks === 1} fullWidth />
            <AppButton label="Applica solo questo collegamento" onPress={applyPilotLink} loading={running} disabled={running || pilotPreflight?.approvedLinks !== 1 || pilotPreflight?.totalPlanned !== 1} variant="outline" fullWidth />
          </View>
        </AppCard>
      ) : null}

      {run?.status === 'review_ready' ? (
        <AppCard>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>Ricerca semantica</Text>
          <Text style={[styles.description, { color: colors.inkSoft }]}>
            Ricerca nome-per-nome salvata solo nello staging. Non crea esercizi, link o approvazioni.
          </Text>
          <View style={styles.metricsGrid}>
            <Metric label="Ricercati" value={semanticSummary?.researched ?? semanticMetrics.researched} />
            <Metric label="Restanti" value={semanticSummary?.remaining ?? Math.max(0, allRows.length - semanticMetrics.researched)} />
            <Metric label="Collegamenti verificati" value={semanticSummary?.linkVerified ?? semanticMetrics.linkVerified} />
            <Metric label="Nuovi verificati" value={semanticSummary?.createNewResearched ?? semanticMetrics.createNewResearched} />
            <Metric label="Da revisionare" value={semanticSummary?.reviewPossibleMatch ?? semanticMetrics.reviewPossibleMatch} />
            <Metric label="Duplicati editoriali" value={semanticSummary?.editorialDuplicate ?? semanticMetrics.editorialDuplicate} />
            <Metric label="Ricerca necessaria" value={semanticSummary?.researchRequired ?? semanticMetrics.researchRequired} />
            <Metric label="Conflitti" value={semanticSummary?.conflict ?? semanticMetrics.conflict} />
          </View>
          <Text style={[styles.description, { color: colors.inkSoft }]}>Versione algoritmo: {SEMANTIC_ALGORITHM_VERSION}</Text>
          <AppButton
            label="Carica prossimo batch semantico"
            onPress={() => loadNextSemanticBatch()}
            loading={running}
            disabled={running}
            variant="outline"
            fullWidth
          />
          {nextSemanticBatch.length ? (
            <View style={styles.semanticPreview}>
              <Text style={[styles.rowLabel, { color: colors.inkSoft }]}>Prossimi candidati</Text>
              {nextSemanticBatch.map((candidate) => (
                <Text key={candidate.external_exercise_id} style={[styles.rowDetail, { color: colors.ink }]}>
                  {candidate.ymove_title} - {candidate.external_exercise_id.slice(0, 8)}
                </Text>
              ))}
            </View>
          ) : null}
        </AppCard>
      ) : null}

      {run?.processed_count ? (
        <AppCard>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
            {STATUSES.map((status) => (
              <Pressable key={status} onPress={() => setActiveStatus(status)} style={[styles.tab, { borderColor: activeStatus === status ? colors.moss : colors.border }]}>
                <Text style={{ color: activeStatus === status ? colors.moss : colors.inkSoft }}>{status}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.filterRow}>
            {REVIEW_FILTERS.map((filter) => (
              <Pressable
                key={filter}
                onPress={() => {
                  setReviewFilter(filter);
                  if (filter === 'safe_create') setActiveStatus('CREATE_NEW');
                }}
                style={[styles.tab, { borderColor: reviewFilter === filter ? colors.moss : colors.border }]}>
                <Text style={{ color: reviewFilter === filter ? colors.moss : colors.inkSoft }}>{filterLabel(filter)}</Text>
              </Pressable>
            ))}
          </View>
          {filteredRows.length === 0 ? (
            <AppEmptyState title="Nessun risultato caricato" subtitle="Completa o riprendi l'analisi." />
          ) : (
            filteredRows.map((row) => (
              <CandidateRow key={row.external_exercise_id} row={row} saving={running} onDecision={decideCandidate} onSaveItalianName={saveCandidateItalianName} />
            ))
          )}
        </AppCard>
      ) : null}
    </SuperadminShell>
  );
}

function normalizeKey(value: string | null | undefined) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function buildDuplicateTitles(rows: Candidate[]) {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const key = normalizeKey(row.ymove_title);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key));
}

function isMetadataInsufficient(row: Candidate) {
  const payload = row.proposed_payload ?? {};
  const primaryMuscles = Array.isArray(payload.primary_muscles) ? payload.primary_muscles : [];
  const equipment = Array.isArray(payload.equipment) ? payload.equipment : [];
  return primaryMuscles.length === 0 || equipment.length === 0;
}

function buildDerivedMetrics(rows: Candidate[]) {
  const createRows = rows.filter((row) => row.classification === 'CREATE_NEW');
  return {
    safeCreate: createRows.filter((row) => row.safe_create).length,
    newNeedsReview: createRows.filter((row) => !row.safe_create).length,
    translationReview: createRows.filter((row) => row.translation_status === 'review_required').length,
    metadataInsufficient: createRows.filter(isMetadataInsufficient).length,
    editorialDuplicates: createRows.filter((row) => row.metadata_match?.duplicateYmove).length,
  };
}

function buildSemanticMetrics(rows: Candidate[]): SemanticSummary {
  const researchedRows = rows.filter((row) => row.research_algorithm_version === SEMANTIC_ALGORITHM_VERSION);
  const statusOf = (row: Candidate) => row.semantic_review_status ?? row.research_status ?? null;
  return {
    totalCandidates: rows.length,
    researched: researchedRows.length,
    remaining: Math.max(0, rows.length - researchedRows.length),
    linkVerified: researchedRows.filter((row) => statusOf(row) === 'LINK_EXISTING_VERIFIED').length,
    createNewResearched: researchedRows.filter((row) => statusOf(row) === 'CREATE_NEW_RESEARCHED').length,
    reviewPossibleMatch: researchedRows.filter((row) => statusOf(row) === 'REVIEW_POSSIBLE_MATCH').length,
    editorialDuplicate: researchedRows.filter((row) => statusOf(row) === 'EXCLUDE_EDITORIAL_DUPLICATE').length,
    researchRequired: researchedRows.filter((row) => statusOf(row) === 'RESEARCH_REQUIRED').length,
    conflict: researchedRows.filter((row) => statusOf(row) === 'CONFLICT').length,
  };
}

function visibleRows(rows: Candidate[], status: Classification, filter: ReviewFilter, duplicateTitles: Set<string>) {
  if (filter === 'safe_create') return rows.filter((row) => status === 'CREATE_NEW' && row.safe_create);
  if (filter === 'needs_review') return rows.filter((row) => !row.decision);
  if (filter === 'linked') return rows.filter((row) => row.classification === 'LINK_EXISTING' || Boolean(row.existing_exercise_key));
  if (filter === 'ymove_duplicate') return rows.filter((row) => Boolean(row.metadata_match?.duplicateYmove) || duplicateTitles.has(normalizeKey(row.ymove_title)));
  if (filter === 'translation_uncertain') return rows.filter((row) => row.translation_status === 'review_required');
  return rows;
}

function filterLabel(filter: ReviewFilter) {
  if (filter === 'safe_create') return 'SAFE_CREATE';
  if (filter === 'needs_review') return 'Da revisionare';
  if (filter === 'linked') return 'Collegamento esistente';
  if (filter === 'ymove_duplicate') return 'Duplicato YMove';
  if (filter === 'translation_uncertain') return 'Traduzione incerta';
  return 'Tutti';
}

function buildApplySummary(preview: Extract<FunctionResult, { ok: true }>, fallbackSafeCreateTotal: number) {
  return {
    safeCreateTotal: preview.safeCreateTotal ?? fallbackSafeCreateTotal,
    approvedNewCount: preview.approvedNewCount ?? preview.newSafeCreate ?? 0,
    approvedLinkCount: preview.approvedLinkCount ?? preview.linkExisting ?? 0,
    missingApprovedName: preview.missingApprovedName ?? 0,
    duplicateExternalIds: preview.duplicateExternalIds ?? 0,
    duplicatePrimaryTargets: preview.duplicatePrimaryTargets ?? 0,
    invalidCandidates: preview.invalidCandidates ?? 0,
    batchCount: preview.batchCount ?? 0,
    totalPlanned: preview.totalPlanned ?? preview.totalWithVideo ?? 0,
    batchSize: preview.batchSize ?? 10,
  };
}

function shortId(value: string) {
  return value.slice(0, 8);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'n/d';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'n/d';
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function Metrics({ run, derived }: { run: ImportRun; derived: ReturnType<typeof buildDerivedMetrics> }) {
  return (
    <View style={styles.metricsGrid}>
      <Metric label="Totale" value={run.total_catalog} />
      <Metric label="Presenti" value={run.link_existing_count} />
      <Metric label="Nuovi" value={run.create_new_count} />
      <Metric label="Duplicati?" value={run.review_count} />
      <Metric label="Esclusi" value={run.excluded_count} />
      <Metric label="Conflitti" value={run.conflict_count} />
      <Metric label="SAFE_CREATE" value={derived.safeCreate} />
      <Metric label="Nuovi da revisionare" value={derived.newNeedsReview} />
      <Metric label="Traduzioni da controllare" value={derived.translationReview} />
      <Metric label="Metadata insufficienti" value={derived.metadataInsufficient} />
      <Metric label="Duplicati editoriali YMove" value={derived.editorialDuplicates} />
    </View>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.metric, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Text style={[styles.metricValue, { color: colors.ink }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: colors.inkSoft }]}>{label}</Text>
    </View>
  );
}

function CandidateRow({
  row,
  saving,
  onDecision,
  onSaveItalianName,
}: {
  row: Candidate;
  saving: boolean;
  onDecision: (row: Candidate, decision: CandidateDecision) => void;
  onSaveItalianName: (row: Candidate, approvedItalianName: string) => Promise<boolean>;
}) {
  const { colors } = useAppTheme();
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(row.approved_italian_name ?? row.proposed_italian_name ?? '');
  const reasons = Array.isArray(row.reasons) ? row.reasons : [];
  const contradictions = Array.isArray(row.contradictions) ? row.contradictions : [];
  const semanticContradictions = Array.isArray(row.contradiction_flags) ? row.contradiction_flags : [];
  const italianAliases = Array.isArray(row.researched_italian_aliases) ? row.researched_italian_aliases : [];
  const englishAliases = Array.isArray(row.english_aliases) ? row.english_aliases : [];
  const sources = Array.isArray(row.research_sources) ? row.research_sources : [];
  const displayName = row.approved_italian_name ?? row.proposed_italian_name ?? 'Nome italiano non disponibile';
  const researchedName = row.researched_italian_name?.trim();
  const nameEdited = Boolean(row.approved_italian_name?.trim());
  return (
    <View style={[styles.row, { borderTopColor: colors.border }]}>
      <View style={styles.rowHeader}>
        <View style={styles.grow}>
          <Text style={[styles.rowLabel, { color: colors.inkSoft }]}>Nome italiano</Text>
          <Text style={[styles.rowTitle, { color: colors.ink }]}>{displayName}</Text>
          {researchedName ? (
            <>
              <Text style={[styles.rowLabel, { color: colors.inkSoft }]}>Nome italiano ricercato</Text>
              <Text style={[styles.rowDetail, { color: colors.ink }]}>{researchedName}</Text>
            </>
          ) : null}
          <Text style={[styles.rowLabel, { color: colors.inkSoft }]}>Titolo inglese</Text>
          <Text style={[styles.rowDetail, { color: colors.inkSoft }]}>{row.ymove_title}</Text>
          {row.compared_existing_exercise_key ?? row.existing_exercise_key ? (
            <Text style={[styles.rowDetail, { color: colors.inkSoft }]}>Candidato FitCoach: {row.compared_existing_exercise_key ?? row.existing_exercise_key}</Text>
          ) : null}
        </View>
        <AppBadge label={`${row.score ?? 0}/100`} tone={row.classification === 'CONFLICT' ? 'rust' : row.classification === 'LINK_EXISTING' ? 'moss' : 'neutral'} />
      </View>
      <View style={styles.badgeRow}>
      {row.translation_status === 'generated' ? <AppBadge label="Traduzione generata" tone="neutral" /> : null}
      {row.translation_status === 'review_required' ? <AppBadge label="Da revisionare" tone="rust" /> : null}
        {row.semantic_review_status ? <AppBadge label={row.semantic_review_status} tone={row.semantic_review_status === 'LINK_EXISTING_VERIFIED' ? 'moss' : 'neutral'} /> : null}
        {nameEdited ? <AppBadge label="Nome modificato" tone="moss" /> : null}
      </View>
      {reasons.length ? <Text style={[styles.rowText, { color: colors.ink }]}>Motivi: {reasons.join('; ')}</Text> : null}
      {contradictions.length ? <Text style={[styles.rowText, { color: colors.coral }]}>Contraddizioni: {contradictions.join('; ')}</Text> : null}
      {semanticContradictions.length ? <Text style={[styles.rowText, { color: colors.coral }]}>Contraddizioni semantiche: {semanticContradictions.join('; ')}</Text> : null}
      {italianAliases.length || englishAliases.length ? (
        <Text style={[styles.rowText, { color: colors.ink }]}>
          Alias: {[...italianAliases, ...englishAliases].join('; ')}
        </Text>
      ) : null}
      {row.match_reason ? <Text style={[styles.rowText, { color: colors.ink }]}>Confronto tecnico: {row.match_reason}</Text> : null}
      {row.candidate_rejected_reason ? <Text style={[styles.rowText, { color: colors.coral }]}>Candidato scartato: {row.candidate_rejected_reason}</Text> : null}
      {sources.length ? (
        <Text style={[styles.rowText, { color: colors.inkSoft }]}>
          Fonti: {sources.map((source) => source.title ?? source.url ?? source.term).filter(Boolean).join('; ')}
        </Text>
      ) : null}
      <Text style={[styles.rowDetail, { color: colors.inkSoft }]}>Traduzione: {row.translation_status}</Text>
      {row.safe_create ? <Text style={[styles.rowDetail, { color: colors.moss }]}>SAFE_CREATE: richiede comunque conferma Superadmin</Text> : null}
      {row.decision ? <Text style={[styles.rowDetail, { color: colors.moss }]}>Decisione staging: {row.decision}</Text> : null}
      {editingName ? (
        <View style={styles.editBox}>
          <Text style={[styles.rowLabel, { color: colors.inkSoft }]}>Titolo inglese originale</Text>
          <Text style={[styles.rowDetail, { color: colors.ink }]}>{row.ymove_title}</Text>
          <Text style={[styles.rowLabel, { color: colors.inkSoft }]}>Nome italiano</Text>
          <TextInput
            value={draftName}
            onChangeText={setDraftName}
            placeholder="Nome italiano"
            placeholderTextColor={colors.inkSoft}
            style={[styles.input, { borderColor: colors.border, color: colors.ink, backgroundColor: colors.surface }]}
          />
          <View style={styles.actionRow}>
            <AppButton
              label={saving ? 'Salvataggio...' : 'Salva'}
              onPress={async () => {
                const cleanName = draftName.trim();
                if (!cleanName) return;
                const saved = await onSaveItalianName(row, cleanName);
                if (saved) setEditingName(false);
              }}
              variant="outline"
              size="sm"
              disabled={saving || !draftName.trim()}
            />
            <AppButton
              label="Annulla"
              onPress={() => {
                setDraftName(row.approved_italian_name ?? row.proposed_italian_name ?? '');
                setEditingName(false);
              }}
              variant="outline"
              size="sm"
            />
          </View>
        </View>
      ) : null}
      <View style={styles.actionRow}>
        <AppButton label="Approva nuovo" onPress={() => onDecision(row, 'approved_new')} variant="outline" size="sm" />
        <AppButton label="Collega" onPress={() => onDecision(row, 'approved_link')} variant="outline" size="sm" disabled={!row.existing_exercise_key} />
        <AppButton
          label="Modifica nome italiano"
          onPress={() => {
            setDraftName(row.approved_italian_name ?? row.proposed_italian_name ?? '');
            setEditingName(true);
          }}
          variant="outline"
          size="sm"
        />
        <AppButton label="Escludi" onPress={() => onDecision(row, 'excluded')} variant="outline" size="sm" />
        <AppButton label="Rimanda" onPress={() => onDecision(row, 'deferred')} variant="outline" size="sm" />
      </View>
    </View>
  );
}

async function confirmStart(): Promise<boolean> {
  const message = 'Questa analisi non richiama YMove e non modifica public.exercises.';
  if (Platform.OS === 'web') return window.confirm(message);
  return new Promise((resolve) => {
    Alert.alert('Avviare staging import?', message, [
      { text: 'Annulla', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Avvia', onPress: () => resolve(true) },
    ]);
  });
}

async function confirmReclassification(): Promise<boolean> {
  const message = 'Questa operazione crea un nuovo run e usa solo il catalogo gia salvato. Non chiama YMove.';
  if (Platform.OS === 'web') return window.confirm(message);
  return new Promise((resolve) => {
    Alert.alert('Riclassificare?', message, [
      { text: 'Annulla', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Riclassifica', onPress: () => resolve(true) },
    ]);
  });
}

async function confirmSafeImport(summary: { approvedNewCount: number; approvedLinkCount: number; totalPlanned: number; batchSize: number }): Promise<boolean> {
  const message = [
    `${summary.approvedNewCount} nuovi esercizi approvati`,
    `${summary.approvedLinkCount} collegamenti esistenti approvati`,
    `${summary.totalPlanned} esercizi totali previsti`,
    `Batch da ${summary.batchSize}`,
    'Nessuna modifica ai programmi automatici.',
  ].join('\n');
  if (Platform.OS === 'web') return window.confirm(message);
  return new Promise((resolve) => {
    Alert.alert('Importare esercizi sicuri?', message, [
      { text: 'Annulla', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Importa', onPress: () => resolve(true) },
    ]);
  });
}

function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const styles = StyleSheet.create({
  description: { marginTop: AppSpacing[2], lineHeight: 20 },
  sectionTitle: { ...AppTextStyle.cardTitle, marginBottom: AppSpacing[2] },
  progressTrack: { height: 8, borderRadius: 999, overflow: 'hidden', marginBottom: AppSpacing[4] },
  progressFill: { height: '100%' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: AppSpacing[2] },
  metric: { width: '48%', borderWidth: 1, borderRadius: 8, padding: AppSpacing[2] },
  metricValue: { fontSize: 20, fontWeight: '700' },
  metricLabel: { fontSize: 12 },
  tabs: { gap: AppSpacing[2], paddingVertical: AppSpacing[2] },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: AppSpacing[2], marginBottom: AppSpacing[2] },
  tab: { borderWidth: 1, borderRadius: 999, paddingHorizontal: AppSpacing[4], paddingVertical: AppSpacing[1] },
  row: { borderTopWidth: 1, paddingVertical: AppSpacing[4] },
  rowHeader: { flexDirection: 'row', gap: AppSpacing[2], alignItems: 'flex-start' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: AppSpacing[2], marginTop: AppSpacing[2] },
  semanticPreview: { marginTop: AppSpacing[3], gap: AppSpacing[1] },
  buttonStack: { gap: AppSpacing[2], marginTop: AppSpacing[3] },
  editBox: { marginTop: AppSpacing[3], gap: AppSpacing[2] },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: AppSpacing[2], marginTop: AppSpacing[2] },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: AppSpacing[3], paddingVertical: AppSpacing[2], fontSize: 14 },
  grow: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowLabel: { fontSize: 11, fontWeight: '700', marginTop: AppSpacing[1], textTransform: 'uppercase' },
  rowDetail: { fontSize: 12, marginTop: 2 },
  rowText: { fontSize: 12, marginTop: AppSpacing[1], lineHeight: 18 },
});
