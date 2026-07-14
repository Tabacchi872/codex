import { Platform } from 'react-native';

import { getCurrentSession } from './auth-service';
import {
  loadRevenueCatProductStates,
  purchaseRevenueCatPackage,
  restoreRevenueCatPurchases,
  type RevenueCatProductState,
} from './revenuecat-service';
import { waitForAnySubscriptionSync, waitForPackageSubscriptionSync } from './user-subscriptions-service';

import type { SubscriptionPackage } from '@/types/subscription-packages';

export type CheckoutProvider = 'apple' | 'google' | 'unsupported';

export type CheckoutResult =
  | {
      ok: true;
      code: 'completed' | 'pending' | 'sync_timeout';
      provider: CheckoutProvider;
      message: string;
    }
  | {
      ok: false;
      code: 'not_implemented' | 'not_authenticated' | 'not_configured' | 'unsupported' | 'missing_product' | 'cancelled' | 'purchase_error' | 'sync_error';
      provider: CheckoutProvider;
      message: string;
    };

export type RestorePurchasesResult =
  | { ok: true; code: 'synced' | 'sync_timeout'; provider: CheckoutProvider; message: string }
  | { ok: false; code: 'not_authenticated' | 'not_configured' | 'unsupported' | 'restore_error' | 'sync_error'; provider: CheckoutProvider; message: string };

export function resolveCheckoutProvider(): CheckoutProvider {
  if (Platform.OS === 'ios') return 'apple';
  if (Platform.OS === 'android') return 'google';
  return 'unsupported';
}

export async function loadStoreProductsForPackages(
  packages: SubscriptionPackage[],
): Promise<Record<string, RevenueCatProductState>> {
  const session = await getCurrentSession();
  const userId = session.ok ? session.data?.user.id : null;
  if (!userId) {
    return Object.fromEntries(
      packages.map((pkg) => [
        pkg.id,
        {
          status: 'not_configured' as const,
          packageId: pkg.id,
          message: 'Accedi con un account Supabase reale per caricare i prezzi dello store.',
        },
      ]),
    );
  }
  return loadRevenueCatProductStates(userId, packages);
}

export async function startPackageCheckout(pkg: SubscriptionPackage): Promise<CheckoutResult> {
  const provider = resolveCheckoutProvider();
  if (pkg.targetRole !== 'coach') {
    return {
      ok: false,
      code: 'not_implemented',
      provider,
      message: 'Il pagamento reale dei pacchetti cliente non e ancora collegato. Nessun abbonamento viene attivato localmente.',
    };
  }

  const session = await getCurrentSession();
  const userId = session.ok ? session.data?.user.id : null;
  if (!userId) {
    return { ok: false, code: 'not_authenticated', provider, message: 'Accedi con un account Supabase reale per acquistare.' };
  }

  const purchase = await purchaseRevenueCatPackage(pkg, userId);
  if (!purchase.ok) {
    return { ok: false, code: mapPurchaseErrorCode(purchase.code), provider, message: purchase.message };
  }

  if (purchase.status === 'pending') {
    return { ok: true, code: 'pending', provider, message: purchase.message };
  }

  const synced = await waitForPackageSubscriptionSync(userId, pkg.id);
  if (!synced.ok) {
    return { ok: false, code: 'sync_error', provider, message: synced.message };
  }
  if (!synced.data) {
    return {
      ok: true,
      code: 'sync_timeout',
      provider,
      message: 'Acquisto completato nello store. La sincronizzazione Supabase e ancora in corso: riapri la schermata tra poco.',
    };
  }
  return { ok: true, code: 'completed', provider, message: 'Pacchetto attivato.' };
}

export async function restorePackagePurchases(): Promise<RestorePurchasesResult> {
  const provider = resolveCheckoutProvider();
  const session = await getCurrentSession();
  const userId = session.ok ? session.data?.user.id : null;
  if (!userId) {
    return { ok: false, code: 'not_authenticated', provider, message: 'Accedi con un account Supabase reale per ripristinare gli acquisti.' };
  }

  const restored = await restoreRevenueCatPurchases(userId);
  if (!restored.ok) {
    return { ok: false, code: restored.code, provider, message: restored.message };
  }

  const synced = await waitForAnySubscriptionSync(userId);
  if (!synced.ok) {
    return { ok: false, code: 'sync_error', provider, message: synced.message };
  }
  if (!synced.data) {
    return {
      ok: true,
      code: 'sync_timeout',
      provider,
      message: 'Ripristino ricevuto. La sincronizzazione Supabase e ancora in corso: riapri la schermata tra poco.',
    };
  }
  return { ok: true, code: 'synced', provider, message: 'Acquisti ripristinati e abbonamento aggiornato.' };
}

function mapPurchaseErrorCode(code: 'unsupported' | 'not_configured' | 'missing_product' | 'cancelled' | 'purchase_error') {
  if (code === 'missing_product') return 'missing_product' as const;
  return code;
}
