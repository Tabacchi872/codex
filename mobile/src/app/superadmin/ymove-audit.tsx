import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { SuperadminShell } from '@/components/superadmin-shell';
import { AppBadge, AppButton, AppCard, AppEmptyState, AppErrorState } from '@/components/ui';
import { supabase, supabaseConfig } from '@/lib/supabase';
import { AppFontSize, AppSpacing, AppTextStyle, useAppTheme } from '@/theme';

type AuditStatus = 'AUTO_MATCH' | 'REVIEW_REQUIRED' | 'UNMATCHED' | 'CONFLICT';
type RunStatus = 'created' | 'syncing_catalog' | 'catalog_ready' | 'matching' | 'finalizing' | 'completed' | 'failed' | 'cancelled';
type Phase = 'idle' | 'starting' | 'syncing_catalog' | 'finalizing_catalog' | 'matching' | 'finalizing' | 'completed' | 'failed';

type AuditRunState = {
  id: string;
  source_audit_run_id: string | null;
  algorithm_version: string | null;
  run_mode: 'full_audit' | 'rematch';
  status: RunStatus;
  total_fitcoach: number;
  total_ymove_declared: number | null;
  total_ymove_fetched: number;
  total_pages: number | null;
  pages_completed: number;
  exercises_processed: number;
  auto_match_count: number;
  review_required_count: number;
  unmatched_count: number;
  conflict_count: number;
  usage_before: Record<string, unknown> | null;
  usage_after: Record<string, unknown> | null;
  error_code: string | null;
  error_message: string | null;
  failed_page: number | null;
  started_at: string;
  finished_at: string | null;
  updated_at: string;
};

type AuditRow = {
  audit_run_id: string;
  fitcoach_exercise_key: string;
  fitcoach_exercise_id: string | null;
  fitcoach_name: string;
  status: AuditStatus;
  candidate_external_id: string | null;
  candidate_title: string | null;
  score: number | null;
  second_score: number | null;
  score_gap: number | null;
  reasons: string[];
  contradictions: string[];
  alternatives: Array<{ ymoveId: string; title: string; score: number }>;
  candidate_count: number | null;
  rejection_reason: string | null;
  score_breakdown: Record<string, unknown> | null;
  algorithm_version: string | null;
};

type FunctionResult =
  | { ok: true; auditRunId?: string; status?: RunStatus; totalFitcoach?: number; startedAt?: string; reused?: boolean; totalPages?: number; nextPage?: number | null; nextCursor?: number; completed?: boolean; processed?: number; run?: AuditRunState | null; results?: AuditRow[]; total?: number }
  | { ok: false; code: string; message: string; page?: number; cursor?: number; auditRunId?: string; dbCode?: string | null; dbMessage?: string | null; dbDetails?: string | null; dbHint?: string | null; error?: unknown };

const STATUSES: AuditStatus[] = ['AUTO_MATCH', 'REVIEW_REQUIRED', 'UNMATCHED', 'CONFLICT'];
const STATUS_LABEL: Record<AuditStatus, string> = {
  AUTO_MATCH: 'AUTO_MATCH',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  UNMATCHED: 'UNMATCHED',
  CONFLICT: 'CONFLICT',
};
const MAX_AUTO_RETRIES = 2;

export default function SuperadminYmoveAudit() {
  const { colors } = useAppTheme();
  const [run, setRun] = useState<AuditRunState | null>(null);
  const [results, setResults] = useState<Record<AuditStatus, AuditRow[]>>({ AUTO_MATCH: [], REVIEW_REQUIRED: [], UNMATCHED: [], CONFLICT: [] });
  const [activeStatus, setActiveStatus] = useState<AuditStatus>('AUTO_MATCH');
  const [search, setSearch] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [technicalError, setTechnicalError] = useState<{
    code: string;
    phase: Phase;
    page?: number | null;
    cursor?: number | null;
    retry: number;
    auditRunId?: string | null;
    dbCode?: string | null;
    dbMessage?: string | null;
    dbDetails?: string | null;
    dbHint?: string | null;
  } | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = results[activeStatus] ?? [];
    if (!query) return rows;
    return rows.filter((row) =>
      row.fitcoach_name.toLowerCase().includes(query) ||
      (row.candidate_title ?? '').toLowerCase().includes(query) ||
      (row.candidate_external_id ?? '').toLowerCase().includes(query)
    );
  }, [activeStatus, results, search]);

  const progressLabel = useMemo(() => {
    if (!run) return 'Nessun audit attivo';
    if (phase === 'syncing_catalog') return `Catalogo YMove: pagina ${Math.min(run.pages_completed + 1, run.total_pages ?? run.pages_completed + 1)} di ${run.total_pages ?? '?'}`;
    if (phase === 'matching') return `Matching: ${run.exercises_processed} di ${run.total_fitcoach} esercizi`;
    if (phase === 'finalizing_catalog') return 'Verifica catalogo YMove';
    if (phase === 'finalizing') return 'Finalizzazione audit';
    if (run.status === 'completed') return 'Audit completato';
    if (run.status === 'failed') return 'Audit interrotto';
    return 'Preparazione audit';
  }, [phase, run]);

  const progressValue = useMemo(() => {
    if (!run) return 0;
    if (run.status === 'completed') return 100;
    const catalogTotal = Math.max(run.total_pages ?? 0, 1);
    const catalogPart = Math.min(run.pages_completed / catalogTotal, 1) * 45;
    const matchTotal = Math.max(run.total_fitcoach, 1);
    const matchPart = Math.min(run.exercises_processed / matchTotal, 1) * 55;
    return Math.round(catalogPart + matchPart);
  }, [run]);

  useEffect(() => {
    void refreshLatestRun();
  }, []);

  async function invoke(body: Record<string, unknown>): Promise<FunctionResult> {
    if (!supabaseConfig.isConfigured || !supabase) {
      return { ok: false, code: 'NOT_CONFIGURED', message: 'Supabase non configurato in questo ambiente.' };
    }
    const { data, error: invokeError } = await supabase.functions.invoke<FunctionResult>('ymove-catalog-audit', { body });
    if (invokeError) {
      const context = (invokeError as { context?: Response }).context;
      if (context) {
        try {
          const bodyData = await context.json() as {
            code?: string;
            message?: string;
            page?: number;
            cursor?: number;
            auditRunId?: string;
            dbCode?: string | null;
            dbMessage?: string | null;
            dbDetails?: string | null;
            dbHint?: string | null;
          };
          return {
            ok: false,
            code: bodyData.code ?? 'AUDIT_ERROR',
            message: bodyData.message ?? invokeError.message,
            page: bodyData.page,
            cursor: bodyData.cursor,
            auditRunId: bodyData.auditRunId,
            dbCode: bodyData.dbCode,
            dbMessage: bodyData.dbMessage,
            dbDetails: bodyData.dbDetails,
            dbHint: bodyData.dbHint,
          };
        } catch {
          // Response non JSON.
        }
      }
      return { ok: false, code: 'AUDIT_ERROR', message: invokeError.message };
    }
    return data ?? { ok: false, code: 'EMPTY_RESPONSE', message: 'Risposta vuota dalla funzione audit.' };
  }

  async function refreshLatestRun() {
    const status = await invoke({ action: 'status' });
    if (status.ok && status.run) {
      setRun(status.run);
      setLastUpdatedAt(new Date().toISOString());
      if (status.run.status === 'completed') await loadAllResults(status.run.id);
    }
  }

  async function runAudit() {
    if (running) return;
    const shouldProceed = !run || run.status === 'failed' || run.status === 'cancelled' || run.status === 'completed'
      ? await confirmAuditStart(Boolean(run && run.status === 'completed'))
      : true;
    if (!shouldProceed) return;

    cancelRef.current = false;
    setRunning(true);
    setError('');
    setTechnicalError(null);
    setResults({ AUTO_MATCH: [], REVIEW_REQUIRED: [], UNMATCHED: [], CONFLICT: [] });

    try {
      const started = await withRetries('starting', null, null, () => invoke({ action: 'start' }));
      if (!started.ok || !started.auditRunId) throw toFlowError(started, 'starting', null, null, 0);
      await continueRun(started.auditRunId);
    } catch (err) {
      handleFlowError(err);
    } finally {
      setRunning(false);
    }
  }

  async function runRematch() {
    if (!run?.id || running) return;
    const shouldProceed = await confirmRematchStart();
    if (!shouldProceed) return;

    cancelRef.current = false;
    setRunning(true);
    setError('');
    setTechnicalError(null);
    setResults({ AUTO_MATCH: [], REVIEW_REQUIRED: [], UNMATCHED: [], CONFLICT: [] });

    try {
      const started = await withRetries('starting', null, null, () => invoke({ action: 'start_rematch', sourceAuditRunId: run.id }));
      if (!started.ok || !started.auditRunId) throw toFlowError(started, 'starting', null, null, 0);
      await continueRun(started.auditRunId);
    } catch (err) {
      handleFlowError(err);
    } finally {
      setRunning(false);
    }
  }

  async function continueRun(auditRunId: string) {
    let currentRun = await fetchRun(auditRunId);
    if (!currentRun) throw { code: 'AUDIT_NOT_FOUND', message: 'Audit non trovato.', phase: 'starting' as Phase, retry: 0, auditRunId };
    setRun(currentRun);

    while (!cancelRef.current && currentRun.status !== 'completed') {
      if (currentRun.status === 'created' || currentRun.status === 'syncing_catalog') {
        const totalPages = currentRun.total_pages ?? currentRun.pages_completed + 1;
        const nextPage = Math.max(1, currentRun.pages_completed + 1);
        const synced = await withRetries('syncing_catalog', nextPage, null, () => invoke({ action: 'sync_page', auditRunId, page: nextPage }));
        if (!synced.ok) throw toFlowError(synced, 'syncing_catalog', nextPage, null, 0);
        await pause();
        currentRun = await fetchRun(auditRunId) ?? currentRun;
        setRun(currentRun);
        if (currentRun.total_pages && currentRun.pages_completed >= currentRun.total_pages) {
          const finalizedCatalog = await withRetries('finalizing_catalog', null, null, () => invoke({ action: 'finalize_catalog', auditRunId }));
          if (!finalizedCatalog.ok) throw toFlowError(finalizedCatalog, 'finalizing_catalog', null, null, 0);
          currentRun = await fetchRun(auditRunId) ?? currentRun;
          setRun(currentRun);
        } else if (nextPage > totalPages + 1) {
          throw { code: 'CATALOG_PROGRESS_INVALID', message: 'Progressione catalogo non valida.', phase: 'syncing_catalog' as Phase, page: nextPage, retry: 0, auditRunId };
        }
        continue;
      }

      if (currentRun.status === 'catalog_ready' || currentRun.status === 'matching') {
        const matched = await withRetries('matching', null, currentRun.exercises_processed, () =>
          invoke({ action: 'match_batch', auditRunId, cursor: 0, batchSize: 5 })
        );
        if (!matched.ok) throw toFlowError(matched, 'matching', null, currentRun.exercises_processed, 0);
        await pause();
        currentRun = await fetchRun(auditRunId) ?? currentRun;
        setRun(currentRun);
        if (matched.completed || currentRun.exercises_processed >= currentRun.total_fitcoach) {
          const finalized = await withRetries('finalizing', null, null, () => invoke({ action: 'finalize', auditRunId }));
          if (!finalized.ok) throw toFlowError(finalized, 'finalizing', null, null, 0);
          currentRun = await fetchRun(auditRunId) ?? currentRun;
          setRun(currentRun);
          break;
        }
        continue;
      }

      if (currentRun.status === 'failed') {
        throw { code: currentRun.error_code ?? 'AUDIT_FAILED', message: currentRun.error_message ?? 'Audit interrotto.', phase, page: currentRun.failed_page, retry: 0, auditRunId };
      }
      if (currentRun.status === 'cancelled') break;
      break;
    }

    const finalRun = await fetchRun(auditRunId);
    if (finalRun) setRun(finalRun);
    if (finalRun?.status === 'completed') {
      setPhase('completed');
      await loadAllResults(auditRunId);
    }
  }

  async function fetchRun(auditRunId: string): Promise<AuditRunState | null> {
    const status = await invoke({ action: 'status', auditRunId });
    if (!status.ok) throw toFlowError(status, phase, null, null, 0);
    setLastUpdatedAt(new Date().toISOString());
    return status.run ?? null;
  }

  async function withRetries(targetPhase: Phase, page: number | null, cursor: number | null, task: () => Promise<FunctionResult>) {
    setPhase(targetPhase);
    let last: FunctionResult = { ok: false, code: 'UNKNOWN', message: 'Errore sconosciuto.' };
    for (let retry = 0; retry <= MAX_AUTO_RETRIES; retry += 1) {
      last = await task();
      if (last.ok) return last;
      const mapped = mapWorkerLimit(last.message);
      setTechnicalError({
        code: last.code,
        phase: targetPhase,
        page: last.page ?? page,
        cursor: last.cursor ?? cursor,
        retry,
        auditRunId: last.auditRunId ?? run?.id ?? null,
        dbCode: last.dbCode,
        dbMessage: last.dbMessage,
        dbDetails: last.dbDetails,
        dbHint: last.dbHint,
      });
      setError(mapped);
      if (retry < MAX_AUTO_RETRIES) await pause(700 * (retry + 1));
    }
    return last;
  }

  async function resumeAudit() {
    if (!run?.id || running) return;
    setRunning(true);
    setError('');
    try {
      await continueRun(run.id);
    } catch (err) {
      handleFlowError(err);
    } finally {
      setRunning(false);
    }
  }

  async function cancelAudit() {
    if (!run?.id || running) return;
    cancelRef.current = true;
    const result = await invoke({ action: 'cancel', auditRunId: run.id });
    if (result.ok) await refreshLatestRun();
  }

  async function loadAllResults(auditRunId: string) {
    const next: Record<AuditStatus, AuditRow[]> = { AUTO_MATCH: [], REVIEW_REQUIRED: [], UNMATCHED: [], CONFLICT: [] };
    for (const status of STATUSES) {
      const rows: AuditRow[] = [];
      let page = 1;
      for (;;) {
        const result = await invoke({ action: 'results', auditRunId, status, page, pageSize: 100 });
        if (!result.ok) break;
        rows.push(...(result.results ?? []));
        if (rows.length >= (result.total ?? 0)) break;
        page += 1;
      }
      next[status] = rows;
    }
    setResults(next);
  }

  function handleFlowError(err: unknown) {
    const flow = err as {
      code?: string;
      message?: string;
      phase?: Phase;
      page?: number | null;
      cursor?: number | null;
      retry?: number;
      auditRunId?: string | null;
      dbCode?: string | null;
      dbMessage?: string | null;
      dbDetails?: string | null;
      dbHint?: string | null;
    };
    const message = mapWorkerLimit(flow.message ?? 'Audit YMove interrotto.');
    setError(message);
    setPhase('failed');
    setTechnicalError({
      code: flow.code ?? 'AUDIT_ERROR',
      phase: flow.phase ?? 'failed',
      page: flow.page ?? null,
      cursor: flow.cursor ?? null,
      retry: flow.retry ?? MAX_AUTO_RETRIES,
      auditRunId: flow.auditRunId ?? run?.id ?? null,
      dbCode: flow.dbCode ?? null,
      dbMessage: flow.dbMessage ?? null,
      dbDetails: flow.dbDetails ?? null,
      dbHint: flow.dbHint ?? null,
    });
  }

  function exportCurrent(format: 'json' | 'csv') {
    const fileBase = `ymove-${activeStatus.toLowerCase()}`;
    if (format === 'json') {
      downloadText(`${fileBase}.json`, JSON.stringify(filteredRows, null, 2), 'application/json');
      return;
    }
    downloadText(`${fileBase}.csv`, toCsv(filteredRows), 'text/csv;charset=utf-8');
  }

  return (
    <SuperadminShell title="Audit YMove" description="Matching severo e temporaneo, senza modificare esercizi FitCoach.">
      <AppCard>
        <Text style={[AppTextStyle.cardTitle, { color: colors.ink }]}>Audit a blocchi</Text>
        <Text style={[styles.description, { color: colors.inkSoft }]}>
          L'audit scarica una pagina YMove alla volta e poi analizza pochi esercizi per richiesta. Chiudendo e riaprendo la pagina riprende dallo stato salvato.
        </Text>
        <View style={styles.buttonRow}>
          <AppButton
            label={run && run.status !== 'completed' ? 'Riprendi audit' : 'Esegui audit YMove'}
            onPress={run && run.status !== 'completed' ? resumeAudit : runAudit}
            loading={running}
            disabled={running}
            fullWidth
          />
          {run && run.status !== 'completed' && run.status !== 'cancelled' ? (
            <AppButton label="Annulla" onPress={cancelAudit} variant="outline" disabled={running} fullWidth />
          ) : null}
          {run?.status === 'completed' ? (
            <AppButton label="Rematch senza YMove" onPress={runRematch} variant="outline" disabled={running} fullWidth />
          ) : null}
        </View>
      </AppCard>

      {run ? (
        <AppCard>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>{progressLabel}</Text>
          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <View style={[styles.progressFill, { backgroundColor: colors.moss, width: `${progressValue}%` }]} />
          </View>
          <InfoLine label="Percentuale" value={`${progressValue}%`} />
          <InfoLine label="Stato" value={run.status} />
          <InfoLine label="Modalita" value={run.run_mode === 'rematch' ? 'Rematch catalogo salvato' : 'Audit completo'} />
          <InfoLine label="Algoritmo" value={run.algorithm_version ?? 'n/d'} />
          {run.source_audit_run_id ? <InfoLine label="Catalogo sorgente" value={run.source_audit_run_id} /> : null}
          <InfoLine label="Durata" value={formatDuration(run.started_at, run.finished_at)} />
          <InfoLine label="Ultimo aggiornamento" value={lastUpdatedAt ? formatDateTime(lastUpdatedAt) : formatDateTime(run.updated_at)} />
          <InfoLine label="Pagine catalogo" value={`${run.pages_completed} / ${run.total_pages ?? '?'}`} />
          <InfoLine label="Esercizi analizzati" value={`${run.exercises_processed} / ${run.total_fitcoach}`} />
        </AppCard>
      ) : null}

      {error ? (
        <AppCard>
          <AppErrorState message={error} onRetry={resumeAudit} />
          {technicalError ? (
            <View style={styles.technicalBox}>
              <InfoLine label="Codice" value={technicalError.code} />
              <InfoLine label="Fase" value={technicalError.phase} />
              <InfoLine label="Pagina" value={technicalError.page === null || technicalError.page === undefined ? 'n/d' : String(technicalError.page)} />
              <InfoLine label="Cursor" value={technicalError.cursor === null || technicalError.cursor === undefined ? 'n/d' : String(technicalError.cursor)} />
              <InfoLine label="Retry" value={String(technicalError.retry)} />
              <InfoLine label="Audit" value={technicalError.auditRunId ?? 'n/d'} />
              {technicalError.dbCode ? <InfoLine label="DB code" value={technicalError.dbCode} /> : null}
              {technicalError.dbMessage ? <InfoLine label="DB message" value={technicalError.dbMessage} /> : null}
              {technicalError.dbDetails ? <InfoLine label="DB details" value={technicalError.dbDetails} /> : null}
              {technicalError.dbHint ? <InfoLine label="DB hint" value={technicalError.dbHint} /> : null}
            </View>
          ) : null}
        </AppCard>
      ) : null}

      {run ? (
        <View style={styles.metricsGrid}>
          <Metric label="FitCoach" value={run.total_fitcoach} />
          <Metric label="YMove" value={run.total_ymove_fetched} />
          <Metric label="AUTO_MATCH" value={run.auto_match_count} />
          <Metric label="REVIEW" value={run.review_required_count} />
          <Metric label="UNMATCHED" value={run.unmatched_count} />
          <Metric label="CONFLICT" value={run.conflict_count} />
        </View>
      ) : null}

      {run?.status === 'completed' ? (
        <>
          <AppCard>
            <Text style={[styles.sectionTitle, { color: colors.ink }]}>Risultati salvati</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusTabs}>
              {STATUSES.map((status) => (
                <Pressable
                  key={status}
                  onPress={() => setActiveStatus(status)}
                  style={[
                    styles.statusTab,
                    {
                      borderColor: activeStatus === status ? colors.moss : colors.border,
                      backgroundColor: activeStatus === status ? colors.mossSoft : colors.surface,
                    },
                  ]}>
                  <Text style={[styles.statusTabText, { color: activeStatus === status ? colors.moss : colors.inkSoft }]}>{STATUS_LABEL[status]}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Cerca nome FitCoach o candidato YMove"
              placeholderTextColor={colors.inkFaint}
              style={[styles.searchInput, { borderColor: colors.border, color: colors.ink }]}
            />
            <View style={styles.exportRow}>
              <AppButton label="Esporta JSON" onPress={() => exportCurrent('json')} variant="outline" size="sm" disabled={filteredRows.length === 0} />
              <AppButton label={`CSV ${activeStatus}`} onPress={() => exportCurrent('csv')} variant="outline" size="sm" disabled={filteredRows.length === 0} />
            </View>
          </AppCard>

          <AppCard>
            <Text style={[styles.sectionTitle, { color: colors.ink }]}>{activeStatus}</Text>
            {filteredRows.length === 0 ? (
              <AppEmptyState title="Nessun risultato" subtitle="Cambia tab o filtro di ricerca." />
            ) : (
              filteredRows.map((row) => <ResultRow key={`${row.fitcoach_exercise_key}-${row.status}`} row={row} />)
            )}
          </AppCard>
        </>
      ) : (
        <AppCard>
          <AppEmptyState title="Risultati non ancora disponibili" subtitle="Completa l'audit per consultare matching, review, esclusi e conflitti." />
        </AppCard>
      )}
    </SuperadminShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.metric, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.metricValue, { color: colors.ink }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: colors.inkSoft }]}>{label}</Text>
    </View>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.infoLine}>
      <Text style={[styles.infoLabel, { color: colors.inkSoft }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.ink }]}>{value}</Text>
    </View>
  );
}

function ResultRow({ row }: { row: AuditRow }) {
  const { colors } = useAppTheme();
  const reasons = Array.isArray(row.reasons) ? row.reasons : [];
  const contradictions = Array.isArray(row.contradictions) ? row.contradictions : [];
  const alternatives = Array.isArray(row.alternatives) ? row.alternatives : [];
  const breakdown = row.score_breakdown && typeof row.score_breakdown === 'object'
    ? Object.entries(row.score_breakdown).map(([key, value]) => `${key}: ${String(value)}`)
    : [];
  return (
    <View style={[styles.resultRow, { borderTopColor: colors.border }]}>
      <View style={styles.resultHeader}>
        <View style={styles.grow}>
          <Text style={[styles.resultTitle, { color: colors.ink }]}>{row.fitcoach_name}</Text>
          <Text style={[styles.resultDetail, { color: colors.inkSoft }]}>{row.candidate_title ?? 'Nessun candidato credibile'}</Text>
          <Text style={[styles.resultMeta, { color: colors.inkSoft }]}>
            Candidati analizzati: {row.candidate_count ?? 'n/d'}{row.rejection_reason ? ` · Scarto: ${row.rejection_reason}` : ''}
          </Text>
          {breakdown.length > 0 ? <Text style={[styles.resultMeta, { color: colors.inkSoft }]}>Punteggio: {breakdown.join(' · ')}</Text> : null}
        </View>
        <AppBadge label={`${row.score ?? 0}/100`} tone={row.status === 'AUTO_MATCH' ? 'moss' : row.status === 'CONFLICT' ? 'rust' : 'neutral'} />
      </View>
      <Text style={[styles.resultMeta, { color: colors.inkSoft }]}>Margine: {row.score_gap ?? 0} · Stato: {row.status}</Text>
      {reasons.length > 0 ? <Text style={[styles.resultText, { color: colors.ink }]}>Motivi: {reasons.join('; ')}</Text> : null}
      {contradictions.length > 0 ? <Text style={[styles.resultText, { color: colors.coral }]}>Contraddizioni: {contradictions.join('; ')}</Text> : null}
      {alternatives.length > 0 ? (
        <Text style={[styles.resultMeta, { color: colors.inkSoft }]}>
          Alternative: {alternatives.map((item) => `${item.title} (${item.score})`).join(' · ')}
        </Text>
      ) : null}
    </View>
  );
}

async function confirmAuditStart(hasCompletedRun: boolean): Promise<boolean> {
  if (!hasCompletedRun) return true;
  const message = 'Questa operazione interroga nuovamente il catalogo YMove.';
  if (Platform.OS === 'web') return window.confirm(message);
  return new Promise((resolve) => {
    Alert.alert('Eseguire nuovo audit?', message, [
      { text: 'Annulla', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Esegui', style: 'default', onPress: () => resolve(true) },
    ]);
  });
}

async function confirmRematchStart(): Promise<boolean> {
  const message = 'Questa operazione usa il catalogo YMove gia salvato e non richiama l API YMove.';
  if (Platform.OS === 'web') return window.confirm(message);
  return new Promise((resolve) => {
    Alert.alert('Ricalcolare matching?', message, [
      { text: 'Annulla', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Ricalcola', style: 'default', onPress: () => resolve(true) },
    ]);
  });
}

function toFlowError(result: FunctionResult, phase: Phase, page: number | null, cursor: number | null, retry: number) {
  if (result.ok) return { code: 'UNKNOWN', message: 'Errore sconosciuto.', phase, page, cursor, retry };
  return { code: result.code, message: result.message, phase, page: result.page ?? page, cursor: result.cursor ?? cursor, retry };
}

function mapWorkerLimit(message: string) {
  return message.includes('WORKER_RESOURCE_LIMIT') || message.includes('compute resources')
    ? 'L’audit ha superato le risorse disponibili. Il lavoro verra ripreso in blocchi piu piccoli.'
    : message;
}

function pause(ms = 250) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data non disponibile';
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function formatDuration(startedAt: string, finishedAt: string | null) {
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'n/d';
  return `${Math.max(0, Math.round((end - start) / 1000))} s`;
}

function toCsv(rows: AuditRow[]) {
  const columns = ['fitcoach_exercise_key', 'fitcoach_exercise_id', 'fitcoach_name', 'status', 'candidate_external_id', 'candidate_title', 'score', 'score_gap', 'reasons', 'contradictions'];
  const lines = [columns.join(',')];
  rows.forEach((row) => {
    lines.push(columns.map((column) => {
      const value = (row as unknown as Record<string, unknown>)[column];
      return csvEscape(Array.isArray(value) ? value.join(' | ') : value);
    }).join(','));
  });
  return `${lines.join('\n')}\n`;
}

function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadText(filename: string, content: string, mimeType: string) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const styles = StyleSheet.create({
  description: {
    fontSize: AppFontSize.sm,
    lineHeight: 20,
  },
  buttonRow: {
    gap: AppSpacing[2],
  },
  progressTrack: {
    borderRadius: 999,
    height: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
  },
  technicalBox: {
    marginTop: AppSpacing[3],
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  metric: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexBasis: '31%',
    flexGrow: 1,
    minWidth: 104,
    padding: AppSpacing[3],
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  metricLabel: {
    fontSize: AppFontSize.xs,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: AppFontSize.base,
    fontWeight: '800',
  },
  infoLine: {
    gap: 2,
    paddingVertical: 5,
  },
  infoLabel: {
    fontSize: AppFontSize.xs,
    fontWeight: '700',
  },
  infoValue: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  statusTabs: {
    gap: AppSpacing[2],
  },
  statusTab: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: AppSpacing[3],
    paddingVertical: AppSpacing[2],
  },
  statusTabText: {
    fontSize: AppFontSize.xs,
    fontWeight: '800',
  },
  searchInput: {
    borderRadius: 12,
    borderWidth: 1,
    fontSize: AppFontSize.sm,
    marginTop: AppSpacing[3],
    paddingHorizontal: AppSpacing[3],
    paddingVertical: AppSpacing[2],
  },
  exportRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
    marginTop: AppSpacing[3],
  },
  resultRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
    paddingVertical: AppSpacing[3],
  },
  resultHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: AppSpacing[2],
  },
  grow: {
    flex: 1,
    minWidth: 0,
  },
  resultTitle: {
    fontSize: AppFontSize.base,
    fontWeight: '800',
  },
  resultDetail: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  resultMeta: {
    fontSize: AppFontSize.xs,
  },
  resultText: {
    fontSize: AppFontSize.sm,
    lineHeight: 19,
  },
});
