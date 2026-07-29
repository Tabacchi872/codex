import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';
import Purchases, {
  type CustomerInfo,
  type CustomerInfoUpdateListener,
  type PurchasesError,
  type PurchasesOfferings,
  type PurchasesPackage,
} from 'react-native-purchases';

import type { SubscriptionPackage } from '@/types/subscription-packages';

export type RevenueCatPlatform = 'android' | 'ios';

export type RevenueCatProductInfo = {
  status: 'available';
  packageId: string;
  productIdentifier: string;
  revenueCatPackageIdentifier: string;
  offeringIdentifier: string;
  priceString: string;
  // Prezzo numerico e prezzo-equivalente-mensile (rcPackage.product.price /
  // .pricePerMonth, gia' normalizzato dall'SDK RevenueCat stesso — nessun
  // calcolo manuale sul periodo ISO8601 in questo modulo). Usati SOLO per
  // calcolare in sicurezza il risparmio in UI quando la valuta coincide;
  // priceString resta sempre il testo autorevole mostrato come prezzo.
  price: number | null;
  pricePerMonth: number | null;
  currencyCode: string | null;
  subscriptionPeriod: string | null;
  periodLabel: string | null;
};

export type RevenueCatProductState =
  | RevenueCatProductInfo
  | {
      status: 'unsupported' | 'not_configured' | 'missing' | 'error';
      packageId: string;
      message: string;
      expectedProductId?: string | null;
    };

export type RevenueCatPurchaseResult =
  | {
      ok: true;
      status: 'completed' | 'pending';
      productIdentifier: string;
      customerInfo: CustomerInfo;
      message: string;
    }
  | {
      ok: false;
      code: 'unsupported' | 'not_configured' | 'identify_error' | 'missing_product' | 'cancelled' | 'purchase_error';
      message: string;
    };

export type RevenueCatRestoreResult =
  | { ok: true; customerInfo: CustomerInfo; message: string }
  | { ok: false; code: 'unsupported' | 'not_configured' | 'identify_error' | 'restore_error'; message: string };

export type RevenueCatManageSubscriptionResult =
  | { ok: true; message: string }
  | { ok: false; code: 'unsupported' | 'not_configured' | 'identify_error' | 'no_management_url' | 'open_error'; message: string };

const EXPO_GO_MESSAGE = 'RevenueCat richiede una development build o una build EAS: Expo Go non supporta il modulo nativo.';
const WEB_MESSAGE = 'Acquisti in-app disponibili solo su Android e iOS. Sul web serve un checkout separato.';

let configured = false;
let configuredApiKey: string | null = null;
let identifiedUserId: string | null = null;
let customerInfoListener: CustomerInfoUpdateListener | null = null;
const customerInfoSubscribers = new Set<CustomerInfoUpdateListener>();

function getPlatform(): RevenueCatPlatform | null {
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'ios') return 'ios';
  return null;
}

function getUnsupportedMessage(): string | null {
  if (!getPlatform()) return WEB_MESSAGE;
  if (Constants.appOwnership === 'expo') return EXPO_GO_MESSAGE;
  return null;
}

function getApiKey(): string | null {
  const platform = getPlatform();
  if (platform === 'android') return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?.trim() || null;
  if (platform === 'ios') return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?.trim() || null;
  return null;
}

function getPlatformProductId(pkg: SubscriptionPackage): string | null {
  const platform = getPlatform();
  if (platform === 'android') return pkg.androidProductId?.trim() || null;
  if (platform === 'ios') return pkg.iosProductId?.trim() || null;
  return null;
}

function ensureCustomerInfoListener() {
  if (customerInfoListener) return;
  customerInfoListener = (customerInfo) => {
    customerInfoSubscribers.forEach((listener) => listener(customerInfo));
  };
  Purchases.addCustomerInfoUpdateListener(customerInfoListener);
}

function removeCustomerInfoListenerIfUnused() {
  if (!customerInfoListener || customerInfoSubscribers.size > 0) return;
  Purchases.removeCustomerInfoUpdateListener(customerInfoListener);
  customerInfoListener = null;
}

export function subscribeRevenueCatCustomerInfo(listener: CustomerInfoUpdateListener) {
  customerInfoSubscribers.add(listener);
  if (configured) ensureCustomerInfoListener();
  return () => {
    customerInfoSubscribers.delete(listener);
    removeCustomerInfoListenerIfUnused();
  };
}

export async function configureRevenueCat(): Promise<{ ok: true } | { ok: false; code: 'unsupported' | 'not_configured'; message: string }> {
  const unsupportedMessage = getUnsupportedMessage();
  if (unsupportedMessage) {
    logRevenueCatDiagnostic('REVENUECAT_CONFIG_UNSUPPORTED', { context: getRuntimeDiagnosticContext(), message: unsupportedMessage });
    return { ok: false, code: 'unsupported', message: unsupportedMessage };
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    logRevenueCatDiagnostic('REVENUECAT_CONFIG_MISSING_PUBLIC_KEY', { context: getRuntimeDiagnosticContext() });
    return {
      ok: false,
      code: 'not_configured',
      message: 'Chiave pubblica RevenueCat mancante per questa piattaforma.',
    };
  }

  if (!configured || configuredApiKey !== apiKey) {
    Purchases.configure({ apiKey });
    configured = true;
    configuredApiKey = apiKey;
    logRevenueCatDiagnostic('REVENUECAT_CONFIGURED', { context: getRuntimeDiagnosticContext(), publicApiKeyPresent: true });
  }
  ensureCustomerInfoListener();
  return { ok: true };
}

export async function identifyRevenueCatUser(userId: string) {
  const configuredResult = await configureRevenueCat();
  if (!configuredResult.ok) return configuredResult;
  if (identifiedUserId !== userId) {
    try {
      await Purchases.logIn(userId);
    } catch (err) {
      return { ok: false as const, code: 'identify_error' as const, message: safeErrorMessage(err) };
    }
    identifiedUserId = userId;
  }
  return { ok: true as const };
}

export async function logoutRevenueCat() {
  if (!configured || getUnsupportedMessage()) {
    identifiedUserId = null;
    return;
  }
  try {
    await Purchases.logOut();
  } catch (err) {
    if (__DEV__) console.warn('REVENUECAT_LOGOUT_ERROR', safeErrorMessage(err));
  } finally {
    identifiedUserId = null;
  }
}

export async function getRevenueCatCustomerInfo(userId: string): Promise<{ ok: true; data: CustomerInfo } | { ok: false; message: string }> {
  const identifyResult = await identifyRevenueCatUser(userId);
  if (!identifyResult.ok) return { ok: false, message: identifyResult.message };
  try {
    return { ok: true, data: await Purchases.getCustomerInfo() };
  } catch (err) {
    return { ok: false, message: safeErrorMessage(err) };
  }
}

export async function loadRevenueCatProductStates(userId: string, packages: SubscriptionPackage[]) {
  logRevenueCatDiagnostic('REVENUECAT_LOAD_PRODUCTS_START', {
    context: getRuntimeDiagnosticContext(),
    packages: packages.map(describePackageForDiagnostics),
  });
  const identifyResult = await identifyRevenueCatUser(userId);
  if (!identifyResult.ok) {
    logRevenueCatDiagnostic('REVENUECAT_LOAD_PRODUCTS_IDENTIFY_FAILED', { code: identifyResult.code, message: identifyResult.message });
    return Object.fromEntries(packages.map((pkg) => [pkg.id, unsupportedState(pkg, identifyResult.message)]));
  }

  let offerings: PurchasesOfferings;
  try {
    offerings = await Purchases.getOfferings();
    logRevenueCatDiagnostic('REVENUECAT_GET_OFFERINGS_RESULT', describeOfferingsForDiagnostics(offerings));
  } catch (err) {
    const message = `Impossibile caricare i prodotti store: ${safeErrorMessage(err)}`;
    logRevenueCatDiagnostic('REVENUECAT_GET_OFFERINGS_ERROR', { message });
    return Object.fromEntries(packages.map((pkg) => [pkg.id, errorState(pkg, message)]));
  }

  return Object.fromEntries(packages.map((pkg) => [pkg.id, resolveProductState(pkg, offerings)]));
}

export async function purchaseRevenueCatPackage(pkg: SubscriptionPackage, userId: string): Promise<RevenueCatPurchaseResult> {
  const identifyResult = await identifyRevenueCatUser(userId);
  if (!identifyResult.ok) return { ok: false, code: identifyResult.code, message: identifyResult.message };

  let offerings: PurchasesOfferings;
  try {
    offerings = await Purchases.getOfferings();
    logRevenueCatDiagnostic('REVENUECAT_PURCHASE_OFFERINGS_RESULT', {
      package: describePackageForDiagnostics(pkg),
      offerings: describeOfferingsForDiagnostics(offerings),
    });
  } catch (err) {
    return { ok: false, code: 'purchase_error', message: `Impossibile caricare il prodotto store: ${safeErrorMessage(err)}` };
  }

  const resolved = resolveRevenueCatPackage(pkg, offerings);
  if (!resolved.rcPackage) {
    const message = resolved.state.status === 'available' ? 'Prodotto store non disponibile.' : resolved.state.message;
    return {
      ok: false,
      code: 'missing_product',
      message,
    };
  }

  try {
    const result = await Purchases.purchasePackage(resolved.rcPackage);
    const active = isPackageEntitlementActive(pkg, result.customerInfo, result.productIdentifier);
    return {
      ok: true,
      status: active ? 'completed' : 'pending',
      productIdentifier: result.productIdentifier,
      customerInfo: result.customerInfo,
      message: active
        ? 'Acquisto ricevuto, sincronizzazione in corso.'
        : 'Acquisto ricevuto ma non ancora attivo nello store. La sincronizzazione proseguira quando lo store conferma.',
    };
  } catch (err) {
    const error = err as Partial<PurchasesError>;
    if (error.userCancelled) {
      return { ok: false, code: 'cancelled', message: 'Acquisto annullato.' };
    }
    if (isPendingPurchaseError(err)) {
      return {
        ok: true,
        status: 'pending',
        productIdentifier: resolved.rcPackage.product.identifier,
        customerInfo: await Purchases.getCustomerInfo(),
        message: 'Acquisto in attesa di conferma dello store.',
      };
    }
    return { ok: false, code: 'purchase_error', message: `Acquisto non completato: ${safeErrorMessage(err)}` };
  }
}

export async function restoreRevenueCatPurchases(userId: string): Promise<RevenueCatRestoreResult> {
  const identifyResult = await identifyRevenueCatUser(userId);
  if (!identifyResult.ok) return { ok: false, code: identifyResult.code, message: identifyResult.message };
  try {
    const appUserIdBefore = await Purchases.getAppUserID();
    logRevenueCatDiagnostic('RESTORE_START', { supabaseUserId: userId, revenueCatAppUserIdBefore: appUserIdBefore });
    await Purchases.restorePurchases();
    await Purchases.invalidateCustomerInfoCache();
    const customerInfo = await Purchases.getCustomerInfo();
    const appUserIdAfter = await Purchases.getAppUserID();
    logRevenueCatDiagnostic('RESTORE_SUCCESS', {
      supabaseUserId: userId,
      revenueCatAppUserIdBefore: appUserIdBefore,
      revenueCatAppUserIdAfter: appUserIdAfter,
      ...describeClientProCustomerInfo(customerInfo),
    });
    return { ok: true, customerInfo, message: 'Ripristino ricevuto, sincronizzazione in corso.' };
  } catch (err) {
    logRevenueCatDiagnostic('RESTORE_ERROR', {
      supabaseUserId: userId,
      code: safeErrorCode(err),
      message: safeErrorMessage(err),
    });
    return { ok: false, code: 'restore_error', message: `Ripristino non riuscito: ${safeErrorMessage(err)}` };
  }
}

export async function openRevenueCatSubscriptionManagement(userId: string): Promise<RevenueCatManageSubscriptionResult> {
  const identifyResult = await identifyRevenueCatUser(userId);
  if (!identifyResult.ok) return { ok: false, code: identifyResult.code, message: identifyResult.message };

  let customerInfo: CustomerInfo;
  try {
    customerInfo = await Purchases.getCustomerInfo();
  } catch (err) {
    return { ok: false, code: 'open_error', message: `Impossibile recuperare la gestione abbonamento: ${safeErrorMessage(err)}` };
  }

  const managementURL = (customerInfo as { managementURL?: string | null }).managementURL;
  if (!managementURL) {
    return {
      ok: false,
      code: 'no_management_url',
      message: 'Gestione abbonamento non disponibile per questo account store.',
    };
  }

  try {
    await Linking.openURL(managementURL);
    return { ok: true, message: 'Gestione abbonamento aperta nello store.' };
  } catch (err) {
    return { ok: false, code: 'open_error', message: `Impossibile aprire la gestione abbonamento: ${safeErrorMessage(err)}` };
  }
}

export function isPackageEntitlementActive(pkg: SubscriptionPackage, customerInfo: CustomerInfo, productIdentifier?: string) {
  const entitlementId = pkg.revenuecatEntitlementId?.trim();
  if (entitlementId && customerInfo.entitlements.active[entitlementId]?.isActive) return true;
  const platformProductId = getPlatformProductId(pkg);
  const expected = productIdentifier ?? platformProductId;
  return expected ? customerInfo.activeSubscriptions.includes(expected) : false;
}

export function isClientProCustomerInfoActive(customerInfo: CustomerInfo) {
  return customerInfo.entitlements.active.client_pro?.isActive === true;
}

function resolveProductState(pkg: SubscriptionPackage, offerings: PurchasesOfferings): RevenueCatProductState {
  return resolveRevenueCatPackage(pkg, offerings).state;
}

function resolveRevenueCatPackage(pkg: SubscriptionPackage, offerings: PurchasesOfferings): { state: RevenueCatProductState; rcPackage: PurchasesPackage | null } {
  const expectedProductId = getPlatformProductId(pkg);
  if (!expectedProductId) {
    return {
      rcPackage: null,
      state: {
        status: 'not_configured',
        packageId: pkg.id,
        expectedProductId,
        message: 'Prodotto store non configurato per questa piattaforma.',
      },
    };
  }

  // Lookup esplicito e case-sensitive sull'Offering configurata per QUESTO
  // pacchetto (subscription_packages.revenuecat_offering_id, es. 'client_plans'
  // per i clienti self_guided, 'Fitcoach' per i coach) — MAI offerings.current,
  // MAI un'altra Offering come fallback. offerings.current e' condivisa tra
  // ruoli (la Default Offering di RevenueCat, che resta 'Fitcoach' e non va
  // toccata): usarla come fonte comune mostrerebbe/venderebbe il prodotto
  // sbagliato al ruolo sbagliato se un giorno la Default Offering cambiasse o
  // se un pacchetto non fosse ancora configurato correttamente. Un pacchetto
  // client non deve MAI poter risolvere silenziosamente un package
  // dell'Offering coach, e viceversa.
  const offeringId = pkg.revenuecatOfferingId?.trim();
  if (!offeringId) {
    return {
      rcPackage: null,
      state: {
        status: 'not_configured',
        packageId: pkg.id,
        expectedProductId,
        message: 'Nessuna Offering RevenueCat configurata per questo pacchetto (revenuecat_offering_id mancante).',
      },
    };
  }

  const offering = offerings.all[offeringId];
  if (!offering) {
    return {
      rcPackage: null,
      state: {
        status: 'not_configured',
        packageId: pkg.id,
        expectedProductId,
        message: `Offering RevenueCat "${offeringId}" non trovata. Verifica la configurazione in RevenueCat Dashboard (identificatori case-sensitive).`,
      },
    };
  }

  const rcPackage = offering.availablePackages.find((candidate) => packageMatchesProduct(candidate, expectedProductId));
  if (rcPackage) {
    const period = getProductPeriod(rcPackage);
    return {
      rcPackage,
      state: {
        status: 'available',
        packageId: pkg.id,
        productIdentifier: rcPackage.product.identifier,
        revenueCatPackageIdentifier: rcPackage.identifier,
        offeringIdentifier: offering.identifier,
        priceString: rcPackage.product.priceString,
        price: typeof rcPackage.product.price === 'number' ? rcPackage.product.price : null,
        pricePerMonth: rcPackage.product.pricePerMonth ?? null,
        currencyCode: rcPackage.product.currencyCode ?? null,
        subscriptionPeriod: period,
        periodLabel: period ? formatIsoPeriod(period) : null,
      },
    };
  }

  return {
    rcPackage: null,
    state: {
      status: 'missing',
      packageId: pkg.id,
      expectedProductId,
      message: `Prodotto ${expectedProductId} non trovato nell'Offering "${offeringId}".`,
    },
  };
}

function packageMatchesProduct(candidate: PurchasesPackage, expectedProductId: string) {
  const product = candidate.product;
  if (product.identifier === expectedProductId) return true;
  if (product.defaultOption?.storeProductId === expectedProductId || product.defaultOption?.productId === expectedProductId) return true;
  return product.subscriptionOptions?.some((option) => option.storeProductId === expectedProductId || option.productId === expectedProductId) ?? false;
}

function getProductPeriod(rcPackage: PurchasesPackage) {
  return rcPackage.product.subscriptionPeriod ?? rcPackage.product.defaultOption?.billingPeriod?.iso8601 ?? null;
}

function formatIsoPeriod(period: string) {
  const match = /^P(\d+)([DWMY])$/.exec(period);
  if (!match) return period;
  const value = Number(match[1]);
  const unit = match[2];
  const labels: Record<string, [string, string]> = {
    D: ['giorno', 'giorni'],
    W: ['settimana', 'settimane'],
    M: ['mese', 'mesi'],
    Y: ['anno', 'anni'],
  };
  const [single, plural] = labels[unit] ?? ['periodo', 'periodi'];
  return `${value} ${value === 1 ? single : plural}`;
}

function unsupportedState(pkg: SubscriptionPackage, message: string): RevenueCatProductState {
  return { status: 'unsupported', packageId: pkg.id, expectedProductId: getPlatformProductId(pkg), message };
}

function errorState(pkg: SubscriptionPackage, message: string): RevenueCatProductState {
  return { status: 'error', packageId: pkg.id, expectedProductId: getPlatformProductId(pkg), message };
}

function isPendingPurchaseError(err: unknown) {
  const message = safeErrorMessage(err).toLowerCase();
  return message.includes('pending') || message.includes('deferred');
}

function safeErrorMessage(err: unknown) {
  if (err && typeof err === 'object') {
    const maybeError = err as Partial<PurchasesError> & { message?: string };
    return maybeError.userInfo?.readableErrorCode ?? maybeError.readableErrorCode ?? maybeError.message ?? 'errore sconosciuto';
  }
  return String(err);
}

function safeErrorCode(err: unknown) {
  if (err && typeof err === 'object') {
    const maybeError = err as Partial<PurchasesError> & { code?: string };
    return maybeError.code ?? maybeError.userInfo?.readableErrorCode ?? maybeError.readableErrorCode ?? null;
  }
  return null;
}

function logRevenueCatDiagnostic(event: string, payload: Record<string, unknown>) {
  if (!__DEV__) return;
  console.info(event, payload);
}

function getRuntimeDiagnosticContext() {
  return {
    platform: Platform.OS,
    appOwnership: Constants.appOwnership ?? null,
    executionEnvironment: Constants.executionEnvironment ?? null,
    nativeAppVersion: Constants.nativeAppVersion ?? null,
    nativeBuildVersion: Constants.nativeBuildVersion ?? null,
    iosBundleIdentifier: Constants.expoConfig?.ios?.bundleIdentifier ?? null,
    androidPackage: Constants.expoConfig?.android?.package ?? null,
  };
}

function describePackageForDiagnostics(pkg: SubscriptionPackage) {
  return {
    id: pkg.id,
    name: pkg.name,
    targetRole: pkg.targetRole,
    revenuecatEntitlementId: pkg.revenuecatEntitlementId,
    revenuecatOfferingId: pkg.revenuecatOfferingId,
    androidProductId: pkg.androidProductId,
    iosProductId: pkg.iosProductId,
    expectedProductId: getPlatformProductId(pkg),
    isActive: pkg.isActive,
    durationValue: pkg.durationValue,
    durationUnit: pkg.durationUnit,
  };
}

function describeClientProCustomerInfo(customerInfo: CustomerInfo) {
  const clientPro = customerInfo.entitlements.active.client_pro ?? null;
  return {
    activeSubscriptions: customerInfo.activeSubscriptions,
    clientProActive: clientPro?.isActive === true,
    productIdentifier: clientPro?.productIdentifier ?? null,
    expirationDate: clientPro?.expirationDate ?? null,
    latestPurchaseDate: clientPro?.latestPurchaseDate ?? null,
  };
}

function describeOfferingsForDiagnostics(offerings: PurchasesOfferings) {
  return {
    currentOfferingIdentifier: offerings.current?.identifier ?? null,
    offeringIdentifiers: Object.keys(offerings.all),
    offerings: Object.values(offerings.all).map((offering) => ({
      identifier: offering.identifier,
      packageIdentifiers: offering.availablePackages.map((pkg) => pkg.identifier),
      products: offering.availablePackages.map((pkg) => ({
        revenueCatPackageIdentifier: pkg.identifier,
        productIdentifier: pkg.product.identifier,
        subscriptionPeriod: getProductPeriod(pkg),
      })),
    })),
  };
}
