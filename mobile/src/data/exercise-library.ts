import { resolveVideoSource } from './video-registry';

import { legacyGroupForPrimaryGroup, primaryGroupFromLegacy } from '@/lib/exercise-catalog';
import type { Difficulty, Exercise, MuscleGroup } from '@/types/training';
import type { ExerciseMuscleGroupId, ExerciseType } from '@/types/training';

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
  videoFile: string,
  options: Partial<
    Pick<
      Exercise,
      | 'slug'
      | 'nameEn'
      | 'primaryMuscleGroup'
      | 'secondaryMuscleGroups'
      | 'primaryMuscles'
      | 'secondaryMuscles'
      | 'exerciseType'
      | 'aliases'
      | 'commonMistakes'
      | 'canonicalId'
    >
  > = {},
): SeedExercise {
  return {
    id,
    slug: options.slug ?? id,
    name,
    muscleGroup,
    primaryMuscleGroup: options.primaryMuscleGroup ?? primaryGroupFromLegacy(muscleGroup),
    secondaryMuscleGroups: options.secondaryMuscleGroups ?? [],
    primaryMuscles: options.primaryMuscles,
    secondaryMuscles: options.secondaryMuscles,
    description,
    technicalNotes,
    commonMistakes: options.commonMistakes,
    difficulty,
    equipment,
    exerciseType: options.exerciseType ?? (muscleGroup === 'Cardio/Funzionale' ? 'cardio' : 'forza'),
    aliases: options.aliases ?? [],
    canonicalId: options.canonicalId,
    visibility: 'global',
    active: true,
    videoFile,
  };
}

function catalogSeed(
  id: string,
  name: string,
  primaryMuscleGroup: ExerciseMuscleGroupId,
  description: string,
  technicalNotes: string,
  difficulty: Difficulty,
  equipment: string,
  options: Partial<Pick<Exercise, 'nameEn' | 'secondaryMuscleGroups' | 'primaryMuscles' | 'secondaryMuscles' | 'exerciseType' | 'aliases' | 'commonMistakes' | 'canonicalId'>> = {},
): SeedExercise {
  const exerciseType: ExerciseType =
    options.exerciseType ??
    (primaryMuscleGroup === 'cardio'
      ? 'cardio'
      : primaryMuscleGroup === 'mobilita'
        ? 'mobilita'
        : primaryMuscleGroup === 'stretching'
          ? 'stretching'
          : 'forza');
  return seed(
    id,
    name,
    legacyGroupForPrimaryGroup(primaryMuscleGroup),
    description,
    technicalNotes,
    difficulty,
    equipment,
    `${id}.mp4`,
    {
      slug: id,
      primaryMuscleGroup,
      secondaryMuscleGroups: options.secondaryMuscleGroups ?? [],
      primaryMuscles: options.primaryMuscles,
      secondaryMuscles: options.secondaryMuscles,
      exerciseType,
      nameEn: options.nameEn,
      aliases: options.aliases,
      commonMistakes: options.commonMistakes,
      canonicalId: options.canonicalId,
    },
  );
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

const COVERAGE_EXERCISES: SeedExercise[] = [
  catalogSeed('petto-panca-piana-manubri', 'Panca piana manubri', 'petto', 'Distensioni su panca piana con manubri.', 'Scapole stabili, manubri in linea con il petto, movimento controllato.', 'intermediate', 'Manubri, panca piana', { nameEn: 'Dumbbell bench press', secondaryMuscleGroups: ['tricipiti', 'spalle'] }),
  catalogSeed('petto-panca-inclinata-manubri', 'Panca inclinata manubri', 'petto', 'Distensioni su panca inclinata con manubri.', 'Inclinazione moderata, gomiti sotto i polsi, controllo in discesa.', 'intermediate', 'Manubri, panca inclinata', { nameEn: 'Incline dumbbell press', secondaryMuscleGroups: ['tricipiti', 'spalle'] }),
  catalogSeed('petto-croci-cavi', 'Croci ai cavi', 'petto', 'Aperture ai cavi per il petto con tensione continua.', 'Torace alto, gomiti morbidi, chiusura senza perdere controllo.', 'intermediate', 'Cavi', { nameEn: 'Cable fly' }),

  catalogSeed('dorso-lat-machine-neutra', 'Lat machine presa neutra', 'dorsali', 'Trazione alla lat machine con presa neutra.', 'Spalle basse, gomiti verso il fianco, evitare slanci.', 'beginner', 'Lat machine, maniglia neutra', { nameEn: 'Neutral grip lat pulldown', secondaryMuscleGroups: ['bicipiti'] }),
  catalogSeed('dorso-trazioni', 'Trazioni', 'dorsali', 'Trazioni alla sbarra a corpo libero.', 'Partire da scapole attive, petto verso la sbarra, controllo in discesa.', 'advanced', 'Sbarra', { nameEn: 'Pull up', aliases: ['Pull-up'], secondaryMuscleGroups: ['bicipiti'] }),
  catalogSeed('dorso-rematore-bilanciere', 'Rematore bilanciere', 'dorsali', 'Rematore con bilanciere a busto inclinato.', 'Schiena neutra, tirare verso l addome, evitare rimbalzi.', 'advanced', 'Bilanciere', { nameEn: 'Barbell row', secondaryMuscleGroups: ['bicipiti', 'lombari'] }),
  catalogSeed('dorso-rematore-macchina', 'Rematore macchina', 'dorsali', 'Trazione orizzontale su macchina guidata.', 'Petto in appoggio se previsto, scapole attive, ritmo controllato.', 'beginner', 'Macchina row', { nameEn: 'Machine row', secondaryMuscleGroups: ['bicipiti'] }),
  catalogSeed('dorso-rematore-corpo-libero', 'Rematore a corpo libero', 'dorsali', 'Trazione orizzontale in appoggio su una sbarra bassa, un tavolo robusto o anelli di sospensione, corpo in linea retta.', 'Corpo rigido dalla testa ai talloni, tirare il petto verso il punto di appoggio con le scapole; avvicinare i piedi al punto di appoggio per aumentare la difficoltà, allontanarli per ridurla.', 'beginner', 'Sbarra bassa, tavolo robusto o anelli di sospensione', { nameEn: 'Inverted row', aliases: ['Bodyweight row'], secondaryMuscleGroups: ['bicipiti'] }),

  catalogSeed('spalle-military-press', 'Military press', 'spalle', 'Spinta sopra la testa in piedi con bilanciere.', 'Core attivo, traiettoria verticale, non iperestendere la schiena.', 'advanced', 'Bilanciere', { nameEn: 'Military press', secondaryMuscleGroups: ['tricipiti'] }),
  catalogSeed('spalle-face-pull', 'Face pull', 'spalle', 'Trazione al viso con corda al cavo alto.', 'Gomiti alti, extrarotazione finale, collo rilassato.', 'beginner', 'Cavo alto, corda', { nameEn: 'Face pull', secondaryMuscleGroups: ['trapezi'] }),

  catalogSeed('bicipiti-curl-alternato', 'Curl alternato', 'bicipiti', 'Curl con manubri alternando le braccia.', 'Gomiti fermi, supinazione progressiva, evitare slanci.', 'beginner', 'Manubri', { nameEn: 'Alternating dumbbell curl' }),
  catalogSeed('bicipiti-curl-panca-inclinata', 'Curl panca inclinata', 'bicipiti', 'Curl con manubri su panca inclinata.', 'Spalle ferme, braccio in allungamento, movimento controllato.', 'intermediate', 'Manubri, panca inclinata', { nameEn: 'Incline dumbbell curl' }),
  catalogSeed('bicipiti-preacher-curl', 'Preacher curl', 'bicipiti', 'Curl su panca Scott con bilanciere EZ o manubrio.', 'Braccia in appoggio, non staccare i gomiti, controllo in estensione.', 'intermediate', 'Panca Scott, bilanciere EZ', { nameEn: 'Preacher curl' }),

  catalogSeed('tricipiti-panca-presa-stretta', 'Panca presa stretta', 'tricipiti', 'Distensioni su panca con presa stretta per tricipiti.', 'Gomiti vicino al busto, polsi neutri, scapole stabili.', 'intermediate', 'Bilanciere, panca piana', { nameEn: 'Close grip bench press', secondaryMuscleGroups: ['petto', 'spalle'] }),
  catalogSeed('tricipiti-kickback', 'Kickback', 'tricipiti', 'Estensione tricipiti a busto inclinato con manubrio.', 'Braccio alto e fermo, estendere solo il gomito.', 'beginner', 'Manubri', { nameEn: 'Triceps kickback' }),

  catalogSeed('gambe-front-squat', 'Front squat', 'quadricipiti', 'Squat con bilanciere in appoggio frontale.', 'Gomiti alti, busto verticale, ginocchia in linea con i piedi.', 'advanced', 'Bilanciere, rack', { nameEn: 'Front squat', secondaryMuscleGroups: ['glutei', 'addome'] }),
  catalogSeed('gambe-leg-press-45', 'Leg press 45°', 'quadricipiti', 'Spinta su leg press inclinata a 45 gradi.', 'Piedi stabili sulla pedana, non bloccare le ginocchia, escursione controllata.', 'beginner', 'Leg press 45°', { nameEn: '45 degree leg press', aliases: ['Leg press 45', 'Pressa 45'], secondaryMuscleGroups: ['glutei'] }),
  catalogSeed('gambe-hack-squat', 'Hack squat', 'quadricipiti', 'Squat guidato su macchina hack squat.', 'Schiena in appoggio, ginocchia in linea, controllo in discesa.', 'intermediate', 'Hack squat machine', { nameEn: 'Hack squat', secondaryMuscleGroups: ['glutei'] }),
  catalogSeed('gambe-bulgarian-split-squat', 'Bulgarian split squat', 'quadricipiti', 'Affondo bulgaro con piede posteriore rialzato.', 'Busto stabile, ginocchio anteriore controllato, spinta dal piede avanti.', 'advanced', 'Panca, manubri opzionali', { nameEn: 'Bulgarian split squat', secondaryMuscleGroups: ['glutei'] }),
  catalogSeed('gambe-step-up', 'Step-up', 'quadricipiti', 'Salita su box o panca con una gamba alla volta.', 'Spingere dal piede in appoggio, evitare slancio della gamba dietro.', 'beginner', 'Box, manubri opzionali', { nameEn: 'Step up', secondaryMuscleGroups: ['glutei'] }),
  catalogSeed('gambe-air-squat', 'Squat a corpo libero', 'quadricipiti', 'Squat senza carico esterno, mani unite avanti o dietro la nuca per il bilanciamento.', 'Ginocchia in linea con le punte dei piedi, schiena neutra, scendere fino a cosce parallele o quanto la mobilità lo consente.', 'beginner', 'Corpo libero', { nameEn: 'Air squat', aliases: ['Bodyweight squat'], secondaryMuscleGroups: ['glutei'] }),

  catalogSeed('femorali-leg-curl-sdraiato', 'Leg curl sdraiato', 'femorali', 'Flessione delle ginocchia su macchina da sdraiati.', 'Bacino fermo, controllo in ritorno, non compensare con la schiena.', 'beginner', 'Macchina leg curl', { nameEn: 'Lying leg curl' }),
  catalogSeed('femorali-leg-curl-seduto', 'Leg curl seduto', 'femorali', 'Flessione delle ginocchia su macchina da seduti.', 'Schiena in appoggio, range controllato, evitare rimbalzi.', 'beginner', 'Macchina leg curl seduto', { nameEn: 'Seated leg curl' }),
  catalogSeed('femorali-good-morning', 'Good morning', 'femorali', 'Hip hinge con bilanciere sulle spalle.', 'Schiena neutra, anche indietro, carico moderato e controllo totale.', 'advanced', 'Bilanciere', { nameEn: 'Good morning', secondaryMuscleGroups: ['glutei', 'lombari'] }),
  catalogSeed('femorali-nordic-curl', 'Nordic curl', 'femorali', 'Discesa controllata in ginocchio con caviglie bloccate.', 'Tenere il corpo in linea, usare assistenza se necessario.', 'advanced', 'Corpo libero, supporto caviglie', { nameEn: 'Nordic hamstring curl' }),
  catalogSeed('femorali-hip-hinge', 'Hip hinge', 'femorali', 'Pattern di piegamento d anca per apprendere il movimento.', 'Anche indietro, schiena neutra, ginocchia morbide.', 'beginner', 'Bastone o corpo libero', { nameEn: 'Hip hinge drill', secondaryMuscleGroups: ['glutei', 'lombari'] }),
  catalogSeed('gambe-stacco-rumeno-manubri', 'Stacco rumeno con manubri', 'femorali', 'Stacco rumeno a gambe semi-tese con un manubrio per mano, focus su femorali e glutei, carico più leggero e gestibile del bilanciere.', 'Schiena neutra, bacino che si sposta indietro, manubri vicini alle gambe per tutta la discesa, ginocchia con flessione minima e costante.', 'beginner', 'Manubri', { nameEn: 'Dumbbell Romanian deadlift', aliases: ['Dumbbell RDT'], secondaryMuscleGroups: ['glutei', 'lombari'] }),

  catalogSeed('glutei-glute-bridge', 'Glute bridge', 'glutei', 'Ponte glutei da terra.', 'Retroversione del bacino in alto, spinta dai talloni, controllo in discesa.', 'beginner', 'Corpo libero o bilanciere', { nameEn: 'Glute bridge' }),
  catalogSeed('glutei-kickback-cavo', 'Kickback al cavo', 'glutei', 'Estensione dell anca al cavo basso.', 'Bacino fermo, movimento dall anca, evitare iperestensione lombare.', 'beginner', 'Cavo basso, cavigliera', { nameEn: 'Cable glute kickback' }),
  catalogSeed('glutei-abduzioni', 'Abduzioni', 'glutei', 'Abduzione dell anca su macchina o elastico.', 'Bacino stabile, pausa in apertura, ritorno controllato.', 'beginner', 'Macchina abduttori o elastico', { nameEn: 'Hip abduction', secondaryMuscleGroups: ['abduttori'] }),
  catalogSeed('glutei-squat-sumo', 'Squat sumo', 'glutei', 'Squat con stance ampia e punte extra-ruotate.', 'Ginocchia verso le punte, busto stabile, spinta dai talloni.', 'intermediate', 'Bilanciere o manubrio', { nameEn: 'Sumo squat', secondaryMuscleGroups: ['quadricipiti', 'adduttori'] }),
  catalogSeed('glutei-affondi-posteriori', 'Affondi posteriori', 'glutei', 'Affondo all indietro a corpo libero o con manubri.', 'Passo controllato, busto stabile, spinta dalla gamba avanti.', 'beginner', 'Corpo libero o manubri', { nameEn: 'Reverse lunge', secondaryMuscleGroups: ['quadricipiti'] }),

  catalogSeed('polpacci-calf-raise-seduto', 'Calf raise seduto', 'polpacci', 'Sollevamento dei talloni da seduti.', 'Escursione completa, pausa in alto, controllo in basso.', 'beginner', 'Macchina calf seduto', { nameEn: 'Seated calf raise' }),
  catalogSeed('polpacci-calf-press-leg-press', 'Calf press alla leg press', 'polpacci', 'Estensione della caviglia sulla pedana della leg press.', 'Ginocchia quasi estese, movimento solo alla caviglia.', 'beginner', 'Leg press', { nameEn: 'Leg press calf press' }),
  catalogSeed('polpacci-calf-raise-monopodalico', 'Calf raise monopodalico', 'polpacci', 'Calf raise su una gamba.', 'Controllo dell equilibrio, range completo, pausa in alto.', 'intermediate', 'Corpo libero o manubrio', { nameEn: 'Single leg calf raise' }),

  catalogSeed('core-reverse-crunch', 'Reverse crunch', 'addome', 'Retroversione del bacino portando le ginocchia verso il petto.', 'Non usare slancio, sollevare il bacino con controllo.', 'beginner', 'Corpo libero', { nameEn: 'Reverse crunch' }),
  catalogSeed('core-side-plank', 'Side plank', 'obliqui', 'Tenuta laterale su avambraccio e piedi.', 'Corpo in linea, bacino alto, spalla sopra il gomito.', 'beginner', 'Corpo libero', { nameEn: 'Side plank', secondaryMuscleGroups: ['addome'] }),
  catalogSeed('core-dead-bug', 'Dead bug', 'addome', 'Controllo anti-estensione alternando braccio e gamba.', 'Zona lombare stabile, movimento lento, respirazione controllata.', 'beginner', 'Corpo libero', { nameEn: 'Dead bug' }),
  catalogSeed('core-hollow-hold', 'Hollow hold', 'addome', 'Tenuta hollow con braccia e gambe sollevate.', 'Lombare a terra, regressione se perde controllo.', 'intermediate', 'Corpo libero', { nameEn: 'Hollow hold' }),
  catalogSeed('core-cable-crunch', 'Cable crunch', 'addome', 'Crunch in ginocchio al cavo alto.', 'Flettere la colonna, bacino fermo, non tirare solo con le braccia.', 'intermediate', 'Cavo alto, corda', { nameEn: 'Cable crunch' }),
  catalogSeed('core-pallof-press', 'Pallof press', 'obliqui', 'Spinta anti-rotazione al cavo o elastico.', 'Bacino fermo, braccia in avanti, resistere alla rotazione.', 'beginner', 'Cavo o elastico', { nameEn: 'Pallof press', secondaryMuscleGroups: ['addome'] }),

  catalogSeed('lombari-hyperextension', 'Hyperextension', 'lombari', 'Estensione del busto su panca romana.', 'Movimento controllato, evitare iperestensione in alto.', 'beginner', 'Panca romana', { nameEn: 'Back extension', secondaryMuscleGroups: ['glutei', 'femorali'] }),
  catalogSeed('lombari-bird-dog', 'Bird dog', 'lombari', 'Estensione alternata braccio-gamba in quadrupedia.', 'Bacino stabile, schiena neutra, movimento lento.', 'beginner', 'Corpo libero', { nameEn: 'Bird dog', secondaryMuscleGroups: ['addome'] }),
  catalogSeed('lombari-superman-controllato', 'Superman controllato', 'lombari', 'Sollevamento controllato di braccia e gambe da proni.', 'Tenuta breve, non forzare il collo, controllo in discesa.', 'beginner', 'Corpo libero', { nameEn: 'Controlled superman' }),

  catalogSeed('cardio-vogatore', 'Vogatore', 'cardio', 'Allenamento cardio su rowing machine.', 'Spinta gambe, apertura busto, tirata braccia; ritorno inverso.', 'beginner', 'Vogatore', { nameEn: 'Rowing machine', exerciseType: 'cardio' }),
  catalogSeed('cardio-stair-climber', 'Stair climber', 'cardio', 'Salita continua su macchina a gradini.', 'Postura alta, appoggio leggero alle maniglie, passo costante.', 'beginner', 'Stair climber', { nameEn: 'Stair climber', exerciseType: 'cardio' }),
  catalogSeed('cardio-salto-corda', 'Salto con la corda', 'cardio', 'Salti ritmici con corda.', 'Rimbalzo morbido, gomiti vicini, rotazione dai polsi.', 'intermediate', 'Corda', { nameEn: 'Jump rope', exerciseType: 'cardio' }),

  catalogSeed('mobilita-anche', 'Mobilita anche', 'mobilita', 'Sequenza di mobilita per anche.', 'Movimenti lenti, range senza dolore, respirazione controllata.', 'beginner', 'Corpo libero', { exerciseType: 'mobilita' }),
  catalogSeed('mobilita-caviglie', 'Mobilita caviglie', 'mobilita', 'Mobilita in dorsiflessione della caviglia.', 'Tallone a terra, ginocchio verso le dita, range progressivo.', 'beginner', 'Corpo libero', { exerciseType: 'mobilita' }),
  catalogSeed('mobilita-spalle', 'Mobilita spalle', 'mobilita', 'Esercizi di mobilita scapolo-omerale.', 'Movimento fluido, controllo scapole, evitare compensi lombari.', 'beginner', 'Bastone o elastico', { exerciseType: 'mobilita' }),
  catalogSeed('mobilita-rotazioni-toraciche', 'Rotazioni toraciche', 'mobilita', 'Rotazioni controllate del tratto toracico.', 'Bacino stabile, seguire la mano con lo sguardo.', 'beginner', 'Corpo libero', { exerciseType: 'mobilita' }),
  catalogSeed('mobilita-cat-cow', 'Cat-cow', 'mobilita', 'Mobilita della colonna in quadrupedia.', 'Alternare flessione ed estensione senza dolore.', 'beginner', 'Corpo libero', { exerciseType: 'mobilita' }),
  catalogSeed('stretching-femorali', 'Stretching femorali', 'stretching', 'Allungamento controllato dei femorali.', 'Schiena neutra, respirazione lenta, non molleggiare.', 'beginner', 'Corpo libero', { exerciseType: 'stretching' }),
  catalogSeed('stretching-quadricipiti', 'Stretching quadricipiti', 'stretching', 'Allungamento del quadricipite in piedi o a terra.', 'Bacino neutro, ginocchia vicine, evitare arco lombare.', 'beginner', 'Corpo libero', { exerciseType: 'stretching' }),
  catalogSeed('stretching-pettorali', 'Stretching pettorali', 'stretching', 'Allungamento del pettorale su parete o doorway.', 'Spalla bassa, rotazione graduale, niente dolore.', 'beginner', 'Parete', { exerciseType: 'stretching' }),
];

const EXERCISE_OVERRIDES: Record<string, Partial<Exercise>> = {
  'petto-panca-piana': { name: 'Panca piana bilanciere', primaryMuscleGroup: 'petto', secondaryMuscleGroups: ['tricipiti', 'spalle'], primaryMuscles: ['chest'], secondaryMuscles: ['front_deltoids', 'triceps'], aliases: ['Panca piana', 'Bench press', 'Distensioni su panca piana'] },
  'petto-panca-inclinata': { name: 'Panca inclinata bilanciere', primaryMuscleGroup: 'petto', secondaryMuscleGroups: ['tricipiti', 'spalle'], aliases: ['Panca inclinata', 'Incline bench press'] },
  'petto-chest-press': { primaryMuscleGroup: 'petto', secondaryMuscleGroups: ['tricipiti'] },
  'petto-croci-manubri': { primaryMuscleGroup: 'petto', aliases: ['Dumbbell fly'] },
  'petto-push-up': { name: 'Piegamenti', primaryMuscleGroup: 'petto', secondaryMuscleGroups: ['tricipiti', 'spalle'], aliases: ['Push up', 'Push-up'] },
  'dorso-lat-machine-avanti': { name: 'Lat machine presa larga', primaryMuscleGroup: 'dorsali', secondaryMuscleGroups: ['bicipiti'], primaryMuscles: ['lats', 'upper_back'], secondaryMuscles: ['biceps', 'rear_deltoids'], aliases: ['Lat machine avanti', 'Wide grip lat pulldown'] },
  'dorso-rematore-manubrio': { name: 'Rematore manubrio', primaryMuscleGroup: 'dorsali', secondaryMuscleGroups: ['bicipiti'] },
  'dorso-pulley-basso': { primaryMuscleGroup: 'dorsali', secondaryMuscleGroups: ['bicipiti'] },
  'dorso-pullover-cavo': { name: 'Pullover ai cavi', primaryMuscleGroup: 'dorsali' },
  'spalle-shoulder-press': { primaryMuscleGroup: 'spalle', secondaryMuscleGroups: ['tricipiti'] },
  'spalle-reverse-fly': { primaryMuscleGroup: 'spalle', secondaryMuscleGroups: ['trapezi'] },
  'bicipiti-curl-martello': { name: 'Hammer curl', primaryMuscleGroup: 'bicipiti', secondaryMuscleGroups: ['avambracci'], primaryMuscles: ['biceps'], secondaryMuscles: ['forearms'], aliases: ['Curl a martello'] },
  'tricipiti-dip-tricipiti': { name: 'Dip', primaryMuscleGroup: 'tricipiti', secondaryMuscleGroups: ['petto', 'spalle'] },
  'tricipiti-pushdown-cavo': { name: 'Pushdown al cavo', primaryMuscleGroup: 'tricipiti', primaryMuscles: ['triceps'] },
  'gambe-squat': { primaryMuscleGroup: 'quadricipiti', secondaryMuscleGroups: ['glutei', 'addome'], primaryMuscles: ['quadriceps', 'glutes'], secondaryMuscles: ['hamstrings', 'abs', 'lower_back', 'calves'] },
  'gambe-leg-press': { name: 'Leg press', primaryMuscleGroup: 'quadricipiti', secondaryMuscleGroups: ['glutei'] },
  'gambe-affondi': { primaryMuscleGroup: 'quadricipiti', secondaryMuscleGroups: ['glutei'] },
  'gambe-leg-extension': { primaryMuscleGroup: 'quadricipiti' },
  'gambe-leg-curl': { primaryMuscleGroup: 'femorali' },
  'gambe-calf-raise': { name: 'Calf raise in piedi', primaryMuscleGroup: 'polpacci', primaryMuscles: ['calves'], aliases: ['Calf raise'] },
  'gambe-hip-thrust': { primaryMuscleGroup: 'glutei', secondaryMuscleGroups: ['femorali'], primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings', 'lower_back'] },
  'gambe-stacco-rumeno': { primaryMuscleGroup: 'femorali', secondaryMuscleGroups: ['glutei', 'lombari'] },
  'core-russian-twist': { primaryMuscleGroup: 'obliqui', secondaryMuscleGroups: ['addome'] },
  'core-plank': { primaryMuscleGroup: 'addome', primaryMuscles: ['abs'], secondaryMuscles: ['obliques', 'lower_back'] },
  'core-mountain-climber': { primaryMuscleGroup: 'addome', primaryMuscles: ['abs'], secondaryMuscles: ['hip_flexors', 'obliques'], exerciseType: 'cardio' },
  'cardio-tapis-roulant': { primaryMuscleGroup: 'cardio', primaryMuscles: ['full_body'], exerciseType: 'cardio' },
};

// Video demo (fase 1, 2026-07-11): un solo esercizio con un URL pubblico di
// esempio (Google Cloud Storage, sample video standard usato per test),
// per verificare davvero la riproduzione remota end-to-end (Web + Expo Go)
// prima che la fase 2 (upload coach) esista. Da sostituire/rimuovere quando
// arriveranno video reali — vedi docs/TODO_NEXT.md.
const DEMO_VIDEO_URLS: Partial<Record<string, string>> = {
  'petto-panca-piana': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
};

const ALL_SEED_EXERCISES = [...SEED_EXERCISES, ...COVERAGE_EXERCISES];

export const EXERCISE_LIBRARY: Exercise[] = ALL_SEED_EXERCISES.map((e) => ({
  ...e,
  ...(EXERCISE_OVERRIDES[e.id] ?? {}),
  videoStatus: videoStatusFor(e.videoFile),
  videoUrl: DEMO_VIDEO_URLS[e.id],
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
