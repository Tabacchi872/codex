import Constants from 'expo-constants';

// Unico punto in cui vivono nome app, proprietario, dati legali e URL pubblici.
export const APP_NAME = 'FitCoach Pro';
export const APP_OWNER = 'Luigi Marrano';
export const APP_YEAR = 2026;
export const APP_COPYRIGHT = `(c) ${APP_YEAR} ${APP_OWNER}. Tutti i diritti riservati.`;

// Letta da app.json/package.json tramite expo-constants, non duplicata a mano.
export const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

// App a coach singolo: oggi esiste un solo coach; `coachId` resta nei modelli
// per compatibilita con l'evoluzione multi-coach.
export const DEFAULT_COACH_ID = 'coach-1';

const configuredLegalBaseUrl = process.env.EXPO_PUBLIC_LEGAL_PUBLIC_BASE_URL?.trim().replace(/\/+$/, '') ?? '';
const isProductionRuntime = process.env.NODE_ENV === 'production';

export const LEGAL_PUBLIC_BASE_URL = configuredLegalBaseUrl || (isProductionRuntime ? '' : 'http://localhost:8081');

export const LEGAL_CONFIG = {
  legalForm: 'Ditta individuale',
  legalOwnerName: APP_OWNER,
  legalBusinessName: 'Marrano Luigi',
  legalAddress: 'Via Santa Teresa degli Scalzi 124, 80135 Napoli (NA), Italia',
  vatNumber: '09241551218',
  reaNumber: 'NA-1020711',
  chamberOfCommerce: 'Napoli',
  legalEmail: 'marranoluigi@gmail.com',
  privacyEmail: 'appfitcoach2026@gmail.com',
  supportEmail: 'appfitcoach2026@gmail.com',
  pecEmail: 'marrano.luigi@pec.it',
  effectiveDate: '29 luglio 2026',
  privacyVersion: '1.0',
  termsVersion: '1.0',
  minimumAge: 18,
} as const;

export const PRIVACY_POLICY_URL = `${LEGAL_PUBLIC_BASE_URL}/privacy-policy`;
export const TERMS_OF_SERVICE_URL = `${LEGAL_PUBLIC_BASE_URL}/terms-of-service`;
export const ACCOUNT_DELETION_URL = `${LEGAL_PUBLIC_BASE_URL}/account-deletion`;
export const ACCOUNT_DELETION_REQUEST_MAILTO_URL =
  `mailto:${LEGAL_CONFIG.supportEmail}?subject=${encodeURIComponent('Richiesta eliminazione account FitCoach Pro')}`;

export function getLegalProductionAuditErrors() {
  const errors: string[] = [];
  if (!LEGAL_PUBLIC_BASE_URL) {
    errors.push('EXPO_PUBLIC_LEGAL_PUBLIC_BASE_URL non configurato');
  } else if (isProductionRuntime && !LEGAL_PUBLIC_BASE_URL.startsWith('https://')) {
    errors.push('EXPO_PUBLIC_LEGAL_PUBLIC_BASE_URL deve essere HTTPS in produzione');
  }
  if (isProductionRuntime && LEGAL_PUBLIC_BASE_URL.includes('localhost')) {
    errors.push('localhost non consentito nelle build production');
  }
  return errors;
}

export function isLegalProductionReady() {
  return getLegalProductionAuditErrors().length === 0;
}
