import { supabase, supabaseConfig } from './supabase';

import type { CoachClientCapacity } from '@/types/subscription-packages';

// Contatore "Clienti utilizzati: X su Y / Posti disponibili: Z" — legge
// SEMPRE dal server tramite la RPC get_coach_client_capacity (docs/
// SUPABASE_SCHEMA.sql, sezione "Limite clienti coach"), mai da uno store
// locale: X e' il conteggio reale di coach_clients con status='active', Y e'
// max_clients del pacchetto coach attivo corrente (subscription_packages via
// user_subscriptions), Z = Y - X. La RPC rifiuta chiunque non sia il coach
// stesso o il superadmin per il p_coach_id richiesto.

export type CoachClientCapacityServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: 'not_configured' | 'db_error'; message: string };

const NOT_CONFIGURED_MESSAGE = 'Supabase non e\' configurato su questo ambiente: impossibile leggere la capacita\' clienti.';

function notConfigured<T>(): CoachClientCapacityServiceResult<T> {
  return { ok: false, code: 'not_configured', message: NOT_CONFIGURED_MESSAGE };
}

type CapacityRow = {
  has_active_subscription: boolean;
  package_name: string | null;
  max_clients: number | null;
  used_clients: number;
  available_slots: number | null;
  expires_at: string | null;
};

export async function getCoachClientCapacity(coachId: string): Promise<CoachClientCapacityServiceResult<CoachClientCapacity>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();

  const { data, error } = await supabase
    .rpc('get_coach_client_capacity', { p_coach_id: coachId })
    .maybeSingle<CapacityRow>();

  if (error) {
    if (__DEV__) console.error('COACH_CLIENT_CAPACITY_ERROR', error.message);
    return { ok: false, code: 'db_error', message: `Errore lettura capacita' clienti: ${error.message}` };
  }
  if (!data) {
    return {
      ok: true,
      data: { hasActiveSubscription: false, packageName: null, maxClients: null, usedClients: 0, availableSlots: null, expiresAt: null },
    };
  }
  return {
    ok: true,
    data: {
      hasActiveSubscription: data.has_active_subscription,
      packageName: data.package_name,
      maxClients: data.max_clients,
      usedClients: data.used_clients,
      availableSlots: data.available_slots,
      expiresAt: data.expires_at,
    },
  };
}
