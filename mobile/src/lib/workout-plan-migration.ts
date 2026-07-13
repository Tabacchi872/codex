import AsyncStorage from '@react-native-async-storage/async-storage';

import { SEED_WORKOUT_PLANS } from '@/data/seed-workout-plans';
import type { WorkoutPlan } from '@/types/training';

import { supabase, supabaseConfig } from './supabase';
import { createWorkoutPlan } from './workout-plan-service';

// Migrazione una tantum delle schede locali (AsyncStorage/Zustand,
// store/training-store.ts) verso Supabase (2026-07-14), per ogni coach
// autenticato. Regole di sicurezza esplicite:
// - MAI un piano gia' migrato in un run precedente — tracciato con una MAPPA
//   PERSISTITA localId -> remoteId (2026-07-14, corretto: prima si escludeva
//   "gia' migrato" quando plan.id era GIA' un UUID, un'euristica sbagliata —
//   la forma dell'id non prova che quella riga esista davvero su Supabase, e
//   avrebbe potuto far saltare per sempre un piano mai realmente salvato.
//   Ora l'unico segnale di "gia' migrato" e' la presenza nella mappa).
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
  failed: number;
};

function emptyMigrationResult(): WorkoutMigrationResult {
  return { attempted: 0, migrated: 0, skippedDemo: 0, failed: 0 };
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

  // NIENTE controllo sulla forma dell'id: un piano con un id gia' UUID non e'
  // automaticamente "gia' remoto" — solo la mappa persistita (sopra) e'
  // fonte di verita' per "e' gia' stato migrato da questa procedura".
  const candidates = localPlans.filter((plan) => {
    if (migratedMap.has(plan.id)) return false;
    if (SEED_IDS.has(plan.id)) return false;
    if (!linkedClientIds.has(plan.clientId)) return false;
    return true;
  });
  result.attempted = candidates.length;

  for (const plan of candidates) {
    try {
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

  console.log('WORKOUT_LOCAL_MIGRATION_RESULT', result);
  return result;
}
