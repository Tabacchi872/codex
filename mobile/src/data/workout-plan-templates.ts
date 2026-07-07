import type { WorkoutPlanTemplate } from '@/types/workout-template';

// Catalogo statico dei modelli predefiniti — non un array persistito/editabile
// dal coach (i modelli non si modificano mai in-place, vedi docs/DECISIONS.md).
// Stesso pattern di EXERCISE_LIBRARY: dati seed, mai mutati a runtime.
export const WORKOUT_PLAN_TEMPLATES: WorkoutPlanTemplate[] = [
  {
    id: 'tpl-dimagrimento-base',
    title: 'Dimagrimento base',
    goal: 'Perdita peso',
    level: 'Principiante/Intermedio',
    daysPerWeek: 3,
    durationWeeks: 8,
    description: 'Full body in circuito, tre sedute a settimana, alta densità di lavoro e finisher cardio per massimizzare il dispendio calorico.',
    sessions: [
      {
        id: 'tpl-dim-1',
        title: 'Full body A',
        exercises: [
          { exerciseId: 'gambe-squat', sets: 3, reps: 15, restSeconds: 45 },
          { exerciseId: 'petto-chest-press', sets: 3, reps: 15, restSeconds: 45 },
          { exerciseId: 'dorso-lat-machine-avanti', sets: 3, reps: 15, restSeconds: 45 },
          { exerciseId: 'core-plank', sets: 3, reps: 1, repsMin: 30, repsMax: 30, restSeconds: 30, notes: 'Tenuta in secondi.' },
          { exerciseId: 'cardio-jumping-jack', sets: 3, reps: 1, repsMin: 30, repsMax: 30, restSeconds: 30, notes: '30 secondi di lavoro per serie.' },
        ],
      },
      {
        id: 'tpl-dim-2',
        title: 'Full body B',
        exercises: [
          { exerciseId: 'gambe-leg-press', sets: 3, reps: 15, restSeconds: 45 },
          { exerciseId: 'dorso-pulley-basso', sets: 3, reps: 15, restSeconds: 45 },
          { exerciseId: 'spalle-shoulder-press', sets: 3, reps: 15, restSeconds: 45 },
          { exerciseId: 'core-russian-twist', sets: 3, reps: 20, restSeconds: 30 },
          { exerciseId: 'cardio-burpees', sets: 3, reps: 10, restSeconds: 45 },
        ],
      },
      {
        id: 'tpl-dim-3',
        title: 'Full body C',
        exercises: [
          { exerciseId: 'gambe-affondi', sets: 3, reps: 15, restSeconds: 45 },
          { exerciseId: 'petto-push-up', sets: 3, reps: 12, restSeconds: 45 },
          { exerciseId: 'dorso-vertical-row', sets: 3, reps: 15, restSeconds: 45 },
          { exerciseId: 'core-mountain-climber', sets: 3, reps: 20, restSeconds: 30 },
          { exerciseId: 'cardio-tapis-roulant', sets: 1, reps: 1, repsMin: 15, repsMax: 15, restSeconds: 0, notes: '15 minuti a ritmo costante, fine seduta.' },
        ],
      },
    ],
    coachNotes: 'Densità alta, recuperi brevi. Aumentare i minuti di cardio finale con il progredire delle settimane.',
  },
  {
    id: 'tpl-massa-3-giorni',
    title: 'Massa muscolare 3 giorni',
    goal: 'Ipertrofia',
    level: 'Intermedio',
    daysPerWeek: 3,
    durationWeeks: 8,
    description: 'Split Push/Pull/Legs, volume moderato-alto (4 serie, 8-12 ripetizioni) per la crescita muscolare.',
    sessions: [
      {
        id: 'tpl-massa-push',
        title: 'Push (Petto/Spalle/Tricipiti)',
        exercises: [
          { exerciseId: 'petto-panca-piana', sets: 4, reps: 10, repsMin: 8, repsMax: 12, restSeconds: 90 },
          { exerciseId: 'petto-panca-inclinata', sets: 4, reps: 10, repsMin: 8, repsMax: 12, restSeconds: 90 },
          { exerciseId: 'spalle-shoulder-press', sets: 3, reps: 10, repsMin: 8, repsMax: 12, restSeconds: 90 },
          { exerciseId: 'tricipiti-pushdown-cavo', sets: 3, reps: 12, restSeconds: 60 },
        ],
      },
      {
        id: 'tpl-massa-pull',
        title: 'Pull (Dorso/Bicipiti)',
        exercises: [
          { exerciseId: 'dorso-lat-machine-avanti', sets: 4, reps: 10, repsMin: 8, repsMax: 12, restSeconds: 90 },
          { exerciseId: 'dorso-rematore-manubrio', sets: 4, reps: 10, repsMin: 8, repsMax: 12, restSeconds: 90 },
          { exerciseId: 'bicipiti-curl-bilanciere', sets: 3, reps: 12, restSeconds: 60 },
          { exerciseId: 'bicipiti-curl-martello', sets: 3, reps: 12, restSeconds: 60 },
        ],
      },
      {
        id: 'tpl-massa-legs',
        title: 'Legs (Gambe)',
        exercises: [
          { exerciseId: 'gambe-squat', sets: 4, reps: 10, repsMin: 8, repsMax: 12, restSeconds: 120 },
          { exerciseId: 'gambe-leg-press', sets: 3, reps: 12, restSeconds: 90 },
          { exerciseId: 'gambe-leg-curl', sets: 3, reps: 12, restSeconds: 60 },
          { exerciseId: 'gambe-calf-raise', sets: 4, reps: 15, restSeconds: 45 },
        ],
      },
    ],
    coachNotes: 'Progressione: aumentare il carico quando si raggiunge il limite superiore del range ripetizioni su tutte le serie.',
  },
  {
    id: 'tpl-forza-base',
    title: 'Forza base',
    goal: 'Aumento forza',
    level: 'Intermedio',
    daysPerWeek: 3,
    durationWeeks: 6,
    description: 'Focus sui multiarticolari principali, basse ripetizioni e recuperi lunghi (schema tipo 5x5).',
    sessions: [
      {
        id: 'tpl-forza-1',
        title: 'Giorno 1',
        exercises: [
          { exerciseId: 'gambe-squat', sets: 5, reps: 5, restSeconds: 180 },
          { exerciseId: 'petto-panca-piana', sets: 5, reps: 5, restSeconds: 180 },
          { exerciseId: 'dorso-rematore-manubrio', sets: 4, reps: 6, restSeconds: 120 },
        ],
      },
      {
        id: 'tpl-forza-2',
        title: 'Giorno 2',
        exercises: [
          { exerciseId: 'gambe-stacco-rumeno', sets: 5, reps: 5, restSeconds: 180 },
          { exerciseId: 'spalle-shoulder-press', sets: 4, reps: 6, restSeconds: 120 },
          { exerciseId: 'dorso-lat-machine-avanti', sets: 4, reps: 6, restSeconds: 120 },
        ],
      },
      {
        id: 'tpl-forza-3',
        title: 'Giorno 3',
        exercises: [
          { exerciseId: 'gambe-hip-thrust', sets: 5, reps: 5, restSeconds: 180 },
          { exerciseId: 'petto-panca-inclinata', sets: 4, reps: 6, restSeconds: 120 },
          { exerciseId: 'dorso-pulley-basso', sets: 4, reps: 6, restSeconds: 120 },
        ],
      },
    ],
    coachNotes: 'Recuperi lunghi (3 minuti sui multiarticolari principali): non accorciarli per "risparmiare tempo", è controproducente per la forza.',
  },
  {
    id: 'tpl-ricomposizione',
    title: 'Ricomposizione corporea',
    goal: 'Perdere grasso mantenendo la massa',
    level: 'Principiante/Intermedio',
    daysPerWeek: 3,
    durationWeeks: 8,
    description: 'Allenamento con pesi a volume moderato seguito da un blocco cardio, per perdere grasso senza sacrificare la massa muscolare.',
    sessions: [
      {
        id: 'tpl-ricomp-1',
        title: 'Giorno 1',
        exercises: [
          { exerciseId: 'gambe-leg-press', sets: 3, reps: 12, restSeconds: 60 },
          { exerciseId: 'petto-chest-press', sets: 3, reps: 12, restSeconds: 60 },
          { exerciseId: 'dorso-pulley-basso', sets: 3, reps: 12, restSeconds: 60 },
          { exerciseId: 'cardio-cyclette', sets: 1, reps: 1, repsMin: 15, repsMax: 15, restSeconds: 0, notes: '15 minuti a ritmo costante.' },
        ],
      },
      {
        id: 'tpl-ricomp-2',
        title: 'Giorno 2',
        exercises: [
          { exerciseId: 'gambe-affondi', sets: 3, reps: 12, restSeconds: 60 },
          { exerciseId: 'dorso-vertical-row', sets: 3, reps: 12, restSeconds: 60 },
          { exerciseId: 'spalle-alzate-laterali', sets: 3, reps: 15, restSeconds: 45 },
          { exerciseId: 'cardio-ellittica', sets: 1, reps: 1, repsMin: 15, repsMax: 15, restSeconds: 0, notes: '15 minuti a ritmo costante.' },
        ],
      },
      {
        id: 'tpl-ricomp-3',
        title: 'Giorno 3',
        exercises: [
          { exerciseId: 'gambe-squat', sets: 3, reps: 12, restSeconds: 60 },
          { exerciseId: 'petto-panca-inclinata', sets: 3, reps: 12, restSeconds: 60 },
          { exerciseId: 'dorso-lat-machine-avanti', sets: 3, reps: 12, restSeconds: 60 },
          { exerciseId: 'cardio-tapis-roulant', sets: 1, reps: 1, repsMin: 20, repsMax: 20, restSeconds: 0, notes: '20 minuti, intensità moderata.' },
        ],
      },
    ],
    coachNotes: 'Il blocco cardio va sempre dopo i pesi, mai prima, per non intaccare la performance sul carico.',
  },
  {
    id: 'tpl-tonificazione',
    title: 'Tonificazione generale',
    goal: 'Tono muscolare generale',
    level: 'Principiante',
    daysPerWeek: 3,
    durationWeeks: 6,
    description: 'Full body a corpo libero/macchine guidate, carichi leggeri e alte ripetizioni, adatto a chi inizia.',
    sessions: [
      {
        id: 'tpl-ton-1',
        title: 'Giorno 1',
        exercises: [
          { exerciseId: 'petto-chest-press', sets: 3, reps: 15, restSeconds: 45 },
          { exerciseId: 'dorso-vertical-row', sets: 3, reps: 15, restSeconds: 45 },
          { exerciseId: 'gambe-leg-press', sets: 3, reps: 15, restSeconds: 45 },
          { exerciseId: 'core-plank', sets: 3, reps: 1, repsMin: 20, repsMax: 20, restSeconds: 30, notes: 'Tenuta in secondi.' },
        ],
      },
      {
        id: 'tpl-ton-2',
        title: 'Giorno 2',
        exercises: [
          { exerciseId: 'spalle-alzate-laterali', sets: 3, reps: 15, restSeconds: 45 },
          { exerciseId: 'bicipiti-curl-manubri', sets: 3, reps: 15, restSeconds: 45 },
          { exerciseId: 'tricipiti-pushdown-cavo', sets: 3, reps: 15, restSeconds: 45 },
          { exerciseId: 'core-crunch', sets: 3, reps: 15, restSeconds: 30 },
        ],
      },
      {
        id: 'tpl-ton-3',
        title: 'Giorno 3',
        exercises: [
          { exerciseId: 'gambe-affondi', sets: 3, reps: 15, restSeconds: 45 },
          { exerciseId: 'dorso-lat-machine-avanti', sets: 3, reps: 15, restSeconds: 45 },
          { exerciseId: 'petto-push-up', sets: 3, reps: 10, restSeconds: 45 },
          { exerciseId: 'core-russian-twist', sets: 3, reps: 15, restSeconds: 30 },
        ],
      },
    ],
    coachNotes: 'Proposto a 3 giorni/settimana; per un cliente con meno disponibilità, eliminare "Giorno 3" e alternare i primi due (2 giorni/settimana).',
  },
  {
    id: 'tpl-gambe-glutei',
    title: 'Gambe e glutei',
    goal: 'Focus lower body',
    level: 'Principiante/Intermedio',
    daysPerWeek: 3,
    durationWeeks: 6,
    description: 'Focus quasi esclusivo su gambe e glutei, con un secondo giorno dedicato alla parte posteriore della catena.',
    sessions: [
      {
        id: 'tpl-gg-1',
        title: 'Giorno 1',
        exercises: [
          { exerciseId: 'gambe-squat', sets: 4, reps: 12, restSeconds: 75 },
          { exerciseId: 'gambe-hip-thrust', sets: 4, reps: 12, restSeconds: 75 },
          { exerciseId: 'gambe-leg-curl', sets: 3, reps: 15, restSeconds: 60 },
          { exerciseId: 'gambe-calf-raise', sets: 3, reps: 20, restSeconds: 45 },
        ],
      },
      {
        id: 'tpl-gg-2',
        title: 'Giorno 2',
        exercises: [
          { exerciseId: 'gambe-affondi', sets: 4, reps: 12, restSeconds: 75 },
          { exerciseId: 'gambe-stacco-rumeno', sets: 4, reps: 10, restSeconds: 90 },
          { exerciseId: 'gambe-leg-extension', sets: 3, reps: 15, restSeconds: 60 },
          { exerciseId: 'gambe-calf-raise', sets: 3, reps: 20, restSeconds: 45 },
        ],
      },
      {
        id: 'tpl-gg-3',
        title: 'Giorno 3',
        exercises: [
          { exerciseId: 'gambe-leg-press', sets: 4, reps: 15, restSeconds: 75 },
          { exerciseId: 'gambe-hip-thrust', sets: 4, reps: 12, restSeconds: 75 },
          { exerciseId: 'core-plank', sets: 3, reps: 1, repsMin: 30, repsMax: 30, restSeconds: 30, notes: 'Tenuta in secondi.' },
        ],
      },
    ],
    coachNotes: 'Proposto a 3 giorni/settimana; per 2 giorni/settimana usare solo "Giorno 1" e "Giorno 2" alternati.',
  },
  {
    id: 'tpl-postura-mobilita',
    title: 'Postura e mobilità',
    goal: 'Mobilità, postura, core',
    level: 'Base',
    daysPerWeek: 2,
    durationWeeks: 4,
    description: 'Lavoro dolce su core e catena posteriore per migliorare postura e mobilità, senza carichi pesanti.',
    sessions: [
      {
        id: 'tpl-pm-1',
        title: 'Giorno 1',
        exercises: [
          { exerciseId: 'core-plank', sets: 3, reps: 1, repsMin: 30, repsMax: 30, restSeconds: 30, notes: 'Tenuta in secondi.' },
          { exerciseId: 'core-leg-raise', sets: 3, reps: 12, restSeconds: 45 },
          { exerciseId: 'spalle-reverse-fly', sets: 3, reps: 15, restSeconds: 45, notes: 'Carico leggero, focus su scapole.' },
          { exerciseId: 'core-mountain-climber', sets: 3, reps: 20, restSeconds: 30 },
        ],
      },
      {
        id: 'tpl-pm-2',
        title: 'Giorno 2',
        exercises: [
          { exerciseId: 'core-crunch', sets: 3, reps: 15, restSeconds: 30 },
          { exerciseId: 'core-russian-twist', sets: 3, reps: 15, restSeconds: 30 },
          { exerciseId: 'spalle-reverse-fly', sets: 3, reps: 15, restSeconds: 45, notes: 'Carico leggero, focus su scapole.' },
          { exerciseId: 'core-plank', sets: 3, reps: 1, repsMin: 30, repsMax: 30, restSeconds: 30, notes: 'Tenuta in secondi.' },
        ],
      },
    ],
    coachNotes: 'Piano di supporto, spesso abbinato ad altri modelli come richiamo posturale, non come unico piano per un obiettivo estetico/prestativo.',
  },
];

export function getWorkoutPlanTemplateById(id: string): WorkoutPlanTemplate | undefined {
  return WORKOUT_PLAN_TEMPLATES.find((t) => t.id === id);
}
