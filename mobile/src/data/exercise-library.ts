import { resolveVideoSource } from './video-registry';

import type { Difficulty, Exercise, MuscleGroup } from '@/types/training';

// videoStatus non è scritto a mano: si deriva dal registro video, così non può
// mai disallinearsi (un esercizio non risulta "available" se il file non è registrato).
function videoStatusFor(videoFile: string) {
  return resolveVideoSource(videoFile) ? 'available' : ('missing' as const);
}

type SeedExercise = Omit<Exercise, 'videoStatus'>;

function seed(
  id: string,
  name: string,
  muscleGroup: MuscleGroup,
  description: string,
  technicalNotes: string,
  difficulty: Difficulty,
  equipment: string,
  videoFile: string
): SeedExercise {
  return { id, name, muscleGroup, description, technicalNotes, difficulty, equipment, videoFile };
}

const SEED_EXERCISES: SeedExercise[] = [
  // PETTO
  seed('petto-panca-piana', 'Panca piana', 'Petto', 'Distensioni su panca piana con bilanciere.', 'Scapole retratte, piedi ben piantati a terra, bilanciere sulla linea del petto.', 'intermediate', 'Bilanciere, panca piana', 'panca-piana.mp4'),
  seed('petto-panca-inclinata', 'Panca inclinata', 'Petto', 'Distensioni su panca inclinata (30-45°) con bilanciere o manubri.', 'Inclinazione moderata per non spostare troppo il lavoro sulle spalle.', 'intermediate', 'Bilanciere/manubri, panca inclinata', 'panca-inclinata.mp4'),
  seed('petto-chest-press', 'Chest press', 'Petto', 'Distensioni al petto su macchina guidata.', 'Regolare il sedile in modo che le maniglie siano all\'altezza del petto.', 'beginner', 'Macchina chest press', 'chest-press.mp4'),
  seed('petto-croci-manubri', 'Croci con manubri', 'Petto', 'Apertura/chiusura delle braccia su panca piana con manubri.', 'Leggera flessione dei gomiti per tutta l\'esecuzione, movimento controllato.', 'intermediate', 'Manubri, panca piana', 'croci-manubri.mp4'),
  seed('petto-push-up', 'Push up', 'Petto', 'Piegamenti sulle braccia a corpo libero.', 'Corpo allineato dalla testa ai talloni, gomiti a circa 45° dal busto.', 'beginner', 'Corpo libero', 'push-up.mp4'),
  seed('petto-dips-petto', 'Dips petto', 'Petto', 'Dip alle parallele con busto inclinato in avanti per enfatizzare il petto.', 'Inclinare il busto avanti, scendere fino a spalle in linea con i gomiti.', 'advanced', 'Parallele', 'dips-petto.mp4'),

  // DORSO
  seed('dorso-lat-machine-avanti', 'Lat machine avanti', 'Dorso', 'Trazione del bilancere della lat machine verso il petto, presa larga.', 'Tirare con le scapole, non con le braccia; evitare di inarcare troppo la schiena.', 'beginner', 'Lat machine', 'lat-machine-avanti.mp4'),
  seed('dorso-rematore-manubrio', 'Rematore con manubrio', 'Dorso', 'Trazione monolaterale con manubrio in appoggio su panca.', 'Schiena parallela al pavimento, gomito vicino al busto in fase di tirata.', 'intermediate', 'Manubrio, panca', 'rematore-manubrio.mp4'),
  seed('dorso-pulley-basso', 'Pulley basso', 'Dorso', 'Trazione della maniglia del cavo basso verso l\'addome, seduti.', 'Busto stabile, tirare con le scapole prima che con le braccia.', 'beginner', 'Cavo basso, seduta pulley', 'pulley-basso.mp4'),
  seed('dorso-trazioni-assistite', 'Trazioni assistite', 'Dorso', 'Trazioni alla sbarra con l\'aiuto di una macchina assistita.', 'Regolare il contrappeso in base al livello; scendere fino a estensione quasi completa.', 'intermediate', 'Macchina trazioni assistite', 'trazioni-assistite.mp4'),
  seed('dorso-vertical-row', 'Vertical row', 'Dorso', 'Trazione verticale su macchina dedicata, presa neutra.', 'Movimento controllato, evitare slanci con le spalle.', 'beginner', 'Macchina vertical row', 'vertical-row.mp4'),
  seed('dorso-pullover-cavo', 'Pullover al cavo', 'Dorso', 'Estensione delle braccia dall\'alto verso il basso al cavo, in piedi.', 'Gomiti con leggera flessione fissa, il movimento parte dalle spalle.', 'intermediate', 'Cavo alto', 'pullover-cavo.mp4'),

  // GAMBE
  seed('gambe-squat', 'Squat', 'Gambe', 'Squat con bilanciere sulla schiena, presa media.', 'Ginocchia in linea con le punte dei piedi, schiena neutra, scendere sotto il parallelo se mobilità lo consente.', 'intermediate', 'Bilanciere, power rack', 'squat.mp4'),
  seed('gambe-leg-press', 'Leg press', 'Gambe', 'Spinta con le gambe su macchina leg press.', 'Non bloccare completamente le ginocchia in estensione, escursione controllata.', 'beginner', 'Macchina leg press', 'leg-press.mp4'),
  seed('gambe-affondi', 'Affondi', 'Gambe', 'Affondi in camminata o sul posto, a corpo libero o con manubri.', 'Ginocchio anteriore sopra la caviglia, busto eretto.', 'intermediate', 'Corpo libero/manubri', 'affondi.mp4'),
  seed('gambe-leg-extension', 'Leg extension', 'Gambe', 'Estensione delle gambe da seduti su macchina dedicata.', 'Movimento controllato, evitare di scaricare di scatto il peso in ritorno.', 'beginner', 'Macchina leg extension', 'leg-extension.mp4'),
  seed('gambe-leg-curl', 'Leg curl', 'Gambe', 'Flessione delle gambe su macchina, da sdraiati o seduti.', 'Bacino stabile a contatto con la macchina per tutta l\'esecuzione.', 'beginner', 'Macchina leg curl', 'leg-curl.mp4'),
  seed('gambe-calf-raise', 'Calf raise', 'Gambe', 'Sollevamento sui polpacci in piedi, con o senza sovraccarico.', 'Escursione completa, pausa breve in massima contrazione.', 'beginner', 'Macchina calf/manubri', 'calf-raise.mp4'),
  seed('gambe-hip-thrust', 'Hip thrust', 'Gambe', 'Spinta del bacino con schiena appoggiata a panca, bilanciere sui fianchi.', 'Mento leggermente in basso, contrazione glutei in massima estensione.', 'intermediate', 'Bilanciere, panca', 'hip-thrust.mp4'),
  seed('gambe-stacco-rumeno', 'Stacco rumeno', 'Gambe', 'Stacco a gambe semi-tese con bilanciere, focus su femorali e glutei.', 'Schiena neutra per tutta l\'esecuzione, bilanciere vicino alle gambe.', 'advanced', 'Bilanciere', 'stacco-rumeno.mp4'),

  // SPALLE
  seed('spalle-shoulder-press', 'Shoulder press', 'Spalle', 'Spinta sopra la testa con bilanciere o manubri, seduti o in piedi.', 'Evitare di inarcare eccessivamente la zona lombare.', 'intermediate', 'Bilanciere/manubri', 'shoulder-press.mp4'),
  seed('spalle-alzate-laterali', 'Alzate laterali', 'Spalle', 'Sollevamento laterale delle braccia con manubri.', 'Leggera flessione dei gomiti, non superare l\'altezza delle spalle.', 'beginner', 'Manubri', 'alzate-laterali.mp4'),
  seed('spalle-alzate-frontali', 'Alzate frontali', 'Spalle', 'Sollevamento frontale delle braccia con manubri o bilanciere.', 'Movimento controllato, evitare slanci con la schiena.', 'beginner', 'Manubri/bilanciere', 'alzate-frontali.mp4'),
  seed('spalle-reverse-fly', 'Reverse fly', 'Spalle', 'Apertura delle braccia busto flesso in avanti, per il deltoide posteriore.', 'Busto stabile, scapole che si avvicinano in fase di apertura.', 'intermediate', 'Manubri', 'reverse-fly.mp4'),
  seed('spalle-tirate-mento', 'Tirate al mento', 'Spalle', 'Trazione verticale del bilanciere lungo il corpo fino all\'altezza del mento.', 'Gomiti sempre più alti delle mani, non forzare oltre il comfort della spalla.', 'intermediate', 'Bilanciere/cavo', 'tirate-al-mento.mp4'),

  // BICIPITI
  seed('bicipiti-curl-bilanciere', 'Curl bilanciere', 'Bicipiti', 'Flessione dell\'avambraccio con bilanciere, in piedi.', 'Gomiti fermi vicino al busto, evitare di dondolare con la schiena.', 'beginner', 'Bilanciere', 'curl-bilanciere.mp4'),
  seed('bicipiti-curl-manubri', 'Curl manubri', 'Bicipiti', 'Flessione dell\'avambraccio con manubri, alternata o simultanea.', 'Rotazione del polso verso l\'esterno in risalita per massimizzare la contrazione.', 'beginner', 'Manubri', 'curl-manubri.mp4'),
  seed('bicipiti-curl-martello', 'Curl a martello', 'Bicipiti', 'Curl con manubri a presa neutra, coinvolge anche il brachioradiale.', 'Polso fisso in posizione neutra per tutta l\'esecuzione.', 'beginner', 'Manubri', 'curl-martello.mp4'),
  seed('bicipiti-curl-cavo', 'Curl al cavo', 'Bicipiti', 'Flessione dell\'avambraccio al cavo basso con maniglia o bastone.', 'Tensione costante sul bicipite grazie alla resistenza del cavo.', 'intermediate', 'Cavo basso', 'curl-cavo.mp4'),

  // TRICIPITI
  seed('tricipiti-pushdown-cavo', 'Pushdown al cavo', 'Tricipiti', 'Estensione dell\'avambraccio verso il basso al cavo alto.', 'Gomiti fissi vicino al busto, movimento solo dell\'avambraccio.', 'beginner', 'Cavo alto', 'pushdown-cavo.mp4'),
  seed('tricipiti-french-press', 'French press', 'Tricipiti', 'Estensione dei tricipiti sopra la testa da sdraiati, con bilanciere EZ.', 'Gomiti stabili e rivolti in avanti, evitare di aprirli lateralmente.', 'intermediate', 'Bilanciere EZ, panca', 'french-press.mp4'),
  seed('tricipiti-dip-tricipiti', 'Dip tricipiti', 'Tricipiti', 'Dip alle parallele o su panca, busto verticale per enfatizzare i tricipiti.', 'Busto il più verticale possibile, gomiti che puntano indietro.', 'intermediate', 'Parallele/panca', 'dip-tricipiti.mp4'),
  seed('tricipiti-estensioni-sopra-testa', 'Estensioni sopra la testa', 'Tricipiti', 'Estensione del tricipite con un manubrio tenuto sopra la testa a due mani.', 'Gomiti puntati verso l\'alto e fermi, movimento controllato.', 'beginner', 'Manubrio', 'estensioni-sopra-testa.mp4'),

  // ADDOMINALI/CORE
  seed('core-crunch', 'Crunch', 'Addominali/Core', 'Flessione del busto da supini per l\'addome superiore.', 'Non tirare il collo con le mani, movimento breve e controllato.', 'beginner', 'Corpo libero', 'crunch.mp4'),
  seed('core-plank', 'Plank', 'Addominali/Core', 'Tenuta isometrica in appoggio su avambracci e punte dei piedi.', 'Corpo allineato, bacino né troppo alto né troppo basso.', 'beginner', 'Corpo libero', 'plank.mp4'),
  seed('core-leg-raise', 'Leg raise', 'Addominali/Core', 'Sollevamento delle gambe tese da supini o in sospensione.', 'Zona lombare a contatto col suolo (da terra) per evitare compensi.', 'intermediate', 'Corpo libero/sbarra', 'leg-raise.mp4'),
  seed('core-russian-twist', 'Russian twist', 'Addominali/Core', 'Rotazione del busto da seduti con piedi sollevati, con o senza peso.', 'Movimento controllato, evitare di usare solo le braccia per ruotare.', 'intermediate', 'Corpo libero/disco', 'russian-twist.mp4'),
  seed('core-mountain-climber', 'Mountain climber', 'Addominali/Core', 'Portare alternativamente le ginocchia al petto in posizione di plank.', 'Bacino stabile, evitare di alzare troppo i fianchi.', 'beginner', 'Corpo libero', 'mountain-climber.mp4'),

  // CARDIO/FUNZIONALE
  seed('cardio-tapis-roulant', 'Tapis roulant', 'Cardio/Funzionale', 'Camminata o corsa su tapis roulant.', 'Impostare velocità/inclinazione in base all\'obiettivo (aerobico o interval training).', 'beginner', 'Tapis roulant', 'tapis-roulant.mp4'),
  seed('cardio-cyclette', 'Cyclette', 'Cardio/Funzionale', 'Pedalata su cyclette a resistenza regolabile.', 'Regolare la sella all\'altezza corretta per proteggere le ginocchia.', 'beginner', 'Cyclette', 'cyclette.mp4'),
  seed('cardio-ellittica', 'Ellittica', 'Cardio/Funzionale', 'Allenamento a basso impatto su macchina ellittica.', 'Postura eretta, non appoggiarsi eccessivamente sulle maniglie.', 'beginner', 'Ellittica', 'ellittica.mp4'),
  seed('cardio-battle-rope', 'Battle rope', 'Cardio/Funzionale', 'Ondulazioni delle corde per allenamento cardio e core.', 'Ginocchia leggermente flesse, movimento generato dalle spalle.', 'intermediate', 'Battle rope', 'battle-rope.mp4'),
  seed('cardio-burpees', 'Burpees', 'Cardio/Funzionale', 'Sequenza squat-plank-push up-salto a corpo libero.', 'Mantenere il core attivo durante la fase di plank per proteggere la schiena.', 'advanced', 'Corpo libero', 'burpees.mp4'),
  seed('cardio-jumping-jack', 'Jumping jack', 'Cardio/Funzionale', 'Saltelli con apertura simultanea di gambe e braccia.', 'Atterraggio morbido sulle punte, ritmo costante.', 'beginner', 'Corpo libero', 'jumping-jack.mp4'),
];

export const EXERCISE_LIBRARY: Exercise[] = SEED_EXERCISES.map((e) => ({
  ...e,
  videoStatus: videoStatusFor(e.videoFile),
}));

export const MUSCLE_GROUPS: MuscleGroup[] = [
  'Petto',
  'Dorso',
  'Gambe',
  'Spalle',
  'Bicipiti',
  'Tricipiti',
  'Addominali/Core',
  'Cardio/Funzionale',
];

export function exercisesByMuscleGroup(group: MuscleGroup): Exercise[] {
  return EXERCISE_LIBRARY.filter((e) => e.muscleGroup === group);
}

export function getExerciseById(id: string): Exercise | undefined {
  return EXERCISE_LIBRARY.find((e) => e.id === id);
}
