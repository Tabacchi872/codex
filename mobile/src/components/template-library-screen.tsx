import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronRight, Dumbbell, Filter, Folder, Pencil, Search, Trash2, X } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CoachOnlyNotice } from './coach-only-notice';
import { TemplateFolderDeleteModal } from './template-folder-delete-modal';
import { TemplateFolderNameModal } from './template-folder-name-modal';
import { AppBadge, AppButton, AppCard, AppIconButton, AppPressableCard, AppTextField, BackHeader } from './ui';

import { BottomTabInset } from '@/constants/theme';
import { getExerciseById } from '@/data/exercise-library';
import { getCurrentSession } from '@/lib/auth-service';
import { supabaseConfig } from '@/lib/supabase';
import {
  createTemplateFolder,
  deleteTemplateFolder,
  listTemplateFolders,
  listWorkoutTemplateSummaries,
  renameTemplateFolder,
} from '@/lib/workout-plan-service';
import { useAuthStore } from '@/store/auth-store';
import { AppFontSize, AppRadius, AppSpacing, AppTextStyle, useAppTheme } from '@/theme';
import type { TemplateFolder, TemplateFolderDeleteMode, WorkoutTemplateSummary } from '@/types/template-library';

// Filtri combinabili della libreria (richiesti esplicitamente): obiettivo,
// livello, sessioni/settimana, durata programma, attrezzatura, luogo, stile,
// focus muscolare, intensita, sistema/personale, cartella. Nessun campo
// "tag" esiste in tabella: la ricerca testuale copre nome modello, nome
// esercizio (via exerciseIds -> exercise-library) e un match aggregato su
// obiettivo/stile/focus muscolare/attrezzatura/luogo/intensita, che insieme
// fungono da "tag" liberi del modello.
type LibraryFilters = {
  kind: 'all' | 'system' | 'personal';
  goal: string | null;
  level: string | null;
  sessionsPerWeek: number | null;
  durationWeeks: number | null;
  equipment: string | null;
  location: string | null;
  trainingStyle: string | null;
  muscleFocus: string | null;
  intensity: string | null;
  folderId: string | null;
};

const EMPTY_FILTERS: LibraryFilters = {
  kind: 'all',
  goal: null,
  level: null,
  sessionsPerWeek: null,
  durationWeeks: null,
  equipment: null,
  location: null,
  trainingStyle: null,
  muscleFocus: null,
  intensity: null,
  folderId: null,
};

function uniqueSorted(values: (string | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));
}

function uniqueSortedNumbers(values: (number | undefined)[]): number[] {
  return [...new Set(values.filter((v): v is number => v !== undefined))].sort((a, b) => a - b);
}

function templateSearchHaystack(template: WorkoutTemplateSummary): string {
  const exerciseNames = template.exerciseIds.map((id) => getExerciseById(id)?.name ?? '');
  return [
    template.name,
    template.goal,
    template.level,
    template.trainingStyle,
    template.muscleFocus,
    template.equipment,
    template.location,
    template.intensity,
    ...exerciseNames,
  ]
    .join(' ')
    .toLowerCase();
}

function matchesLibraryFilters(template: WorkoutTemplateSummary, filters: LibraryFilters): boolean {
  if (filters.kind === 'system' && !template.isSystem) return false;
  if (filters.kind === 'personal' && template.isSystem) return false;
  if (filters.goal && template.goal !== filters.goal) return false;
  if (filters.level && template.level !== filters.level) return false;
  if (filters.sessionsPerWeek && template.sessionsPerWeek !== filters.sessionsPerWeek) return false;
  if (filters.durationWeeks && template.durationWeeks !== filters.durationWeeks) return false;
  if (filters.equipment && template.equipment !== filters.equipment) return false;
  if (filters.location && template.location !== filters.location) return false;
  if (filters.trainingStyle && template.trainingStyle !== filters.trainingStyle) return false;
  if (filters.muscleFocus && template.muscleFocus !== filters.muscleFocus) return false;
  if (filters.intensity && template.intensity !== filters.intensity) return false;
  // La cartella ha senso solo per i modelli personali: un modello di sistema
  // non vive mai in una cartella, quindi non va MAI escluso da questo
  // filtro, altrimenti selezionare una cartella farebbe sparire l'intera
  // sezione "Professionali".
  if (filters.folderId && !template.isSystem && template.folderId !== filters.folderId) return false;
  return true;
}

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

// Libreria globale del coach: due sezioni SOLO alla radice ("Professionali",
// modelli di sistema, uguali per tutti i coach; "La mia libreria",
// cartelle/sottocartelle -> schede modello personali del coach corrente) —
// dentro una sottocartella si vede solo il contenuto di quella cartella
// personale (i modelli di sistema non vivono in alcuna cartella). NIENTE
// clientId qui, mai: questa schermata (e le sorelle .../cartella/[folderId],
// .../modello/*) non deve MAI importare useClientStore ne' leggere un
// parametro clientId dalla route. Per assegnare una scheda a un cliente si
// passa SEMPRE dal dettaglio del modello ("Assegna a cliente"), mai da qui.
export function TemplateLibraryScreen({ folderId }: { folderId: string | null }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const isCoach = useAuthStore((s) => s.currentRole !== 'cliente');

  const [folders, setFolders] = useState<TemplateFolder[]>([]);
  const [templates, setTemplates] = useState<WorkoutTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState<TemplateFolder | null>(null);
  const [folderModalSaving, setFolderModalSaving] = useState(false);
  const [folderModalError, setFolderModalError] = useState<string | null>(null);

  const [deletingFolder, setDeletingFolder] = useState<TemplateFolder | null>(null);
  const [deleteFolderCounts, setDeleteFolderCounts] = useState<{ subfolderCount: number; templateCount: number } | null>(null);
  const [deleteFolderBusy, setDeleteFolderBusy] = useState(false);
  const [deleteFolderError, setDeleteFolderError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<LibraryFilters>(EMPTY_FILTERS);
  const activeFilterCount = Object.values(filters).filter((v) => v !== null && v !== 'all').length;
  const searchOrFiltersActive = searchQuery.trim().length > 0 || activeFilterCount > 0;

  const filterOptions = useMemo(
    () => ({
      goals: uniqueSorted(templates.map((t) => t.goal)),
      levels: uniqueSorted(templates.map((t) => t.level)),
      sessionsPerWeek: uniqueSortedNumbers(templates.map((t) => t.sessionsPerWeek)),
      durationWeeks: uniqueSortedNumbers(templates.map((t) => t.durationWeeks)),
      equipment: uniqueSorted(templates.map((t) => t.equipment)),
      locations: uniqueSorted(templates.map((t) => t.location)),
      trainingStyles: uniqueSorted(templates.map((t) => t.trainingStyle)),
      muscleFocus: uniqueSorted(templates.map((t) => t.muscleFocus)),
      intensity: uniqueSorted(templates.map((t) => t.intensity)),
      // Solo cartelle di primo livello: il filtro e' un salto rapido dalla
      // radice, non sostituisce la navigazione dentro le sottocartelle.
      folders: [...folders].filter((f) => f.parentFolderId === null).sort((a, b) => a.name.localeCompare(b.name)),
    }),
    [templates, folders],
  );

  function matchesSearchAndFilters(template: WorkoutTemplateSummary): boolean {
    if (!matchesLibraryFilters(template, filters)) return false;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return templateSearchHaystack(template).includes(query);
  }

  const load = useCallback(async () => {
    if (!supabaseConfig.isConfigured) {
      setLoading(false);
      setError("Supabase non e' configurato: la libreria modelli richiede una sessione coach reale.");
      return;
    }
    setError(null);
    const [foldersResult, templatesResult] = await Promise.all([listTemplateFolders(), listWorkoutTemplateSummaries()]);
    if (!foldersResult.ok) {
      setError(foldersResult.message);
      setLoading(false);
      return;
    }
    if (!templatesResult.ok) {
      setError(templatesResult.message);
      setLoading(false);
      return;
    }
    setFolders(foldersResult.data);
    setTemplates(templatesResult.data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!isCoach) {
    return <CoachOnlyNotice />;
  }

  const currentFolder = folderId ? (folders.find((f) => f.id === folderId) ?? null) : null;

  async function handleCreateFolder(name: string) {
    setFolderModalSaving(true);
    setFolderModalError(null);
    const session = await getCurrentSession();
    const coachId = session.ok ? (session.data?.user.id ?? null) : null;
    if (!coachId) {
      setFolderModalSaving(false);
      setFolderModalError('Nessuna sessione coach reale trovata. Prova a rifare il login.');
      return;
    }
    const result = await createTemplateFolder(coachId, { name, parentFolderId: folderId });
    setFolderModalSaving(false);
    if (!result.ok) {
      setFolderModalError(result.message);
      return;
    }
    setShowCreateFolder(false);
    await load();
  }

  async function handleRenameFolder(name: string) {
    if (!renamingFolder) return;
    setFolderModalSaving(true);
    setFolderModalError(null);
    const result = await renameTemplateFolder(renamingFolder.id, name);
    setFolderModalSaving(false);
    if (!result.ok) {
      setFolderModalError(result.message);
      return;
    }
    setRenamingFolder(null);
    await load();
  }

  // Conteggio dell'INTERO sottoalbero (la cartella + tutte le sottocartelle a
  // qualunque profondita'), non solo dei figli diretti — calcolato da dati
  // gia' in memoria (folders/templates, appena caricati da load()), stesso
  // algoritmo della CTE ricorsiva usata da delete_template_folder lato
  // server. Un conteggio superficiale mostrerebbe al coach un "1 sottocartella"
  // anche quando quella sottocartella contiene decine di modelli tre livelli
  // sotto: la scelta "sposta/elimina" deve riflettere l'intero impatto reale.
  // Riguarda SEMPRE e SOLO modelli personali: i modelli di sistema non vivono
  // in alcuna cartella, quindi non compaiono mai in questo conteggio.
  function countFolderSubtree(rootId: string): { subfolderCount: number; templateCount: number } {
    const descendantFolderIds: string[] = [];
    function collect(parentId: string) {
      for (const folder of folders) {
        if (folder.parentFolderId === parentId) {
          descendantFolderIds.push(folder.id);
          collect(folder.id);
        }
      }
    }
    collect(rootId);
    const personalTemplates = templates.filter((t) => !t.isSystem);
    const templateCount = personalTemplates.filter((t) => t.folderId === rootId || (t.folderId && descendantFolderIds.includes(t.folderId))).length;
    return { subfolderCount: descendantFolderIds.length, templateCount };
  }

  async function openDeleteFolder(folder: TemplateFolder) {
    setDeleteFolderError(null);
    const counts = countFolderSubtree(folder.id);
    if (counts.subfolderCount === 0 && counts.templateCount === 0) {
      const confirmed = await confirmDestructive('Elimina cartella', `Eliminare la cartella "${folder.name}"? E' vuota.`, 'Elimina');
      if (!confirmed) return;
      setDeleteFolderBusy(true);
      const result = await deleteTemplateFolder(folder.id, 'move_to_root');
      setDeleteFolderBusy(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      await load();
      return;
    }
    setDeleteFolderCounts(counts);
    setDeletingFolder(folder);
  }

  async function handleDeleteFolderMode(mode: TemplateFolderDeleteMode) {
    if (!deletingFolder) return;
    setDeleteFolderBusy(true);
    setDeleteFolderError(null);
    const result = await deleteTemplateFolder(deletingFolder.id, mode);
    setDeleteFolderBusy(false);
    if (!result.ok) {
      setDeleteFolderError(result.message);
      return;
    }
    setDeletingFolder(null);
    setDeleteFolderCounts(null);
    await load();
  }

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator />
        <Text style={{ color: colors.inkSoft, marginTop: AppSpacing[2] }}>Caricamento libreria modelli…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.ink, fontWeight: '700' }}>Impossibile caricare la libreria.</Text>
        <Text style={{ color: colors.inkSoft, marginTop: 4, textAlign: 'center', paddingHorizontal: AppSpacing[5] }}>{error}</Text>
        <View style={{ marginTop: AppSpacing[3] }}>
          <AppButton label="Riprova" onPress={load} />
        </View>
      </View>
    );
  }

  if (folderId && !currentFolder) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.ink, fontWeight: '700' }}>Cartella non trovata.</Text>
        <Text style={{ color: colors.inkSoft, marginTop: 4 }}>Potrebbe essere stata eliminata o spostata.</Text>
        <View style={{ marginTop: AppSpacing[3] }}>
          <AppButton label="Torna alla libreria" onPress={() => router.replace('/schede')} />
        </View>
      </View>
    );
  }

  const isRoot = folderId === null;
  // Il filtro cartella e' un salto rapido dalla radice ad una cartella
  // qualunque: fuori dalla radice la cartella e' gia' decisa dalla route
  // (folderId), quindi il filtro cartella non si applica mai li'.
  const effectivePersonalFolderId = isRoot && filters.folderId ? filters.folderId : folderId;
  const systemTemplates = isRoot
    ? templates.filter((t) => t.isSystem && matchesSearchAndFilters(t)).sort((a, b) => a.name.localeCompare(b.name))
    : [];
  const subfolders = isRoot && filters.folderId ? [] : folders.filter((f) => f.parentFolderId === folderId).sort((a, b) => a.name.localeCompare(b.name));
  const personalItems = templates
    .filter((t) => !t.isSystem && t.folderId === effectivePersonalFolderId && matchesSearchAndFilters(t))
    .sort((a, b) => a.name.localeCompare(b.name));

  type Row =
    | { key: string; kind: 'section'; title: string; subtitle?: string }
    | { key: string; kind: 'folder'; folder: TemplateFolder }
    | { key: string; kind: 'template'; template: WorkoutTemplateSummary };

  const rows: Row[] = [
    ...(isRoot && systemTemplates.length > 0
      ? [
          { key: 'section-pro', kind: 'section' as const, title: 'Professionali', subtitle: 'Modelli completi pronti da assegnare, non modificabili' },
          ...systemTemplates.map((template) => ({ key: `template-${template.id}`, kind: 'template' as const, template })),
        ]
      : []),
    ...(isRoot ? [{ key: 'section-mine', kind: 'section' as const, title: 'La mia libreria', subtitle: 'I tuoi modelli personali, organizzati in cartelle' }] : []),
    ...subfolders.map((folder) => ({ key: `folder-${folder.id}`, kind: 'folder' as const, folder })),
    ...personalItems.map((template) => ({ key: `template-${template.id}`, kind: 'template' as const, template })),
  ];
  const hasAnyResults = systemTemplates.length > 0 || subfolders.length > 0 || personalItems.length > 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Platform.OS === 'web' ? AppSpacing[5] : insets.top + AppSpacing[3],
            paddingBottom: insets.bottom + BottomTabInset + AppSpacing[4],
          },
        ]}
        ListHeaderComponent={
          <View style={styles.header}>
            {folderId ? (
              <BackHeader title={currentFolder?.name ?? 'Cartella'} fallbackHref="/schede" />
            ) : (
              <View style={styles.titleBlock}>
                <Text style={[AppTextStyle.title, { color: colors.ink }]}>Modelli allenamento</Text>
                <Text style={[styles.subtitle, { color: colors.inkSoft }]}>Modelli professionali e la tua libreria personale</Text>
              </View>
            )}
            <View style={styles.actionsRow}>
              <View style={styles.actionButtonWrap}>
                <AppButton label="+ Cartella" onPress={() => setShowCreateFolder(true)} variant="outline" fullWidth />
              </View>
              <View style={styles.actionButtonWrap}>
                <AppButton
                  label="+ Scheda modello"
                  onPress={() => router.push({ pathname: '/schede/modello/new', params: folderId ? { folderId } : {} })}
                  fullWidth
                />
              </View>
            </View>

            <View style={styles.searchRow}>
              <View style={styles.searchInputWrap}>
                <View style={styles.searchIcon}>
                  <Search size={16} color={colors.inkFaint} />
                </View>
                <AppTextField
                  placeholder="Cerca per nome, esercizio o categoria"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  style={styles.searchInput}
                  returnKeyType="search"
                />
              </View>
              <Pressable
                onPress={() => setShowFilters((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel="Mostra o nascondi i filtri"
                style={[
                  styles.filterToggle,
                  { borderColor: activeFilterCount > 0 ? colors.coral : colors.border, backgroundColor: showFilters ? colors.coralSoft : colors.surface },
                ]}>
                <Filter size={18} color={activeFilterCount > 0 ? colors.coral : colors.inkSoft} />
                {activeFilterCount > 0 ? (
                  <View style={[styles.filterCountBadge, { backgroundColor: colors.coral }]}>
                    <Text style={styles.filterCountText}>{activeFilterCount}</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>

            {showFilters ? (
              <View style={[styles.filterPanel, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <FilterChipGroup
                  label="Tipo"
                  options={[
                    { value: 'all', label: 'Tutti' },
                    { value: 'system', label: 'Professionali' },
                    { value: 'personal', label: 'Personali' },
                  ]}
                  selected={filters.kind}
                  onSelect={(value) => setFilters((f) => ({ ...f, kind: value as LibraryFilters['kind'] }))}
                />
                <FilterChipGroup
                  label="Obiettivo"
                  options={filterOptions.goals.map((v) => ({ value: v, label: v }))}
                  selected={filters.goal}
                  onSelect={(value) => setFilters((f) => ({ ...f, goal: f.goal === value ? null : value }))}
                />
                <FilterChipGroup
                  label="Livello"
                  options={filterOptions.levels.map((v) => ({ value: v, label: v }))}
                  selected={filters.level}
                  onSelect={(value) => setFilters((f) => ({ ...f, level: f.level === value ? null : value }))}
                />
                <FilterChipGroup
                  label="Sessioni a settimana"
                  options={filterOptions.sessionsPerWeek.map((v) => ({ value: String(v), label: `${v}x` }))}
                  selected={filters.sessionsPerWeek !== null ? String(filters.sessionsPerWeek) : null}
                  onSelect={(value) => setFilters((f) => ({ ...f, sessionsPerWeek: f.sessionsPerWeek === Number(value) ? null : Number(value) }))}
                />
                <FilterChipGroup
                  label="Durata programma"
                  options={filterOptions.durationWeeks.map((v) => ({ value: String(v), label: `${v} sett.` }))}
                  selected={filters.durationWeeks !== null ? String(filters.durationWeeks) : null}
                  onSelect={(value) => setFilters((f) => ({ ...f, durationWeeks: f.durationWeeks === Number(value) ? null : Number(value) }))}
                />
                <FilterChipGroup
                  label="Attrezzatura"
                  options={filterOptions.equipment.map((v) => ({ value: v, label: v }))}
                  selected={filters.equipment}
                  onSelect={(value) => setFilters((f) => ({ ...f, equipment: f.equipment === value ? null : value }))}
                />
                <FilterChipGroup
                  label="Luogo"
                  options={filterOptions.locations.map((v) => ({ value: v, label: v }))}
                  selected={filters.location}
                  onSelect={(value) => setFilters((f) => ({ ...f, location: f.location === value ? null : value }))}
                />
                <FilterChipGroup
                  label="Stile"
                  options={filterOptions.trainingStyles.map((v) => ({ value: v, label: v }))}
                  selected={filters.trainingStyle}
                  onSelect={(value) => setFilters((f) => ({ ...f, trainingStyle: f.trainingStyle === value ? null : value }))}
                />
                <FilterChipGroup
                  label="Focus muscolare"
                  options={filterOptions.muscleFocus.map((v) => ({ value: v, label: v }))}
                  selected={filters.muscleFocus}
                  onSelect={(value) => setFilters((f) => ({ ...f, muscleFocus: f.muscleFocus === value ? null : value }))}
                />
                <FilterChipGroup
                  label="Intensita"
                  options={filterOptions.intensity.map((v) => ({ value: v, label: v }))}
                  selected={filters.intensity}
                  onSelect={(value) => setFilters((f) => ({ ...f, intensity: f.intensity === value ? null : value }))}
                />
                {isRoot && filterOptions.folders.length > 0 ? (
                  <FilterChipGroup
                    label="Cartella (solo la mia libreria)"
                    options={filterOptions.folders.map((f) => ({ value: f.id, label: f.name }))}
                    selected={filters.folderId}
                    onSelect={(value) => setFilters((f) => ({ ...f, folderId: f.folderId === value ? null : value }))}
                  />
                ) : null}
                {activeFilterCount > 0 || searchQuery ? (
                  <Pressable
                    onPress={() => {
                      setFilters(EMPTY_FILTERS);
                      setSearchQuery('');
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Cancella filtri e ricerca"
                    style={styles.clearFiltersButton}>
                    <X size={14} color={colors.coral} />
                    <Text style={[styles.clearFiltersText, { color: colors.coral }]}>Cancella filtri</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {searchOrFiltersActive ? (
              <Text style={[styles.resultsCount, { color: colors.inkSoft }]}>
                {hasAnyResults
                  ? `${systemTemplates.length + personalItems.length} ${systemTemplates.length + personalItems.length === 1 ? 'risultato' : 'risultati'}`
                  : 'Nessun risultato'}
              </Text>
            ) : null}
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: AppSpacing[2] }} />}
        ListEmptyComponent={
          <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>
            {searchOrFiltersActive
              ? 'Nessun risultato per la ricerca o i filtri selezionati.'
              : 'Nessuna cartella o scheda modello qui. Crea una cartella o una nuova scheda modello per iniziare.'}
          </Text>
        }
        renderItem={({ item }) => {
          if (item.kind === 'section') {
            return (
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.ink }]}>{item.title}</Text>
                {item.subtitle ? <Text style={[styles.sectionSubtitle, { color: colors.inkSoft }]}>{item.subtitle}</Text> : null}
              </View>
            );
          }
          if (item.kind === 'folder') {
            return (
              <FolderRow
                folder={item.folder}
                onPress={() => router.push(`/schede/cartella/${item.folder.id}`)}
                onRename={() => {
                  setFolderModalError(null);
                  setRenamingFolder(item.folder);
                }}
                onDelete={() => openDeleteFolder(item.folder)}
              />
            );
          }
          return <TemplateRow template={item.template} onPress={() => router.push(`/schede/modello/${item.template.id}`)} />;
        }}
      />

      <TemplateFolderNameModal
        visible={showCreateFolder}
        title="Nuova cartella"
        initialName=""
        saving={folderModalSaving}
        error={folderModalError}
        onCancel={() => {
          setShowCreateFolder(false);
          setFolderModalError(null);
        }}
        onConfirm={handleCreateFolder}
      />
      <TemplateFolderNameModal
        visible={!!renamingFolder}
        title="Rinomina cartella"
        initialName={renamingFolder?.name ?? ''}
        saving={folderModalSaving}
        error={folderModalError}
        onCancel={() => {
          setRenamingFolder(null);
          setFolderModalError(null);
        }}
        onConfirm={handleRenameFolder}
      />
      <TemplateFolderDeleteModal
        visible={!!deletingFolder}
        folderName={deletingFolder?.name ?? ''}
        subfolderCount={deleteFolderCounts?.subfolderCount ?? 0}
        templateCount={deleteFolderCounts?.templateCount ?? 0}
        deleting={deleteFolderBusy}
        error={deleteFolderError}
        onCancel={() => {
          setDeletingFolder(null);
          setDeleteFolderCounts(null);
          setDeleteFolderError(null);
        }}
        onMoveToRoot={() => handleDeleteFolderMode('move_to_root')}
        onDeleteAll={() => handleDeleteFolderMode('delete_all')}
      />
    </View>
  );
}

// AppCard (contenitore visuale puro, mai Pressable) con DUE elementi
// interattivi affiancati (area nome per navigare + due AppIconButton per
// rinomina/elimina): mai annidati l'uno nell'altro, per non ripetere BUG-009
// (<button> dentro <button>, hydration React rotta su web).
function FolderRow({
  folder,
  onPress,
  onRename,
  onDelete,
}: {
  folder: TemplateFolder;
  onPress: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <AppCard style={styles.folderRow}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Apri cartella ${folder.name}`} style={styles.folderRowMain} hitSlop={2}>
        <View style={[styles.folderIcon, { backgroundColor: colors.mossSoft }]}>
          <Folder size={22} color={colors.moss} />
        </View>
        <Text style={[styles.folderName, { color: colors.ink }]} numberOfLines={1}>
          {folder.name}
        </Text>
        <ChevronRight size={18} color={colors.inkFaint} />
      </Pressable>
      <View style={styles.folderActions}>
        <AppIconButton icon={<Pencil size={16} color={colors.inkSoft} />} onPress={onRename} accessibilityLabel={`Rinomina cartella ${folder.name}`} size={36} />
        <AppIconButton icon={<Trash2 size={16} color={colors.rust} />} onPress={onDelete} accessibilityLabel={`Elimina cartella ${folder.name}`} size={36} />
      </View>
    </AppCard>
  );
}

// Gruppo di chip a selezione singola (tap su una chip gia' selezionata la
// deseleziona): usato per ogni dimensione di filtro combinabile della
// libreria. Le opzioni sono sempre derivate dai dati caricati (mai
// hardcoded), quindi un gruppo senza opzioni non viene mai renderizzato dal
// chiamante.
function FilterChipGroup({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string | null;
  onSelect: (value: string) => void;
}) {
  const { colors } = useAppTheme();
  if (options.length === 0) return null;
  return (
    <View style={styles.filterGroup}>
      <Text style={[styles.filterGroupLabel, { color: colors.inkSoft }]}>{label}</Text>
      <View style={styles.filterChipsRow}>
        {options.map((option) => {
          const active = selected === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onSelect(option.value)}
              accessibilityRole="button"
              accessibilityLabel={`Filtra per ${label}: ${option.label}`}
              style={[
                styles.filterChip,
                { borderColor: active ? colors.coral : colors.border, backgroundColor: active ? colors.coralSoft : colors.surfaceSubtle },
              ]}>
              <Text style={[styles.filterChipText, { color: active ? colors.coral : colors.inkSoft }]} numberOfLines={1}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function TemplateRow({ template, onPress }: { template: WorkoutTemplateSummary; onPress: () => void }) {
  const { colors } = useAppTheme();
  const metaParts: string[] = [];
  if (template.durationWeeks) metaParts.push(`${template.durationWeeks} sett.`);
  if (template.sessionsPerWeek) metaParts.push(`${template.sessionsPerWeek}x/sett.`);
  metaParts.push(`${template.dayCount} ${template.dayCount === 1 ? 'giorno' : 'giorni'}`);
  metaParts.push(`${template.exerciseCount} esercizi`);

  return (
    <AppPressableCard onPress={onPress} accessibilityLabel={`Apri scheda modello ${template.name}`} style={styles.templateRow}>
      <View style={[styles.templateIcon, { backgroundColor: template.isSystem ? colors.mossSoft : colors.coralSoft }]}>
        <Dumbbell size={24} color={template.isSystem ? colors.moss : colors.coral} />
      </View>
      <View style={styles.templateCopy}>
        <Text style={[styles.templateName, { color: colors.ink }]} numberOfLines={2}>
          {template.name}
        </Text>
        <View style={styles.templateBadges}>
          {template.goal ? <AppBadge label={template.goal} tone="moss" /> : null}
          {template.level ? <AppBadge label={template.level} /> : null}
        </View>
        <Text style={[styles.templateMeta, { color: colors.inkSoft }]} numberOfLines={1}>
          {metaParts.join(' · ')}
        </Text>
      </View>
      <ChevronRight size={20} color={colors.inkFaint} />
    </AppPressableCard>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: AppSpacing[5] },
  header: { gap: AppSpacing[3], marginBottom: AppSpacing[2] },
  titleBlock: { gap: 4 },
  subtitle: { fontSize: AppFontSize.sm, fontWeight: '600' },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: AppSpacing[2] },
  actionButtonWrap: { flexBasis: 140, flexGrow: 1, minWidth: 0 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sectionHeader: { gap: 2, marginTop: AppSpacing[2], marginBottom: AppSpacing[1] },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  sectionSubtitle: { fontSize: AppFontSize.sm, fontWeight: '500' },
  folderRow: { flexDirection: 'row', alignItems: 'center', gap: AppSpacing[2], padding: AppSpacing[3] },
  folderRowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: AppSpacing[3], minWidth: 0 },
  folderIcon: { width: 44, height: 44, borderRadius: AppRadius.lg, alignItems: 'center', justifyContent: 'center' },
  folderName: { flex: 1, fontSize: 16, fontWeight: '700', minWidth: 0 },
  folderActions: { flexDirection: 'row', gap: AppSpacing[1] },
  templateRow: { alignItems: 'center', flexDirection: 'row', gap: AppSpacing[3], padding: AppSpacing[3] },
  templateIcon: { alignItems: 'center', justifyContent: 'center', borderRadius: AppRadius.xl, height: 56, width: 56 },
  templateCopy: { flex: 1, gap: 4, minWidth: 0 },
  templateName: { fontSize: 16, fontWeight: '700', lineHeight: 21 },
  templateBadges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: AppSpacing[1] },
  templateMeta: { fontSize: 12, fontWeight: '600' },
  searchRow: { flexDirection: 'row', alignItems: 'flex-start', gap: AppSpacing[2] },
  searchInputWrap: { flex: 1, position: 'relative', justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: AppSpacing[3], top: 0, bottom: 0, justifyContent: 'center', zIndex: 1 },
  searchInput: { paddingLeft: AppSpacing[3] + 22 },
  filterToggle: {
    width: 46,
    height: 46,
    borderRadius: AppRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCountBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  filterCountText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  filterPanel: { borderWidth: StyleSheet.hairlineWidth, borderRadius: AppRadius.lg, padding: AppSpacing[3], gap: AppSpacing[3] },
  filterGroup: { gap: 6 },
  filterGroupLabel: { fontSize: AppFontSize.sm - 1, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  filterChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: AppSpacing[1] },
  filterChip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: AppRadius.xs, paddingHorizontal: 10, paddingVertical: 6 },
  filterChipText: { fontSize: AppFontSize.sm - 1, fontWeight: '700' },
  clearFiltersButton: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 },
  clearFiltersText: { fontSize: AppFontSize.sm, fontWeight: '700' },
  resultsCount: { fontSize: AppFontSize.sm, fontWeight: '600' },
});
