import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfig = {
  url: supabaseUrl,
  anonKey: supabaseAnonKey,
  isConfigured: Boolean(supabaseUrl && supabaseAnonKey),
} as const;

export type SupabaseClientStatus =
  | {
      ready: true;
      url: string;
      anonKey: string;
    }
  | {
      ready: false;
      reason: 'missing_env';
      missing: string[];
    };

export function getSupabaseClientStatus(): SupabaseClientStatus {
  const missing = [
    !supabaseUrl ? 'EXPO_PUBLIC_SUPABASE_URL' : null,
    !supabaseAnonKey ? 'EXPO_PUBLIC_SUPABASE_ANON_KEY' : null,
  ].filter((value): value is string => Boolean(value));

  if (missing.length > 0) {
    return { ready: false, reason: 'missing_env', missing };
  }

  return { ready: true, url: supabaseUrl as string, anonKey: supabaseAnonKey as string };
}

export function assertSupabaseConfigured() {
  const status = getSupabaseClientStatus();

  if (!status.ready) {
    throw new Error(`Supabase non configurato: ${status.missing.join(', ')}`);
  }

  return status;
}

// Client reale creato solo se URL/anon key sono presenti in ambiente. Se mancano,
// `supabase` resta null e ogni chiamata reale (vedi lib/auth-service.ts) deve
// controllare `supabaseConfig.isConfigured` prima di usarlo, cadendo sul login/
// registrazione demo locale (AsyncStorage) invece di andare in crash.
// `detectSessionInUrl` va attivato solo su web: e' li' che i link email di
// conferma/reset password arrivano come frammento #access_token=...&type=...
// nell'URL del browser. Su nativo (Expo Go) non c'e' un URL di browser da
// leggere, quindi resta disattivato (deep link nativo non gestito in questa fase).
export const supabase: SupabaseClient | null = supabaseConfig.isConfigured
  ? createClient(supabaseConfig.url as string, supabaseConfig.anonKey as string, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
      },
    })
  : null;
