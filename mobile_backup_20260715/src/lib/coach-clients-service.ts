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
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
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
    .select('client_id,created_at,status,linked_by_code')
    .eq('coach_id', coachId)
    .eq('status', 'active');

  if (linksError) {
    if (__DEV__) console.error('COACH_CLIENTS_LINKS_ERROR', linksError.message);
    return { ok: false, message: `Errore caricamento collegamenti clienti: ${linksError.message}` };
  }

  const uniqueLinks = dedupeLinks((links ?? []) as CoachClientRow[]);
  const clientIds = uniqueLinks.map((link) => link.client_id);
  if (clientIds.length === 0) {
    return { ok: true, data: DEMO_DATA_ENABLED ? SEED_CLIENTS : [], coachId };
  }

  const [profilesRes, clientProfilesRes] = await Promise.all([
    supabase.from('profiles').select('id,full_name,email,phone,avatar_url,created_at').in('id', clientIds),
    supabase.from('client_profiles').select('user_id,goal,notes,created_at').in('user_id', clientIds),
  ]);

  if (profilesRes.error) {
    if (__DEV__) console.error('COACH_CLIENTS_PROFILES_ERROR', profilesRes.error.message);
    return { ok: false, message: `Errore caricamento profili clienti: ${profilesRes.error.message}` };
  }
  if (clientProfilesRes.error) {
    if (__DEV__) console.error('COACH_CLIENTS_CLIENT_PROFILES_ERROR', clientProfilesRes.error.message);
    return { ok: false, message: `Errore caricamento profili cliente: ${clientProfilesRes.error.message}` };
  }

  const profiles = ((profilesRes.data ?? []) as ProfileRow[]).filter((profile) => clientIds.includes(profile.id));
  const clientProfiles = (clientProfilesRes.data ?? []) as ClientProfileRow[];

  const clients = (
    await Promise.all(
      uniqueLinks.map(async (link) => {
      const profile = profiles.find((item) => item.id === link.client_id);
      if (!profile) return null;
      const clientProfile = clientProfiles.find((item) => item.user_id === link.client_id);
      return mapCoachClient(link, profile, clientProfile, coachId, await createClientAvatarSignedUrl(profile.avatar_url));
    })
    )
  )
    .filter((client): client is Client => client !== null);

  return { ok: true, data: DEMO_DATA_ENABLED ? [...SEED_CLIENTS, ...clients] : clients, coachId };
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
    status: link.status === 'active' ? 'attivo' : 'in_pausa',
    createdAt: link.created_at || clientProfile?.created_at || profile.created_at,
    coachId,
    linkedByCode: link.linked_by_code,
    avatarStoragePath: profile.avatar_url,
    avatarUrl: signedAvatarUrl ?? profile.avatar_url,
  };
}

function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: 'Cliente', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}
