import { supabase, supabaseConfig } from './supabase';

import type { AppBillingStatus, CoachBillingProfile, SuperadminCoach } from '@/types/superadmin';

// Carica i coach REALI da Supabase (public.profiles role='coach', arricchiti
// con coach_profiles/billing_profiles/registration_codes/coach_clients se
// presenti) per il pannello superadmin — vedi lib/superadmin-coach-service e
// hooks/use-superadmin-coaches.ts. Prima di questo file il pannello leggeva
// SOLO useSuperadminStore (locale, persistito per-device): un coach
// registrato via Supabase su un altro device/browser non compariva mai,
// perche' nessun codice lo andava mai a cercare su Supabase.
//
// Richiede una sessione Supabase reale con profiles.role='superadmin' per
// restituire risultati: le policy RLS (`profiles_superadmin_all` e affini,
// docs/SUPABASE_SCHEMA.sql) filtrano silenziosamente tutte le righe se chi
// chiama non e' un superadmin autenticato su Supabase (es. login demo locale
// admin@fitcoach.local, che non ha alcuna sessione Supabase) — in quel caso
// questa funzione ritorna semplicemente un array vuoto, mai un errore.

const VALID_BILLING_STATUS: AppBillingStatus[] = ['trial', 'active', 'past_due', 'canceled', 'blocked'];

function toBillingStatus(value: string | null | undefined): AppBillingStatus {
  return (VALID_BILLING_STATUS as string[]).includes(value ?? '') ? (value as AppBillingStatus) : 'trial';
}

export type LoadSupabaseCoachesResult = { ok: true; data: SuperadminCoach[] } | { ok: false; message: string };

// Ritorna un risultato esplicito (mai un array vuoto silenzioso in caso di
// errore reale): il chiamante (hooks/use-superadmin-coaches.ts) deve poter
// distinguere "nessun coach registrato" da "la query e' fallita", per
// mostrare un vero stato di errore con Riprova invece di un elenco vuoto
// ingannevole.
export async function loadSupabaseCoaches(): Promise<LoadSupabaseCoachesResult> {
  if (!supabaseConfig.isConfigured || !supabase) return { ok: true, data: [] };

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id,full_name,email,phone,created_at')
    .eq('role', 'coach');
  if (profilesError) {
    if (__DEV__) console.error('SUPERADMIN_COACHES_LOOKUP_ERROR', profilesError.message);
    return { ok: false, message: "Impossibile caricare i coach da Supabase. Riprova." };
  }
  if (!profiles || profiles.length === 0) return { ok: true, data: [] };

  const coachIds = profiles.map((profile) => profile.id);

  const [coachProfilesRes, billingProfilesRes, registrationCodesRes, coachClientsRes, packageSubscriptionsRes] = await Promise.all([
    supabase.from('coach_profiles').select('user_id,business_name,phone,billing_status,created_at').in('user_id', coachIds),
    supabase
      .from('billing_profiles')
      .select(
        'coach_id,subject_type,legal_name,vat_number,fiscal_code,address,postal_code,city,province,country,pec,sdi_code,billing_email',
      )
      .in('coach_id', coachIds),
    supabase.from('registration_codes').select('coach_id,code,status').in('coach_id', coachIds),
    // Solo collegamenti REALMENTE attivi contano per il conteggio clienti —
    // coerente con la definizione usata da _coach_capacity (docs/
    // SUPABASE_SCHEMA.sql) e dalla schermata Clienti del coach.
    supabase.from('coach_clients').select('coach_id').in('coach_id', coachIds).eq('status', 'active'),
    // Pacchetto coach attivo per la capacita' clienti (2026-07-12), distinto
    // dal vecchio "piano app" cosmetico sotto: subscription_packages con
    // target_role='coach' collegato tramite user_subscriptions.status='active'.
    // created_at qui serve solo per scegliere la piu' recente se per qualche
    // motivo ce ne fosse piu' di una (il trigger user_subscriptions_single_active
    // dovrebbe gia' impedirlo, ma la lettura resta difensiva).
    supabase
      .from('user_subscriptions')
      .select('id,user_id,status,expires_at,created_at,package:subscription_packages(name,max_clients,target_role)')
      .in('user_id', coachIds)
      .eq('status', 'active'),
  ]);

  const coachProfiles = coachProfilesRes.data ?? [];
  const billingProfiles = billingProfilesRes.data ?? [];
  const registrationCodes = registrationCodesRes.data ?? [];
  const coachClientsRows = coachClientsRes.data ?? [];
  const packageSubscriptionRows = (packageSubscriptionsRes.data ?? []) as unknown as Array<{
    id: string;
    user_id: string;
    status: string;
    expires_at: string | null;
    created_at: string;
    package: { name: string; max_clients: number | null; target_role: string } | null;
  }>;

  const data = profiles.map((profile): SuperadminCoach => {
    const coachProfile = coachProfiles.find((item) => item.user_id === profile.id);
    const billingProfileRow = billingProfiles.find((item) => item.coach_id === profile.id);
    const codesForCoach = registrationCodes.filter((item) => item.coach_id === profile.id);
    const activeCode = codesForCoach.find((item) => item.status === 'active') ?? codesForCoach[0];
    const clientsUsed = coachClientsRows.filter((item) => item.coach_id === profile.id).length;

    const activePackageSubscription = packageSubscriptionRows
      .filter((row) => row.user_id === profile.id && row.package?.target_role === 'coach')
      .filter((row) => !row.expires_at || new Date(row.expires_at).getTime() > Date.now())
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    const activePackageMaxClients = activePackageSubscription?.package?.max_clients ?? null;

    const billingProfile: CoachBillingProfile | undefined = billingProfileRow
      ? {
          subjectType: billingProfileRow.subject_type,
          legalName: billingProfileRow.legal_name,
          vatNumber: billingProfileRow.vat_number ?? undefined,
          fiscalCode: billingProfileRow.fiscal_code ?? undefined,
          address: billingProfileRow.address ?? undefined,
          postalCode: billingProfileRow.postal_code ?? undefined,
          city: billingProfileRow.city ?? undefined,
          province: billingProfileRow.province ?? undefined,
          country: billingProfileRow.country,
          pec: billingProfileRow.pec ?? undefined,
          sdiCode: billingProfileRow.sdi_code ?? undefined,
          billingEmail: billingProfileRow.billing_email,
        }
      : undefined;

    const billingStatus = toBillingStatus(coachProfile?.billing_status);

    return {
      id: profile.id,
      name: profile.full_name?.trim() || profile.email,
      email: profile.email,
      phone: profile.phone ?? coachProfile?.phone ?? undefined,
      businessName: coachProfile?.business_name ?? undefined,
      billingProfile,
      coachCode: activeCode?.code ?? '',
      coachCodeActive: activeCode?.status === 'active',
      // Nessun piano app reale collegato per i coach Supabase in questa fase
      // (nessuna integrazione Stripe/RevenueCat, vedi docs/DECISIONS.md):
      // 'free' e' un valore cosmetico di default per riusare la UI esistente,
      // non un piano davvero attivo/fatturato.
      planCode: 'free',
      billingStatus,
      clientsUsed,
      periodStartsAt: coachProfile?.created_at ?? profile.created_at ?? '',
      periodEndsAt: '',
      blocked: billingStatus === 'blocked',
      source: 'supabase',
      hasActivePackageSubscription: activePackageSubscription !== undefined,
      activePackageName: activePackageSubscription?.package?.name ?? null,
      activePackageMaxClients,
      activePackageAvailableSlots: activePackageMaxClients === null ? null : Math.max(activePackageMaxClients - clientsUsed, 0),
      activePackageExpiresAt: activePackageSubscription?.expires_at ?? null,
      activeSubscriptionId: activePackageSubscription?.id ?? null,
    };
  });

  return { ok: true, data };
}
