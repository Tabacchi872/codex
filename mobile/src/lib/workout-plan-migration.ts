import AsyncStorage from '@react-native-async-storage/async-storage';

import { SEED_WORKOUT_PLANS } from '@/data/seed-workout-plans';
import type { WorkoutPlan } from '@/types/training';

import { supabase, supabaseConfig } from './supabase';
import { createWorkoutPlan, isValidUuid } from './workout-plan-service';

// Migrazione una tantum delle schede locali (AsyncStorage/Zustand,
// store/training-store.ts) verso Supabase (2026-07-14), per ogni coach
// autenticato. Regole di sicurezza esplicite:
// - MAI un piano gia' migrato DA QUESTA PROCEDURA in un run precedente —
//   tracciato con una MAPPA PERSISTITA localId -> remoteId (2026-07-14,
//   corretto: prima si escludeva "gia' migrato" quando plan.id era GIA' un
//   UUID SENZA mai registrarlo in mappa — un piano che non fosse mai
//   realmente passato di qui, ma avesse per errore un id UUID, sarebbe
//   rimasto escluso per sempre senza essere mai stato creato. La mappa resta
//   l'unica fonte di verita' per "questa esatta procedura l'ha gia' inviato").
// - MAI un piano il cui id sia GIA' un UUID valido (2026-07-21, corretto:
//   vedi candidates sotto) — un id placeholder locale non e' mai un UUID
//   (isValidUuid, workout-plan-service.ts), quindi un plan.id UUID prova che
//   quella riga esiste GIA' su Supabase (creata da questa procedura in un run
//   precedente, o caricata dal remoto e persistita localmente da
//   setWorkoutPlans). Diverso dal punto sopra: qui l'id NON prova che sia
//   stato QUESTA PROCEDURA a crearla, ma prova comunque che la riga esiste —
//   sufficiente per escluderla, perche' rimandarla a createWorkoutPlan la
//   tratterebbe come UPDATE su una riga esistente (rischio WORKOUT_LOCKED su
//   un piano completed).
// - MAI un piano demo/seed (SEED_WORKOUT_PLANS, dati fittizi che ogni
//   installazione nuova parte gia' avendo) verso un account coach reale.
// - MAI un piano il cui cliente locale non risulti REALMENTE collegato a
//   questo coach su Supabase (coach_clients): un cliente demo/locale creato
//   senza un vero account Supabase non ha un client_id valido a cui
//   agganciare la scheda remota.

const SEED_IDS = new Set(SEED_WORKOUT_PLANS.map((p) => p.id));

function migratedMapStorageKey(coachId: string): string {
  return `fitcoach-workout-migrated-map:${coachId}`;
}

// Mappa persistita localId -> remoteId (2026-07-14): non solo "questo piano
// e' gia' stato migrato", ma anche CON QUALE id remoto — utile per
// diagnosticare/estendere in futuro, e soprattutto piu' onesta di un
// semplice Set: rende esplicito che la fonte di verita' e' "l'abbiamo
// davvero creato noi su Supabase", non una supposizione sulla forma dell'id.
async function loadMigratedMap(coachId: string): Promise<Map<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(migratedMapStorageKey(coachId));
    if (!raw) return new Map();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return new Map();
    const entries = Object.entries(parsed).filter(
      (entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string',
    );
    return new Map(entries);
  } catch {
    return new Map();
  }
}

async function persistMigratedMap(coachId: string, map: Map<string, string>): Promise<void> {
  try {
    await AsyncStorage.setItem(migratedMapStorageKey(coachId), JSON.stringify(Object.fromEntries(map)));
  } catch {
    // Best-effort: se il salvataggio fallisce, il prossimo run puo' ritentare
    // lo stesso piano — createWorkoutPlan crea comunque una riga nuova (mai
    // un duplicato riconosciuto lato Supabase, ma un secondo run senza
    // network e' un rischio accettato rispetto a bloccare la migrazione).
  }
}

async function getLinkedClientIds(coachId: string): Promise<Set<string>> {
  if (!supabase) return new Set();
  const { data } = await supabase.from('coach_clients').select('client_id').eq('coach_id', coachId);
  return new Set((data ?? []).map((row) => row.client_id as string));
}

export type WorkoutMigrationResult = {
  attempted: number;
  migrated: number;
  skippedDemo: number;
  // Piani esclusi perche' hanno gia' un id UUID valido (vedi filtro
  // candidates sotto): mai un vero candidato di migrazione, solo un piano
  // gia' su Supabase ricomparso tra i "locali" perche' setWorkoutPlans
  // (hooks/use-workout-plans-sync.ts) persiste ogni refresh riuscito nello
  // stesso store Zustand/AsyncStorage. Non un fallimento: skip atteso.
  skippedAlreadyRemote: number;
  failed: number;
};

function emptyMigrationResult(): WorkoutMigrationResult {
  return { attempted: 0, migrated: 0, skippedDemo: 0, skippedAlreadyRemote: 0, failed: 0 };
}

// Dedup in sessione (stesso principio di ymove-auto-link-service.ts): entro
// la stessa sessione app, una seconda chiamata per lo STESSO coachId riusa il
// risultato gia' calcolato invece di ripetere il lavoro.
const sessionResults = new Map<string, Promise<WorkoutMigrationResult>>();

// onPlanMigrated: notifica il chiamante (hooks/use-workout-plans-sync.ts) per
// aggiornare subito la cache locale (rimuove il vecchio id placeholder,
// aggiunge il piano appena migrato con l'id reale) — puramente per un
// feedback visivo immediato: il refresh remoto che segue sostituisce comunque
// l'intero elenco poco dopo.
export function migrateLocalWorkoutPlansForCoach(
  coachId: string,
  localPlans: WorkoutPlan[],
  onPlanMigrated: (oldId: string, migratedPlan: WorkoutPlan) => void,
): Promise<WorkoutMigrationResult> {
  const existing = sessionResults.get(coachId);
  if (existing) return existing;

  const promise = runMigration(coachId, localPlans, onPlanMigrated).catch(() => emptyMigrationResult());
  sessionResults.set(coachId, promise);
  return promise;
}

async function runMigration(
  coachId: string,
  localPlans: WorkoutPlan[],
  onPlanMigrated: (oldId: string, migratedPlan: WorkoutPlan) => void,
): Promise<WorkoutMigrationResult> {
  const result = emptyMigrationResult();
  if (!supabaseConfig.isConfigured || !supabase) return result;

  console.log('WORKOUT_LOCAL_MIGRATION_START', {});

  const migratedMap = await loadMigratedMap(coachId);
  const linkedClientIds = await getLinkedClientIds(coachId);

  result.skippedDemo = localPlans.filter((p) => SEED_IDS.has(p.id)).length;

  // La mappa persistita resta la fonte di verita' per "gia' migrato DA
  // QUESTA PROCEDURA" (commento sopra). Ma esiste un secondo segnale, questo
  // si' affidabile sulla forma dell'id: isValidUuid(plan.id). I piani creati
  // offline (mai salvati) hanno SEMPRE un id placeholder testuale
  // (`plan-${Date.now()}`, vedi workout-plan-form.tsx/schede/modelli/[id].tsx)
  // — MAI un UUID, perche' nessun generatore locale ne crea uno per un piano
  // (isValidUuid, workout-plan-service.ts). Un plan.id gia' UUID significa
  // percio' che quella riga esiste GIA' su Supabase, con qualunque
  // session_status: o e' stata migrata da questa stessa procedura in un run
  // precedente (e allora e' gia' in migratedMap), oppure e' stata caricata
  // dal remoto e persistita localmente da setWorkoutPlans
  // (hooks/use-workout-plans-sync.ts scrive SEMPRE l'intero elenco remoto nel
  // medesimo store Zustand/AsyncStorage subito dopo la migrazione) — in
  // questo secondo caso non finisce mai in migratedMap, perche' non e' mai
  // passata da qui, e ad ogni refresh() successivo (ogni apertura schermata
  // che monta useWorkoutPlansSync) ricompariva tra i "candidati". Inviarla a
  // createWorkoutPlan manda il suo id reale nel payload (buildSavePayload),
  // quindi save_workout_plan la tratta come UPDATE su una riga esistente: se
  // completed, bloccata da WORKOUT_LOCKED (l'errore riportato); se
  // todo/in_progress, una riscrittura ridondante e non necessaria. Un piano
  // realmente da migrare non ha mai un id UUID: escluderlo qui e' sufficiente
  // per tutti gli status, non serve interrogare il remoto per ognuno.
  let skippedAlreadyRemote = 0;
  const candidates = localPlans.filter((plan) => {
    if (migratedMap.has(plan.id)) return false;
    if (SEED_IDS.has(plan.id)) return false;
    if (!linkedClientIds.has(plan.clientId)) return false;
    if (isValidUuid(plan.id)) {
      skippedAlreadyRemote++;
      return false;
    }
    return true;
  });
  result.attempted = candidates.length;
  result.skippedAlreadyRemote = skippedAlreadyRemote;

  for (const plan of candidates) {
    try {
      // plan.id qui non e' MAI un UUID valido (escluso sopra): buildSavePayload
      // invia sempre id:null per un id non-UUID, quindi save_workout_plan fa
      // sempre un INSERT — mai un UPDATE su una riga esistente, mai
      // raggiungibile da WORKOUT_LOCKED, indipendentemente dal sessionStatus
      // locale del piano (anche un piano completed offline prima di questa
      // migrazione va inserito cosi', come riga nuova gia' completed).
      const created = await createWorkoutPlan({ ...plan, coachId });
      if (created.ok) {
        migratedMap.set(plan.id, created.data.id);
        await persistMigratedMap(coachId, migratedMap);
        onPlanMigrated(plan.id, created.data);
        result.migrated++;
      } else {
        result.failed++;
      }
    } catch {
      result.failed++;
    }
  }

  if (__DEV__ && result.skippedAlreadyRemote > 0) {
    console.warn('WORKOUT_LOCAL_MIGRATION_SKIP_REMOTE', { count: result.skippedAlreadyRemote });
  }
  console.log('WORKOUT_LOCAL_MIGRATION_RESULT', result);
  return result;
}
