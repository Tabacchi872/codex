import { supabase, supabaseConfig } from './supabase';

import type { SubscriptionPackage, UserSubscription, UserSubscriptionStatus } from '@/types/subscription-packages';

// Lettura abbonamenti utente (docs/SUPABASE_SCHEMA.sql, tabella
// user_subscriptions) — ogni utente legge solo le proprie righe (RLS
// user_subscriptions_self_read), sia coach sia cliente: stesso servizio per
// entrambi i ruoli, la differenza e' solo nel targetRole del pacchetto
// collegato. Nessuna scrittura qui: vedi package-checkout-service.ts per il
// motivo (nessun pagamento reale collegato in questa fase).

export type UserSubscriptionsServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: 'not_configured' | 'db_error'; message: string };

const NOT_CONFIGURED_MESSAGE = 'Supabase non e\' configurato su questo ambiente: impossibile leggere gli abbonamenti.';

function notConfigured<T>(): UserSubscriptionsServiceResult<T> {
  return { ok: false, code: 'not_configured', message: NOT_CONFIGURED_MESSAGE };
}

type PackageRow = {
  id: string;
  target_role: 'coach' | 'client';
  name: string;
  description: string | null;
  price: number;
  currency: string;
  duration_value: number;
  duration_unit: 'days' | 'months';
  max_clients: number | null;
  features: string[] | null;
  revenuecat_entitlement_id: string | null;
  revenuecat_offering_id: string | null;
  android_product_id: string | null;
  ios_product_id: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type SubscriptionRow = {
  id: string;
  user_id: string;
  package_id: string;
  status: UserSubscriptionStatus;
  starts_at: string | null;
  expires_at: string | null;
  payment_provider: string | null;
  external_subscription_id: string | null;
  created_at: string;
  updated_at: string;
  package: PackageRow | null;
};

function mapPackageRow(row: PackageRow): SubscriptionPackage {
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
    revenuecatEntitlementId: row.revenuecat_entitlement_id,
    revenuecatOfferingId: row.revenuecat_offering_id,
    androidProductId: row.android_product_id,
    iosProductId: row.ios_product_id,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSubscriptionRow(row: SubscriptionRow): UserSubscription {
  return {
    id: row.id,
    userId: row.user_id,
    packageId: row.package_id,
    status: row.status,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    paymentProvider: row.payment_provider,
    externalSubscriptionId: row.external_subscription_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    package: row.package ? mapPackageRow(row.package) : undefined,
  };
}

const SELECT_WITH_PACKAGE =
  'id,user_id,package_id,status,starts_at,expires_at,payment_provider,external_subscription_id,created_at,updated_at,package:subscription_packages(id,target_role,name,description,price,currency,duration_value,duration_unit,max_clients,features,revenuecat_entitlement_id,revenuecat_offering_id,android_product_id,ios_product_id,is_active,sort_order,created_at,updated_at)';

// Storico completo (piu' recente prima), incluso l'eventuale abbonamento
// attivo corrente: la UI distingue "corrente" prendendo solo la prima riga
// con status 'active'. Le righe pending restano nello storico, non diventano
// un pacchetto attivo.
export async function listUserSubscriptions(userId: string): Promise<UserSubscriptionsServiceResult<UserSubscription[]>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();

  const { data, error } = await supabase
    .from('user_subscriptions')
    .select(SELECT_WITH_PACKAGE)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    if (__DEV__) console.error('USER_SUBSCRIPTIONS_LIST_ERROR', error.message);
    return { ok: false, code: 'db_error', message: `Errore caricamento abbonamenti: ${error.message}` };
  }
  return { ok: true, data: (data ?? []).map((row) => mapSubscriptionRow(row as unknown as SubscriptionRow)) };
}

export function pickCurrentSubscription(subscriptions: UserSubscription[]): UserSubscription | null {
  const active = subscriptions.filter(isActiveAndValid);
  return (
    active.find((item) => item.paymentProvider === 'superadmin_manual') ??
    active.find((item) => item.paymentProvider === 'revenuecat') ??
    null
  );
}

export function pickCurrentSubscriptionForRole(
  subscriptions: UserSubscription[],
  targetRole: SubscriptionPackage['targetRole'],
): UserSubscription | null {
  return pickCurrentSubscription(subscriptions.filter((item) => item.package?.targetRole === targetRole));
}

function isActiveAndValid(item: UserSubscription) {
  return item.status === 'active' && (!item.expiresAt || new Date(item.expiresAt).getTime() > Date.now());
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForPackageSubscriptionSync(
  userId: string,
  packageId: string,
  attempts = 6,
  delayMs = 1500,
): Promise<UserSubscriptionsServiceResult<UserSubscription | null>> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await listUserSubscriptions(userId);
    if (!result.ok) return result;
    const synced = result.data.find((item) => isActiveAndValid(item) && item.packageId === packageId);
    if (synced) return { ok: true, data: synced };
    if (attempt < attempts - 1) await wait(delayMs);
  }
  return { ok: true, data: null };
}

export async function waitForAnySubscriptionSync(
  userId: string,
  attempts = 6,
  delayMs = 1500,
): Promise<UserSubscriptionsServiceResult<UserSubscription | null>> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await listUserSubscriptions(userId);
    if (!result.ok) return result;
    const current = pickCurrentSubscription(result.data);
    if (current) return { ok: true, data: current };
    if (attempt < attempts - 1) await wait(delayMs);
  }
  return { ok: true, data: null };
}
