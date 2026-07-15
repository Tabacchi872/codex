import { Platform } from 'react-native';

// Costruisce il redirectTo per resetPasswordForEmail solo su web, usando
// window.location.origin (funziona su qualunque porta locale, es. 8081/8082/
// 8084, senza hardcodarne una). Su nativo (Expo Go) non c'e' un'origin browser
// affidabile in questa fase: si ritorna undefined e Supabase usa la Site URL
// configurata nel progetto (vedi docs/EMAIL_SETUP.md) — deep link nativo non
// gestito qui.
export function getWebRedirectUrl(path: string): string | undefined {
  if (Platform.OS !== 'web') return undefined;
  if (typeof window === 'undefined' || !window.location?.origin) return undefined;
  return `${window.location.origin}${path}`;
}
