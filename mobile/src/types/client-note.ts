export type ClientNoteCategory =
  | 'generale'
  | 'allenamento'
  | 'nutrizione'
  | 'obiettivo'
  | 'limitazione'
  | 'appuntamento'
  | 'progressi'
  | 'altro';

export type ClientNoteVisibility = 'coach_only' | 'shared';

export type ClientNote = {
  id: string;
  coachId: string;
  clientId: string;
  category: ClientNoteCategory;
  content: string;
  visibility: ClientNoteVisibility;
  planId: string | null;
  appointmentId: string | null;
  createdBy: string;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string;
  deletedAt: string | null;
};

export type ClientNoteInput = {
  category: ClientNoteCategory;
  content: string;
  visibility: ClientNoteVisibility;
  planId?: string | null;
  appointmentId?: string | null;
};

export const CLIENT_NOTE_CATEGORIES: ClientNoteCategory[] = [
  'generale',
  'allenamento',
  'nutrizione',
  'obiettivo',
  'limitazione',
  'appuntamento',
  'progressi',
  'altro',
];

export const CLIENT_NOTE_CATEGORY_LABEL: Record<ClientNoteCategory, string> = {
  generale: 'Generale',
  allenamento: 'Allenamento',
  nutrizione: 'Nutrizione',
  obiettivo: 'Obiettivo',
  limitazione: 'Limitazione',
  appuntamento: 'Appuntamento',
  progressi: 'Progressi',
  altro: 'Altro',
};

export const CLIENT_NOTE_VISIBILITY_LABEL: Record<ClientNoteVisibility, string> = {
  coach_only: 'Solo coach',
  shared: 'Condivisa',
};
