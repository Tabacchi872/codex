import { getCurrentSession } from './auth-service';
import { supabaseConfig } from './supabase';
import { listUserSubscriptions, pickCurrentSubscriptionForRole } from './user-subscriptions-service';

import type { SubscriptionPackage, UserSubscription } from '@/types/subscription-packages';

export const CLIENT_REVENUECAT_ENTITLEMENT = 'client_pro';
export const CLIENT_REVENUECAT_OFFERING = 'client_plans';

export type ClientPlanAccess = {
  active: boolean;
  packageName: string | null;
  expiresAt: string | null;
  reason: 'active' | 'expired' | 'missing';
};

type ClientPlanAccessResult =
  | { ok: true; data: ClientPlanAccess }
  | { ok: false; message: string };

export async function getMySelfGuidedPlanAccess(): Promise<ClientPlanAccessResult> {
  if (!supabaseConfig.isConfigured) {
    return { ok: true, data: { active: false, packageName: null, expiresAt: null, reason: 'missing' } };
  }

  const sessionResult = await getCurrentSession();
  const userId = sessionResult.ok ? sessionResult.data?.user.id : null;
  if (!userId) {
    return { ok: false, message: 'Non e stato possibile verificare il piano cliente.' };
  }

  const subscriptionsResult = await listUserSubscriptions(userId);
  if (!subscriptionsResult.ok) {
    return { ok: false, message: 'Non e stato possibile verificare il piano cliente.' };
  }

  const subscription = pickCurrentSelfGuidedSubscription(subscriptionsResult.data);
  const clientSubscriptions = subscriptionsResult.data.filter(
    (item) =>
      item.paymentProvider === 'revenuecat' &&
      item.package?.targetRole === 'client' &&
      item.package?.revenuecatEntitlementId === CLIENT_REVENUECAT_ENTITLEMENT,
  );
  const latestExpired = clientSubscriptions.find((item) => item.status === 'expired' || (item.expiresAt ? new Date(item.expiresAt).getTime() <= Date.now() : false));
  return {
    ok: true,
    data: {
      active: subscription !== null,
      packageName: subscription?.package?.name ?? latestExpired?.package?.name ?? null,
      expiresAt: subscription?.expiresAt ?? latestExpired?.expiresAt ?? null,
      reason: subscription ? 'active' : latestExpired ? 'expired' : 'missing',
    },
  };
}

export function pickCurrentSelfGuidedSubscription(subscriptions: UserSubscription[]) {
  return pickCurrentSubscriptionForRole(
    subscriptions.filter(
      (item) =>
        item.paymentProvider === 'revenuecat' &&
        item.package?.revenuecatEntitlementId === CLIENT_REVENUECAT_ENTITLEMENT,
    ),
    'client',
  );
}

// Ordina sempre MONTHLY -> THREE_MONTH -> ANNUAL usando la durata reale del
// pacchetto (Supabase), mai l'ordine restituito da un'Offering RevenueCat o
// da sort_order del pannello superadmin: entrambi possono cambiare senza che
// il significato "mensile/trimestrale/annuale" cambi. Durata equivalente in
// mesi (durationUnit 'days' e' un'approssimazione a scopo di solo
// ordinamento, mai mostrata all'utente).
function durationInMonths(pkg: SubscriptionPackage): number {
  return pkg.durationUnit === 'months' ? pkg.durationValue : pkg.durationValue / 30;
}

export function sortClientPackagesByDuration<T extends SubscriptionPackage>(packages: T[]): T[] {
  return [...packages].sort((a, b) => durationInMonths(a) - durationInMonths(b));
}
