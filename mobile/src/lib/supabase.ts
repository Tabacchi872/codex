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
      reason: 'missing_env' | 'missing_package';
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

  return {
    ready: false,
    reason: 'missing_package',
    missing: ['@supabase/supabase-js'],
  };
}

export function assertSupabaseConfigured() {
  const status = getSupabaseClientStatus();

  if (!status.ready) {
    throw new Error(`Supabase non configurato: ${status.missing.join(', ')}`);
  }

  return status;
}

// Fase 1: il pacchetto @supabase/supabase-js non e installato per non cambiare
// runtime della demo Expo Go senza conferma. In fase 2 questo export andra
// sostituito con createClient<Database>(url, anonKey, options).
export const supabase = null;
