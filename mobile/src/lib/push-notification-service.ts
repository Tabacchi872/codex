import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { supabase, supabaseConfig } from './supabase';

// Notifiche push reali (fase 7, APK EAS): registrazione dell'Expo Push Token
// in public.push_tokens (upsert per token, RLS owner-scope), gestione
// foreground/background/tap, e client della Edge Function send-push. La
// chiave decisionale di sicurezza NON e' qui: send-push valida il JWT del
// chiamante e risolve il destinatario SOLO dalle relazioni reali sul
// database (coach_clients) — il client mobile non invia mai un user_id
// destinatario arbitrario, solo il clientId del thread/appuntamento, che la
// function verifica. Nessuna service role key nell'app.
//
// Su web e su emulatori senza servizi Google la registrazione e' un no-op
// esplicito (nessun errore mostrato: le push sono una funzione additiva).

let currentToken: string | null = null;
let registered = false;
let responseListenerAttached = false;

// Foreground: mostra comunque banner/suono (senza, una notifica ricevuta con
// l'app aperta sparirebbe in silenzio). Impostato una sola volta al modulo.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function getProjectId(): string | null {
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  return typeof projectId === 'string' && projectId ? projectId : null;
}

export async function registerPushTokenForCurrentUser(): Promise<void> {
  if (Platform.OS === 'web' || !supabaseConfig.isConfigured || !supabase) return;
  if (!Device.isDevice) {
    console.log('PUSH_REGISTER', { skipped: 'not_a_device' });
    return;
  }
  if (registered && currentToken) return;

  try {
    // Canale Android PRIMA del token: senza canale, su Android 8+ le
    // notifiche non vengono mostrate affatto.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Notifiche FitCoach',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const permissions = await Notifications.getPermissionsAsync();
    let status = permissions.status;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') {
      console.log('PUSH_REGISTER', { skipped: 'permission_denied' });
      return;
    }

    const projectId = getProjectId();
    if (!projectId) {
      console.log('PUSH_REGISTER', { skipped: 'missing_project_id' });
      return;
    }
    const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResult.data;
    if (!token) return;

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      console.log('PUSH_REGISTER', { skipped: 'no_session' });
      return;
    }

    // Upsert per token (unique): se lo stesso device cambia account, la riga
    // passa al nuovo user_id — mai due utenti con lo stesso token.
    const { error } = await supabase
      .from('push_tokens')
      .upsert({ user_id: userId, token, platform: Platform.OS }, { onConflict: 'token' });
    if (error) {
      console.log('PUSH_REGISTER', { ok: false });
      return;
    }
    currentToken = token;
    registered = true;
    console.log('PUSH_REGISTER', { ok: true, platform: Platform.OS });
  } catch (err) {
    console.log('PUSH_REGISTER', { ok: false, message: err instanceof Error ? err.message : 'unknown' });
  }
}

// Al logout/cambio account: la riga del token di QUESTO device viene rimossa
// (via RLS owner-scope, quindi PRIMA che la sessione venga chiusa) cosi'
// l'account successivo non riceve le notifiche del precedente. Best-effort:
// un fallimento non blocca mai il logout.
export async function unregisterCurrentPushToken(): Promise<void> {
  if (Platform.OS === 'web' || !supabaseConfig.isConfigured || !supabase) return;
  const token = currentToken;
  currentToken = null;
  registered = false;
  if (!token) return;
  try {
    await supabase.from('push_tokens').delete().eq('token', token);
    console.log('PUSH_UNREGISTER', { ok: true });
  } catch {
    console.log('PUSH_UNREGISTER', { ok: false });
  }
}

// Tap su una notifica (app in background o chiusa): apre la route corretta.
// data.type e data.clientId arrivano dalla Edge Function send-push.
export function attachNotificationResponseListener(): () => void {
  if (Platform.OS === 'web' || responseListenerAttached) return () => {};
  responseListenerAttached = true;

  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as
      | { type?: string; clientId?: string }
      | undefined;
    if (!data?.type) return;
    console.log('PUSH_TAP', { type: data.type });
    if (data.type === 'message') {
      // Il coach atterra direttamente sul thread giusto (param clientId,
      // vedi chat.tsx); per il cliente il thread e' comunque unico.
      router.push(data.clientId ? { pathname: '/chat', params: { clientId: data.clientId } } : '/chat');
      return;
    }
    if (data.type.startsWith('appointment')) {
      // Coach: agenda. Cliente: home (non esiste una schermata agenda
      // cliente dedicata; l'appuntamento e' comunque una notifica del coach).
      router.push('/appuntamenti');
    }
  });

  return () => {
    responseListenerAttached = false;
    subscription.remove();
  };
}

// ----- Client della Edge Function send-push -----------------------------
// Best-effort e MAI bloccanti: un errore di invio push non deve mai far
// fallire l'operazione principale (messaggio/appuntamento gia' salvati).

type PushEventType = 'message' | 'appointment_created' | 'appointment_updated' | 'appointment_cancelled';

async function invokeSendPush(payload: { type: PushEventType; clientId: string; preview?: string }): Promise<void> {
  if (!supabaseConfig.isConfigured || !supabase) return;
  try {
    const { error } = await supabase.functions.invoke('send-push', { body: payload });
    console.log('PUSH_SEND_REQUEST', { type: payload.type, ok: !error });
  } catch {
    console.log('PUSH_SEND_REQUEST', { type: payload.type, ok: false });
  }
}

export function notifyMessagePush(clientId: string, text: string): void {
  void invokeSendPush({ type: 'message', clientId, preview: text.slice(0, 120) });
}

export function notifyAppointmentPush(
  type: 'appointment_created' | 'appointment_updated' | 'appointment_cancelled',
  clientId: string,
  title: string,
): void {
  void invokeSendPush({ type, clientId, preview: title.slice(0, 120) });
}
