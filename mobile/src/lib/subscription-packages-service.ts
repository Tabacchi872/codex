import { supabase, supabaseConfig } from './supabase';

import type {
  SubscriptionPackage,
  SubscriptionPackageInput,
  SubscriptionPackageTargetRole,
} from '@/types/subscription-packages';

// CRUD pacchetti acquistabili (docs/SUPABASE_SCHEMA.sql, tabella
// subscription_packages) — letti sempre da Supabase, mai hardcodati in app.
// Lettura pubblica (coach/cliente): solo pacchetti attivi del proprio ruolo,
// filtrata anche lato RLS (subscription_packages_coach_read_active /
// _client_read_active). Scrittura: solo superadmin (subscription_packages_
// superadmin_all) — un tentativo di scrittura da un coach/cliente fallisce
// con un errore RLS leggibile, non silenziosamente.

export type PackagesServiceErrorCode = 'not_configured' | 'db_error' | 'has_linked_subscriptions';

export type PackagesServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: PackagesServiceErrorCode; message: string };

const NOT_CONFIGURED_MESSAGE =
  'Supabase non e\' configurato su questo ambiente: impossibile leggere/scrivere i pacchetti.';

function notConfigured<T>(): PackagesServiceResult<T> {
  return { ok: false, code: 'not_configured', message: NOT_CONFIGURED_MESSAGE };
}

type PackageRow = {
  id: string;
  target_role: SubscriptionPackageTargetRole;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  duration_value: number;
  duration_unit: 'days' | 'months';
  max_clients: number | null;
  features: string[] | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

function mapRow(row: PackageRow): SubscriptionPackage {
  return {
    id: row.id,
    targetRole: row.target_role,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    currency: row.currency,
    durationValue: row.duration_value,
    durationUnit: row.duration_unit,
    maxClients: row.max_clients,
    features: row.features ?? [],
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS =
  'id,target_role,name,description,price,currency,duration_value,duration_unit,max_clients,features,is_active,sort_order,created_at,updated_at';

// Usata da coach/cliente: solo pacchetti attivi del proprio ruolo. Il filtro
// target_role qui e' difesa in profondita' (auto-documentante) accanto alla
// RLS, che gia' da sola impedirebbe di vedere pacchetti dell'altro ruolo.
export async function listActivePackages(
  targetRole: SubscriptionPackageTargetRole,
): Promise<PackagesServiceResult<SubscriptionPackage[]>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();

  const { data, error } = await supabase
    .from('subscription_packages')
    .select(SELECT_COLUMNS)
    .eq('target_role', targetRole)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    if (__DEV__) console.error('SUBSCRIPTION_PACKAGES_LIST_ACTIVE_ERROR', error.message);
    return { ok: false, code: 'db_error', message: `Errore caricamento pacchetti: ${error.message}` };
  }
  return { ok: true, data: (data ?? []).map(mapRow) };
}

// Usata dal superadmin: tutti i pacchetti (attivi e non) di un ruolo target.
export async function listAllPackages(
  targetRole: SubscriptionPackageTargetRole,
): Promise<PackagesServiceResult<SubscriptionPackage[]>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();

  const { data, error } = await supabase
    .from('subscription_packages')
    .select(SELECT_COLUMNS)
    .eq('target_role', targetRole)
    .order('sort_order', { ascending: true });

  if (error) {
    if (__DEV__) console.error('SUBSCRIPTION_PACKAGES_LIST_ALL_ERROR', error.message);
    return { ok: false, code: 'db_error', message: `Errore caricamento pacchetti: ${error.message}` };
  }
  return { ok: true, data: (data ?? []).map(mapRow) };
}

export async function getPackageById(id: string): Promise<PackagesServiceResult<SubscriptionPackage | null>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();

  const { data, error } = await supabase.from('subscription_packages').select(SELECT_COLUMNS).eq('id', id).maybeSingle();
  if (error) {
    return { ok: false, code: 'db_error', message: `Errore caricamento pacchetto: ${error.message}` };
  }
  return { ok: true, data: data ? mapRow(data) : null };
}

function toInsertPayload(input: SubscriptionPackageInput) {
  return {
    target_role: input.targetRole,
    name: input.name.trim(),
    description: input.description.trim() || null,
    price: input.price,
    currency: input.currency.trim().toUpperCase() || 'EUR',
    duration_value: input.durationValue,
    duration_unit: input.durationUnit,
    max_clients: input.targetRole === 'coach' ? input.maxClients : null,
    features: input.features,
    is_active: input.isActive,
    sort_order: input.sortOrder,
  };
}

export async function createPackage(input: SubscriptionPackageInput): Promise<PackagesServiceResult<SubscriptionPackage>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();

  const { data, error } = await supabase
    .from('subscription_packages')
    .insert(toInsertPayload(input))
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    return { ok: false, code: 'db_error', message: `Errore creazione pacchetto: ${error.message}` };
  }
  return { ok: true, data: mapRow(data) };
}

export async function updatePackage(
  id: string,
  input: SubscriptionPackageInput,
): Promise<PackagesServiceResult<SubscriptionPackage>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();

  const { data, error } = await supabase
    .from('subscription_packages')
    .update(toInsertPayload(input))
    .eq('id', id)
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    return { ok: false, code: 'db_error', message: `Errore aggiornamento pacchetto: ${error.message}` };
  }
  return { ok: true, data: mapRow(data) };
}

export async function setPackageActive(id: string, isActive: boolean): Promise<PackagesServiceResult<null>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();

  const { error } = await supabase.from('subscription_packages').update({ is_active: isActive }).eq('id', id);
  if (error) {
    return { ok: false, code: 'db_error', message: `Errore aggiornamento stato pacchetto: ${error.message}` };
  }
  return { ok: true, data: null };
}

// Elimina un pacchetto SOLO se non e' collegato a nessun abbonamento attivo/in
// attesa (user_subscriptions.status in 'pending'/'active'). Se esistono solo
// righe storiche (expired/canceled), il vincolo `on delete restrict` a
// livello DB blocca comunque la delete fisica: in quel caso l'errore viene
// tradotto in un messaggio che consiglia di disattivare il pacchetto invece
// di eliminarlo, cosi' lo storico non viene mai perso silenziosamente.
export async function deletePackage(id: string): Promise<PackagesServiceResult<null>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();

  const { data: linked, error: linkedError } = await supabase
    .from('user_subscriptions')
    .select('id')
    .eq('package_id', id)
    .in('status', ['pending', 'active'])
    .limit(1);
  if (linkedError) {
    return { ok: false, code: 'db_error', message: `Errore verifica abbonamenti collegati: ${linkedError.message}` };
  }
  if (linked && linked.length > 0) {
    return {
      ok: false,
      code: 'has_linked_subscriptions',
      message: 'Questo pacchetto ha abbonamenti attivi collegati: disattivalo invece di eliminarlo.',
    };
  }

  const { error } = await supabase.from('subscription_packages').delete().eq('id', id);
  if (error) {
    if (error.code === '23503') {
      return {
        ok: false,
        code: 'has_linked_subscriptions',
        message: 'Questo pacchetto ha ancora abbonamenti storici collegati: disattivalo invece di eliminarlo.',
      };
    }
    return { ok: false, code: 'db_error', message: `Errore eliminazione pacchetto: ${error.message}` };
  }
  return { ok: true, data: null };
}
