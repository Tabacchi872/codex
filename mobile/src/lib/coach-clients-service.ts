import { getCurrentSession } from './auth-service';
import { createClientAvatarSignedUrl } from './client-avatar-service';
import { DEMO_DATA_ENABLED } from './demo-data';
import { supabase, supabaseConfig } from './supabase';

import { SEED_CLIENTS } from '@/data/seed-clients';
import type { Client } from '@/types/client';

type CoachClientsResult = { ok: true; data: Client[]; coachId: string | null } | { ok: false; message: string };

type CoachClientRow = {
  client_id: string;
  created_at: string;
  status: string;
  linked_by_code: string | null;
  suspended_at: string | null;
  suspension_reason: string | null;
  removed_at: string | null;
  reactivated_at: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  avatar_preset: Client['avatarPreset'] | null;
  created_at: string;
  updated_at: string | null;
};

type ClientProfileRow = {
  user_id: string;
  goal: string | null;
  notes: string | null;
  created_at: string;
};

export async function listCoachClientsForCurrentUser(): Promise<CoachClientsResult> {
  if (!supabaseConfig.isConfigured || !supabase) {
    return { ok: true, data: DEMO_DATA_ENABLED ? SEED_CLIENTS : [], coachId: null };
  }

  const sessionResult = await getCurrentSession();
  const coachId = sessionResult.ok ? sessionResult.data?.user.id ?? null : null;
  if (!coachId) {
    return { ok: true, data: [], coachId: null };
  }

  const { data: links, error: linksError } = await supabase
    .from('coach_clients')
    .select('client_id,created_at,status,linked_by_code,suspended_at,suspension_reason,removed_at,reactivated_at')
    .eq('coach_id', coachId)
    .in('status', ['active', 'suspended', 'removed']);

  if (linksError) {
    if (__DEV__) console.error('COACH_CLIENTS_LINKS_ERROR', linksError.message);
    return { ok: false, message: 'Non e stato possibile caricare i clienti. Riprova.' };
  }

  const uniqueLinks = dedupeLinks((links ?? []) as CoachClientRow[]);
  const clientIds = uniqueLinks.map((link) => link.client_id);
  if (__DEV__) {
    console.log('COACH_CLIENTS_LINKS_LOADED', {
      count: uniqueLinks.length,
      links: uniqueLinks.map((l) => ({ clientId: l.client_id, status: l.status })),
    });
  }
  if (clientIds.length === 0) {
    return { ok: true, data: DEMO_DATA_ENABLED ? SEED_CLIENTS : [], coachId };
  }

  const [profilesRes, clientProfilesRes] = await Promise.all([
    loadClientProfiles(clientIds),
    supabase.from('client_profiles').select('user_id,goal,notes,created_at').in('user_id', clientIds),
  ]);

  if (profilesRes.error) {
    if (__DEV__) console.error('COACH_CLIENTS_PROFILES_ERROR', profilesRes.error.message);
    return { ok: false, message: 'Non e stato possibile caricare i clienti. Riprova.' };
  }
  if (clientProfilesRes.error) {
    if (__DEV__) console.error('COACH_CLIENTS_CLIENT_PROFILES_ERROR', clientProfilesRes.error.message);
    return { ok: false, message: 'Non e stato possibile caricare i clienti. Riprova.' };
  }

  const profiles = ((profilesRes.data ?? []) as ProfileRow[]).filter((profile) => clientIds.includes(profile.id));
  const clientProfiles = (clientProfilesRes.data ?? []) as ClientProfileRow[];
  if (__DEV__) {
    console.log('COACH_CLIENTS_PROFILES_LOADED', { count: profiles.length, profileIds: profiles.map((p) => p.id) });
    const missing = uniqueLinks.filter((link) => !profiles.some((p) => p.id === link.client_id));
    if (missing.length > 0) {
      console.warn('COACH_CLIENTS_PROFILE_MISSING_FOR_LINK', missing.map((l) => ({ clientId: l.client_id, status: l.status })));
    }
  }

  const clients = (
    await Promise.all(
      uniqueLinks.map(async (link) => {
      const profile = profiles.find((item) => item.id === link.client_id);
      if (!profile) return null;
      const clientProfile = clientProfiles.find((item) => item.user_id === link.client_id);
      return mapCoachClient(link, profile, clientProfile, coachId, await resolveCoachClientAvatarUrl(profile));
    })
    )
  )
    .filter((client): client is Client => client !== null);

  if (__DEV__) {
    console.log('COACH_CLIENTS_MAPPED', {
      total: clients.length,
      activeCount: clients.filter((c) => c.connectionStatus === 'active').length,
      suspendedCount: clients.filter((c) => c.connectionStatus === 'suspended').length,
      removedCount: clients.filter((c) => c.connectionStatus === 'removed').length,
    });
  }

  return { ok: true, data: DEMO_DATA_ENABLED ? [...SEED_CLIENTS, ...clients] : clients, coachId };
}

async function loadClientProfiles(clientIds: string[]) {
  const client = supabase!;
  const extended = await client
    .from('profiles')
    .select('id,full_name,email,phone,avatar_url,avatar_preset,created_at,updated_at')
    .in('id', clientIds);

  if (!extended?.error) return extended;

  if (__DEV__) console.warn('COACH_CLIENTS_PROFILE_EXTENDED_SELECT_ERROR', extended.error.message);
  const fallback = await client
    .from('profiles')
    .select('id,full_name,email,phone,avatar_url,created_at')
    .in('id', clientIds);

  return {
    data: (fallback.data ?? []).map((profile) => ({ ...profile, avatar_preset: null, updated_at: null })),
    error: fallback.error,
  };
}

function dedupeLinks(links: CoachClientRow[]) {
  const seen = new Set<string>();
  const result: CoachClientRow[] = [];
  for (const link of links) {
    if (seen.has(link.client_id)) continue;
    seen.add(link.client_id);
    result.push(link);
  }
  return result;
}

function mapCoachClient(
  link: CoachClientRow,
  profile: ProfileRow,
  clientProfile: ClientProfileRow | undefined,
  coachId: string,
  signedAvatarUrl: string | null,
): Client {
  const { firstName, lastName } = splitFullName(profile.full_name || profile.email);
  return {
    id: profile.id,
    firstName,
    lastName,
    email: profile.email,
    phone: profile.phone ?? undefined,
    goal: clientProfile?.goal ?? '',
    notes: clientProfile?.notes ?? '',
    status: link.status === 'suspended' ? 'in_pausa' : link.status === 'removed' ? 'scaduto' : 'attivo',
    createdAt: link.created_at || clientProfile?.created_at || profile.created_at,
    coachId,
    linkedByCode: link.linked_by_code,
    connectionStatus: link.status === 'suspended' ? 'suspended' : link.status === 'removed' ? 'removed' : 'active',
    suspendedAt: link.suspended_at,
    suspensionReason: link.suspension_reason,
    removedAt: link.removed_at,
    reactivatedAt: link.reactivated_at,
    avatarStoragePath: profile.avatar_url,
    avatarUrl: signedAvatarUrl,
    avatarPreset: profile.avatar_preset ?? 'neutral',
  };
}

async function resolveCoachClientAvatarUrl(profile: ProfileRow): Promise<string | null> {
  if (!profile.avatar_url) return null;
  const cacheKey = profile.updated_at ?? Date.now();
  const signedUrl = await createClientAvatarSignedUrl(profile.avatar_url, cacheKey);
  if (signedUrl) return signedUrl;
  if (/^https?:\/\//i.test(profile.avatar_url)) return profile.avatar_url;
  if (__DEV__) console.warn('COACH_CLIENT_AVATAR_SIGNED_URL_MISSING', profile.id);
  return null;
}

function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: 'Cliente', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}
