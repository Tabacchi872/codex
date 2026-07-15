// Check-in settimanale compilato dal cliente. Le foto sono URI locali prese
// dalla libreria del dispositivo (expo-image-picker): su web sono blob URL
// validi solo per la sessione del browser corrente, non sono caricate da
// nessuna parte — persistenza reale del riferimento, non del file (nessun
// backend per l'upload ancora esistente).

export type ProgramIntensity = 'molto_intenso' | 'medio_intenso' | 'medio' | 'troppo_facile';

export const PROGRAM_INTENSITY_LABEL: Record<ProgramIntensity, string> = {
  molto_intenso: 'Molto intenso',
  medio_intenso: 'Mediamente intenso',
  medio: 'Medio',
  troppo_facile: 'Troppo facile',
};

export type WeeklyCheckin = {
  id: string;
  clientId: string;
  date: string;
  weightToday: number | null;
  frontPhotoUri: string | null;
  sidePhotoUri: string | null;
  backPhotoUri: string | null;
  exerciseIssues: string;
  intensity: ProgramIntensity | null;
  notes: string;
  createdAt: string;
};
