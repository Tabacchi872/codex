import { getCurrentSession } from './auth-service';
import { supabase, supabaseConfig } from './supabase';

import type { ChatMessage } from '@/types/chat';

// Servizio messaggi su Supabase (public.messages, fase 6): conversazioni
// reali coach-cliente, ordinate per created_at. Quando Supabase e'
// configurato questa e' la fonte principale — useChatStore resta il mirror
// locale (badge non letti in tab bar, rendering thread), aggiornato da
// use-messages-realtime.ts. Mappatura verso il modello ChatMessage esistente
// (sender 'coach'|'client', readByCoachAt/readByClientAt):
// - read_at nel DB = quando il DESTINATARIO ha letto il messaggio;
// - un messaggio si considera sempre "letto" dal proprio mittente.
// La marcatura di lettura passa SOLO dalla RPC mark_messages_read (security
// definer): la RLS non permette update diretti su messages, cosi' nessuno
// puo' alterare corpo/mittente di un messaggio esistente.

export type MessageServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

const NOT_CONFIGURED: MessageServiceResult<never> = {
  ok: false,
  code: 'not_configured',
  message: 'Supabase non e\' configurato su questo ambiente.',
};

type MessageRow = {
  id: string;
  coach_id: string;
  client_id: string;
  sender_id: string;
  sender_role: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

const ROW_COLUMNS = 'id,coach_id,client_id,sender_id,sender_role,body,read_at,created_at';

function mapRowToChatMessage(row: MessageRow): ChatMessage {
  const fromCoach = row.sender_role === 'coach' || row.sender_role === 'superadmin';
  return {
    id: row.id,
    clientId: row.client_id,
    sender: fromCoach ? 'coach' : 'client',
    text: row.body,
    createdAt: row.created_at,
    // Il mittente ha "letto" il proprio messaggio al momento dell'invio; il
    // destinatario solo quando read_at e' valorizzato dalla RPC.
    readByCoachAt: fromCoach ? row.created_at : (row.read_at ?? undefined),
    readByClientAt: fromCoach ? (row.read_at ?? undefined) : row.created_at,
  };
}

// Tutti i messaggi visibili all'utente corrente (coach: tutti i propri
// thread; cliente: solo il proprio) — la RLS fa da confine, nessun filtro
// applicativo aggiuntivo necessario.
export async function listMessagesForCurrentUser(): Promise<MessageServiceResult<ChatMessage[]>> {
  if (!supabaseConfig.isConfigured || !supabase) return NOT_CONFIGURED;
  const { data, error } = await supabase.from('messages').select(ROW_COLUMNS).order('created_at', { ascending: true });
  if (error) {
    console.log('MESSAGES_REMOTE_LOAD', { ok: false });
    return { ok: false, code: 'load_failed', message: 'Impossibile caricare i messaggi. Riprova.' };
  }
  console.log('MESSAGES_REMOTE_LOAD', { ok: true, count: data?.length ?? 0 });
  return { ok: true, data: (data as MessageRow[]).map(mapRowToChatMessage) };
}

// Coach id collegato al cliente autenticato (per l'invio lato cliente, che
// deve valorizzare coach_id nella riga): un cliente ha al piu' UN coach.
export async function getLinkedCoachIdForCurrentClient(): Promise<MessageServiceResult<string>> {
  if (!supabaseConfig.isConfigured || !supabase) return NOT_CONFIGURED;
  const session = await getCurrentSession();
  if (!session.ok || !session.data) {
    return { ok: false, code: 'not_authenticated', message: 'Sessione non valida. Rifai il login.' };
  }
  const { data, error } = await supabase
    .from('coach_clients')
    .select('coach_id')
    .eq('client_id', session.data.user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (error || !data) {
    return { ok: false, code: 'no_coach', message: 'Nessun coach collegato a questo account.' };
  }
  return { ok: true, data: data.coach_id as string };
}

export async function sendMessageRemote(params: {
  coachId: string;
  clientId: string;
  body: string;
}): Promise<MessageServiceResult<ChatMessage>> {
  if (!supabaseConfig.isConfigured || !supabase) return NOT_CONFIGURED;
  const session = await getCurrentSession();
  if (!session.ok || !session.data) {
    return { ok: false, code: 'not_authenticated', message: 'Sessione non valida. Rifai il login.' };
  }
  const senderId = session.data.user.id;
  const senderRole = senderId === params.coachId ? 'coach' : 'cliente';

  const { data, error } = await supabase
    .from('messages')
    .insert({
      coach_id: params.coachId,
      client_id: params.clientId,
      sender_id: senderId,
      sender_role: senderRole,
      body: params.body,
    })
    .select(ROW_COLUMNS)
    .single();

  if (error || !data) {
    console.log('MESSAGE_SEND', { ok: false });
    return { ok: false, code: 'send_failed', message: 'Messaggio non inviato. Riprova.' };
  }
  console.log('MESSAGE_SEND', { ok: true });
  return { ok: true, data: mapRowToChatMessage(data as MessageRow) };
}

// Marca come letti SOLO i messaggi RICEVUTI (sender_id <> auth.uid()) del
// thread indicato — la RPC verifica server-side che il chiamante sia davvero
// uno dei due partecipanti. Ritorna il numero di messaggi marcati.
export async function markThreadReadRemote(coachId: string, clientId: string): Promise<MessageServiceResult<number>> {
  if (!supabaseConfig.isConfigured || !supabase) return NOT_CONFIGURED;
  const { data, error } = await supabase.rpc('mark_messages_read', {
    p_coach_id: coachId,
    p_client_id: clientId,
  });
  if (error) {
    return { ok: false, code: 'mark_read_failed', message: 'Impossibile aggiornare lo stato di lettura.' };
  }
  return { ok: true, data: typeof data === 'number' ? data : 0 };
}
