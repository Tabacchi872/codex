import { Platform } from 'react-native';

import type { SubscriptionPackage } from '@/types/subscription-packages';

// Servizio "predisposto" per il checkout di un subscription_packages, come
// richiesto esplicitamente: NESSUN pagamento reale Apple/Google/Stripe e'
// collegato qui, e nessun acquisto viene mai simulato come completato (non
// scrive mai una riga in user_subscriptions). Un solo punto di ingresso
// (startPackageCheckout) che oggi ritorna sempre "non ancora disponibile":
// quando un provider reale sara' collegato, solo il corpo di questa funzione
// cambiera' (chiamata SDK Stripe/Apple/Google + attesa esito), senza toccare
// le schermate che la chiamano (abbonamento-coach.tsx, pacchetti-cliente.tsx).

export type CheckoutProvider = 'stripe' | 'apple' | 'google';

export type CheckoutResult = {
  ok: false;
  code: 'not_implemented';
  provider: CheckoutProvider;
  message: string;
};

// Web -> Stripe (checkout in-browser), iOS -> Apple (in-app purchase),
// Android -> Google (in-app purchase): scelta standard per piattaforma, non
// selezionabile dall'utente.
export function resolveCheckoutProvider(): CheckoutProvider {
  if (Platform.OS === 'ios') return 'apple';
  if (Platform.OS === 'android') return 'google';
  return 'stripe';
}

const PROVIDER_LABEL: Record<CheckoutProvider, string> = {
  stripe: 'Stripe',
  apple: 'Apple In-App Purchase',
  google: 'Google Play Billing',
};

export async function startPackageCheckout(pkg: SubscriptionPackage): Promise<CheckoutResult> {
  const provider = resolveCheckoutProvider();
  if (__DEV__) {
    console.log('PACKAGE_CHECKOUT_NOT_IMPLEMENTED', { packageId: pkg.id, provider });
  }
  return {
    ok: false,
    code: 'not_implemented',
    provider,
    message: `Il pagamento reale tramite ${PROVIDER_LABEL[provider]} non e' ancora collegato. Contatta l'assistenza per completare l'acquisto di "${pkg.name}".`,
  };
}
