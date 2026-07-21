import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronRight, Dumbbell, Folder, Pencil, Trash2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CoachOnlyNotice } from './coach-only-notice';
import { TemplateFolderDeleteModal } from './template-folder-delete-modal';
import { TemplateFolderNameModal } from './template-folder-name-modal';
import { AppBadge, AppButton, AppCard, AppIconButton, AppPressableCard, BackHeader } from './ui';

import { BottomTabInset } from '@/constants/theme';
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
  const systemTemplates = isRoot ? templates.filter((t) => t.isSystem).sort((a, b) => a.name.localeCompare(b.name)) : [];
  const subfolders = folders.filter((f) => f.parentFolderId === folderId).sort((a, b) => a.name.localeCompare(b.name));
  const personalItems = templates
    .filter((t) => !t.isSystem && t.folderId === folderId)
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
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: AppSpacing[2] }} />}
        ListEmptyComponent={
          <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>
            Nessuna cartella o scheda modello qui. Crea una cartella o una nuova scheda modello per iniziare.
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
});
