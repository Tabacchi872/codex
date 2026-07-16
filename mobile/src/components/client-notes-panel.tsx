import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { CalendarDays, ChevronRight, FileText, Pencil, Plus, Search, Trash2 } from 'lucide-react-native';

import { AppBadge, AppButton, AppCard, AppTextField } from '@/components/ui';
import { useClientNotes } from '@/hooks/use-client-notes';
import { createClientNote, deleteClientNote, updateClientNote } from '@/lib/client-notes-service';
import { formatDayMonth } from '@/lib/format-date';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import {
  CLIENT_NOTE_CATEGORIES,
  CLIENT_NOTE_CATEGORY_LABEL,
  CLIENT_NOTE_VISIBILITY_LABEL,
  type ClientNote,
  type ClientNoteCategory,
  type ClientNoteInput,
  type ClientNoteVisibility,
} from '@/types/client-note';
import { APPOINTMENT_TYPE_LABEL, type Appointment } from '@/types/appointment';
import type { WorkoutPlan } from '@/types/training';

type ClientNotesPanelProps = {
  clientId: string;
  clientName: string;
  plans: WorkoutPlan[];
  appointments: Appointment[];
  onOpenPlan: (planId: string) => void;
  onOpenAppointment: (appointmentId: string) => void;
};

const EMPTY_FORM: ClientNoteInput = {
  category: 'generale',
  content: '',
  visibility: 'coach_only',
  planId: null,
  appointmentId: null,
};

type VisibilityFilter = 'all' | ClientNoteVisibility;

export function ClientNotesPanel({ clientId, clientName, plans, appointments, onOpenPlan, onOpenAppointment }: ClientNotesPanelProps) {
  const { colors } = useAppTheme();
  const { notes, loading, error, reload, setNotes } = useClientNotes(clientId);
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ClientNoteCategory>('all');
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<ClientNote | null>(null);
  const [draft, setDraft] = useState<ClientNoteInput>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const planById = useMemo(() => new Map(plans.map((plan) => [plan.id, plan])), [plans]);
  const appointmentById = useMemo(() => new Map(appointments.map((appointment) => [appointment.id, appointment])), [appointments]);
  const filteredNotes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return notes.filter((note) => {
      if (visibilityFilter !== 'all' && note.visibility !== visibilityFilter) return false;
      if (categoryFilter !== 'all' && note.category !== categoryFilter) return false;
      if (!normalizedQuery) return true;
      const planName = note.planId ? planById.get(note.planId)?.name ?? '' : '';
      const appointmentTitle = note.appointmentId ? appointmentById.get(note.appointmentId)?.title ?? '' : '';
      return `${note.content} ${CLIENT_NOTE_CATEGORY_LABEL[note.category]} ${planName} ${appointmentTitle}`.toLowerCase().includes(normalizedQuery);
    });
  }, [appointmentById, categoryFilter, notes, planById, query, visibilityFilter]);

  function openCreateForm() {
    setEditingNote(null);
    setDraft(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  }

  function openEditForm(note: ClientNote) {
    setEditingNote(note);
    setDraft({
      category: note.category,
      content: note.content,
      visibility: note.visibility,
      planId: note.planId,
      appointmentId: note.appointmentId,
    });
    setFormError(null);
    setFormOpen(true);
  }

  async function handleSave() {
    if (saving) return;
    if (!draft.content.trim()) {
      setFormError('Scrivi il testo della nota.');
      return;
    }
    setSaving(true);
    setFormError(null);
    const result = editingNote ? await updateClientNote(editingNote.id, clientId, draft) : await createClientNote(clientId, draft);
    setSaving(false);
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    setNotes((current) => {
      const withoutCurrent = current.filter((note) => note.id !== result.data.id);
      return [result.data, ...withoutCurrent].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
    setFormOpen(false);
    setEditingNote(null);
    setDraft(EMPTY_FORM);
  }

  function requestDelete(note: ClientNote) {
    const execute = () => void handleDelete(note);
    if (Platform.OS === 'web') {
      if (globalThis.confirm('Eliminare questa nota?')) execute();
      return;
    }
    Alert.alert('Elimina nota', 'La nota verra rimossa dalla lista senza eliminare schede o appuntamenti collegati.', [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Elimina', style: 'destructive', onPress: execute },
    ]);
  }

  async function handleDelete(note: ClientNote) {
    if (deletingId) return;
    setDeletingId(note.id);
    const result = await deleteClientNote(note.id, clientId);
    setDeletingId(null);
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    setNotes((current) => current.filter((item) => item.id !== note.id));
  }

  if (loading) {
    return (
      <AppCard style={styles.stateCard}>
        <Text style={[styles.cardTitle, { color: colors.ink }]}>Note</Text>
        <Text style={[styles.bodyText, { color: colors.inkSoft }]}>Caricamento note...</Text>
      </AppCard>
    );
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>Note</Text>
          <Text style={[styles.bodyText, { color: colors.inkSoft }]} numberOfLines={2}>
            Informazioni operative su {clientName}
          </Text>
        </View>
        <AppButton
          label={notes.length > 0 ? 'Nuova nota' : 'Aggiungi nota'}
          onPress={openCreateForm}
          variant="primary"
          size="sm"
          icon={<Plus size={16} color={colors.onMoss} />}
        />
      </View>

      {error ? (
        <AppCard style={styles.stateCard}>
          <Text style={[styles.bodyText, { color: colors.rust }]}>{error}</Text>
          <AppButton label="Riprova" onPress={reload} variant="outline" size="sm" />
        </AppCard>
      ) : null}

      {formOpen ? (
        <NoteForm
          draft={draft}
          editing={Boolean(editingNote)}
          error={formError}
          saving={saving}
          plans={plans}
          appointments={appointments}
          onChange={setDraft}
          onCancel={() => {
            setFormOpen(false);
            setEditingNote(null);
            setDraft(EMPTY_FORM);
            setFormError(null);
          }}
          onSave={handleSave}
        />
      ) : null}

      {notes.length === 0 && !formOpen ? (
        <AppCard style={styles.emptyCard}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceSubtle }]}>
            <FileText size={22} color={colors.moss} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.ink }]}>Nessuna nota</Text>
          <Text style={[styles.bodyText, { color: colors.inkSoft }]}>Aggiungi informazioni utili sul percorso del cliente</Text>
          <AppButton label="Aggiungi nota" onPress={openCreateForm} variant="primary" fullWidth />
        </AppCard>
      ) : null}

      {notes.length > 0 ? (
        <>
          <AppCard style={styles.filtersCard}>
            <View style={styles.filterRow}>
              <FilterChip label="Tutte" active={visibilityFilter === 'all'} onPress={() => setVisibilityFilter('all')} />
              <FilterChip label="Solo coach" active={visibilityFilter === 'coach_only'} onPress={() => setVisibilityFilter('coach_only')} />
              <FilterChip label="Condivise" active={visibilityFilter === 'shared'} onPress={() => setVisibilityFilter('shared')} />
            </View>
            <View style={styles.filterRow}>
              <FilterChip label="Categorie" active={categoryFilter === 'all'} onPress={() => setCategoryFilter('all')} />
              {CLIENT_NOTE_CATEGORIES.map((category) => (
                <FilterChip
                  key={category}
                  label={CLIENT_NOTE_CATEGORY_LABEL[category]}
                  active={categoryFilter === category}
                  onPress={() => setCategoryFilter(category)}
                />
              ))}
            </View>
            <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.surfaceSubtle }]}>
              <Search size={16} color={colors.inkFaint} />
              <AppTextField
                value={query}
                onChangeText={setQuery}
                placeholder="Cerca nelle note"
                style={styles.searchInput}
              />
            </View>
          </AppCard>

          {filteredNotes.length === 0 ? (
            <AppCard style={styles.stateCard}>
              <Text style={[styles.bodyText, { color: colors.inkSoft }]}>Nessuna nota corrisponde ai filtri.</Text>
            </AppCard>
          ) : (
            filteredNotes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                plan={note.planId ? planById.get(note.planId) : undefined}
                appointment={note.appointmentId ? appointmentById.get(note.appointmentId) : undefined}
                deleting={deletingId === note.id}
                onEdit={() => openEditForm(note)}
                onDelete={() => requestDelete(note)}
                onOpenPlan={onOpenPlan}
                onOpenAppointment={onOpenAppointment}
              />
            ))
          )}
        </>
      ) : null}

      {formError && !formOpen ? <Text style={[styles.inlineError, { color: colors.rust }]}>{formError}</Text> : null}
    </View>
  );
}

function NoteForm({
  draft,
  editing,
  error,
  saving,
  plans,
  appointments,
  onChange,
  onCancel,
  onSave,
}: {
  draft: ClientNoteInput;
  editing: boolean;
  error: string | null;
  saving: boolean;
  plans: WorkoutPlan[];
  appointments: Appointment[];
  onChange: (draft: ClientNoteInput) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <AppCard style={styles.formCard}>
      <Text style={[styles.cardTitle, { color: colors.ink }]}>{editing ? 'Modifica nota' : 'Nuova nota'}</Text>

      <View style={styles.formGroup}>
        <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>Categoria</Text>
        <View style={styles.filterRow}>
          {CLIENT_NOTE_CATEGORIES.map((category) => (
            <FilterChip
              key={category}
              label={CLIENT_NOTE_CATEGORY_LABEL[category]}
              active={draft.category === category}
              onPress={() => onChange({ ...draft, category })}
            />
          ))}
        </View>
      </View>

      <AppTextField
        label="Testo della nota"
        value={draft.content}
        onChangeText={(content) => onChange({ ...draft, content })}
        placeholder="Scrivi una nota utile per il percorso del cliente"
        multiline
        textAlignVertical="top"
        error={error ?? undefined}
        style={styles.textArea}
      />

      <View style={styles.formGroup}>
        <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>Visibilita</Text>
        <View style={styles.filterRow}>
          <FilterChip label="Solo coach" active={draft.visibility === 'coach_only'} onPress={() => onChange({ ...draft, visibility: 'coach_only' })} />
          <FilterChip label="Condivisa con il cliente" active={draft.visibility === 'shared'} onPress={() => onChange({ ...draft, visibility: 'shared' })} />
        </View>
      </View>

      <LinkedPicker
        title="Scheda collegata"
        emptyLabel="Nessuna scheda"
        items={plans.map((plan) => ({ id: plan.id, label: plan.name }))}
        value={draft.planId ?? null}
        onChange={(planId) => onChange({ ...draft, planId })}
      />

      <LinkedPicker
        title="Appuntamento collegato"
        emptyLabel="Nessun appuntamento"
        items={appointments.map((appointment) => ({
          id: appointment.id,
          label: `${formatDayMonth(appointment.date)} · ${appointment.startTime} · ${appointment.title || APPOINTMENT_TYPE_LABEL[appointment.type]}`,
        }))}
        value={draft.appointmentId ?? null}
        onChange={(appointmentId) => onChange({ ...draft, appointmentId })}
      />

      <View style={styles.formActions}>
        <AppButton label="Annulla" onPress={onCancel} variant="outline" fullWidth disabled={saving} />
        <AppButton label={editing ? 'Salva modifiche' : 'Salva nota'} onPress={onSave} loading={saving} fullWidth />
      </View>
    </AppCard>
  );
}

function LinkedPicker({
  title,
  emptyLabel,
  items,
  value,
  onChange,
}: {
  title: string;
  emptyLabel: string;
  items: { id: string; label: string }[];
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.formGroup}>
      <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>{title}</Text>
      <View style={styles.filterRow}>
        <FilterChip label={emptyLabel} active={!value} onPress={() => onChange(null)} />
        {items.map((item) => (
          <FilterChip key={item.id} label={item.label} active={value === item.id} onPress={() => onChange(item.id)} />
        ))}
      </View>
    </View>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={[styles.filterChip, { borderColor: active ? colors.moss : colors.border, backgroundColor: active ? colors.mossSoft : colors.surface }]}>
      <Text style={[styles.filterChipLabel, { color: active ? colors.moss : colors.inkSoft }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function NoteCard({
  note,
  plan,
  appointment,
  deleting,
  onEdit,
  onDelete,
  onOpenPlan,
  onOpenAppointment,
}: {
  note: ClientNote;
  plan?: WorkoutPlan;
  appointment?: Appointment;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onOpenPlan: (planId: string) => void;
  onOpenAppointment: (appointmentId: string) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <AppCard style={styles.noteCard}>
      <View style={styles.noteTopRow}>
        <AppBadge label={CLIENT_NOTE_CATEGORY_LABEL[note.category]} tone={note.visibility === 'shared' ? 'moss' : 'neutral'} />
        <AppBadge label={CLIENT_NOTE_VISIBILITY_LABEL[note.visibility]} tone={note.visibility === 'shared' ? 'moss' : 'neutral'} />
      </View>
      <Text style={[styles.noteContent, { color: colors.ink }]} numberOfLines={5}>
        {note.content}
      </Text>
      <View style={styles.noteMetaRow}>
        <Text style={[styles.metaText, { color: colors.inkSoft }]} numberOfLines={1}>
          Coach · {formatDateTime(note.createdAt)}
        </Text>
      </View>

      {plan || note.planId ? (
        <LinkedItem
          icon={<FileText size={15} color={colors.moss} />}
          label={plan?.name ?? 'Scheda non piu disponibile'}
          disabled={!plan}
          onPress={() => (plan ? onOpenPlan(plan.id) : undefined)}
        />
      ) : null}
      {appointment || note.appointmentId ? (
        <LinkedItem
          icon={<CalendarDays size={15} color={colors.moss} />}
          label={appointment ? `${formatDayMonth(appointment.date)} · ${appointment.startTime} · ${appointment.title}` : 'Appuntamento non piu disponibile'}
          disabled={!appointment}
          onPress={() => (appointment ? onOpenAppointment(appointment.id) : undefined)}
        />
      ) : null}

      <View style={styles.noteActions}>
        <Pressable onPress={onEdit} hitSlop={6} style={[styles.iconAction, { borderColor: colors.border }]}>
          <Pencil size={15} color={colors.inkSoft} />
          <Text style={[styles.actionText, { color: colors.inkSoft }]}>Modifica</Text>
        </Pressable>
        <Pressable onPress={onDelete} disabled={deleting} hitSlop={6} style={[styles.iconAction, { borderColor: colors.rustSoft, opacity: deleting ? 0.5 : 1 }]}>
          <Trash2 size={15} color={colors.rust} />
          <Text style={[styles.actionText, { color: colors.rust }]}>{deleting ? 'Elimino...' : 'Elimina'}</Text>
        </Pressable>
      </View>
    </AppCard>
  );
}

function LinkedItem({ icon, label, disabled, onPress }: { icon: ReactNode; label: string; disabled: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.linkedItem, { borderColor: colors.border, opacity: disabled ? 0.65 : 1 }]}>
      {icon}
      <Text style={[styles.linkedText, { color: disabled ? colors.inkFaint : colors.inkSoft }]} numberOfLines={1}>
        {label}
      </Text>
      {!disabled ? <ChevronRight size={16} color={colors.inkFaint} /> : null}
    </Pressable>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  wrapper: {
    gap: AppSpacing[3],
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[3],
    justifyContent: 'space-between',
    minWidth: 0,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  sectionTitle: {
    fontSize: AppFontSize.xl,
    fontWeight: '800',
    lineHeight: 26,
  },
  cardTitle: {
    fontSize: AppFontSize.base,
    fontWeight: '800',
  },
  bodyText: {
    fontSize: AppFontSize.sm,
    lineHeight: 19,
  },
  stateCard: {
    gap: AppSpacing[2],
  },
  emptyCard: {
    alignItems: 'flex-start',
    gap: AppSpacing[3],
  },
  emptyIcon: {
    alignItems: 'center',
    borderRadius: AppRadius.lg,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  emptyTitle: {
    fontSize: AppFontSize.lg,
    fontWeight: '800',
  },
  filtersCard: {
    gap: AppSpacing[3],
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  filterChip: {
    borderRadius: AppRadius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '100%',
    minHeight: 32,
    paddingHorizontal: AppSpacing[3],
    justifyContent: 'center',
  },
  filterChipLabel: {
    fontSize: AppFontSize.xs,
    fontWeight: '700',
  },
  searchBox: {
    alignItems: 'center',
    borderRadius: AppRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: AppSpacing[2],
    paddingHorizontal: AppSpacing[3],
  },
  searchInput: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    flex: 1,
    fontSize: AppFontSize.sm,
    minHeight: 38,
    paddingHorizontal: 0,
  },
  formCard: {
    gap: AppSpacing[3],
  },
  formGroup: {
    gap: AppSpacing[2],
  },
  fieldLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  textArea: {
    minHeight: 120,
    paddingTop: AppSpacing[3],
  },
  formActions: {
    gap: AppSpacing[2],
  },
  noteCard: {
    gap: AppSpacing[3],
  },
  noteTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  noteContent: {
    fontSize: AppFontSize.base,
    fontWeight: '600',
    lineHeight: 22,
  },
  noteMetaRow: {
    flexDirection: 'row',
    minWidth: 0,
  },
  metaText: {
    flex: 1,
    fontSize: AppFontSize.xs,
    minWidth: 0,
  },
  linkedItem: {
    alignItems: 'center',
    borderRadius: AppRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: AppSpacing[2],
    minHeight: 38,
    minWidth: 0,
    paddingHorizontal: AppSpacing[3],
  },
  linkedText: {
    flex: 1,
    fontSize: AppFontSize.sm,
    fontWeight: '600',
    minWidth: 0,
  },
  noteActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  iconAction: {
    alignItems: 'center',
    borderRadius: AppRadius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: AppSpacing[1],
    minHeight: 34,
    paddingHorizontal: AppSpacing[3],
  },
  actionText: {
    fontSize: AppFontSize.xs,
    fontWeight: '800',
  },
  inlineError: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
});
