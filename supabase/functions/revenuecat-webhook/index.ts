import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-revenuecat-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ResultBody = { ok: true; data: unknown } | { ok: false; code: string; message: string };

type RevenueCatEvent = {
  id?: unknown;
  type?: unknown;
  app_user_id?: unknown;
  original_app_user_id?: unknown;
  aliases?: unknown;
  product_id?: unknown;
  product_identifier?: unknown;
  entitlement_id?: unknown;
  entitlement_ids?: unknown;
  transaction_id?: unknown;
  original_transaction_id?: unknown;
  store_transaction_id?: unknown;
  purchased_at_ms?: unknown;
  expiration_at_ms?: unknown;
  cancel_reason?: unknown;
  transferred_from?: unknown;
  transferred_to?: unknown;
};

const VALID_TYPES = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'CANCELLATION',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'SUBSCRIPTION_PAUSED',
  'EXPIRATION',
  'BILLING_ISSUE',
  'PRODUCT_CHANGE',
  'SUBSCRIPTION_EXTENDED',
  'REFUND',
  'REFUND_REVERSED',
  'TRANSFER',
  'TEMPORARY_ENTITLEMENT_GRANT',
  'TEST',
]);

function json(body: ResultBody, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function pickString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function pickUuid(value: unknown): string | null {
  const text = pickString(value);
  if (!text) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function pickMsDate(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value).toISOString();
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function firstString(value: unknown): string | null {
  return stringArray(value)[0] ?? pickString(value);
}

function extractEvent(payload: unknown): RevenueCatEvent | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  const event = root.event ?? root;
  return event && typeof event === 'object' ? (event as RevenueCatEvent) : null;
}

function candidateUserIds(event: RevenueCatEvent): string[] {
  const ordered = [
    pickUuid(event.app_user_id),
    pickUuid(event.original_app_user_id),
    ...stringArray(event.aliases).map(pickUuid),
  ].filter((item): item is string => Boolean(item));
  return [...new Set(ordered)];
}

function extractProductId(event: RevenueCatEvent): string | null {
  return pickString(event.product_id) ?? pickString(event.product_identifier);
}

function extractEntitlementId(event: RevenueCatEvent): string | null {
  return pickString(event.entitlement_id) ?? firstString(event.entitlement_ids);
}

function extractExternalSubscriptionId(event: RevenueCatEvent, eventId: string): string | null {
  return pickString(event.original_transaction_id) ?? pickString(event.transaction_id) ?? pickString(event.store_transaction_id) ??
    (event.type === 'TEMPORARY_ENTITLEMENT_GRANT' ? `temporary:${eventId}` : null);
}

function extractTransferIds(event: RevenueCatEvent) {
  return {
    transferredFrom: stringArray(event.transferred_from),
    transferredTo: stringArray(event.transferred_to),
  };
}

function isFutureOrOpenEnded(expiresAt: string | null) {
  return !expiresAt || new Date(expiresAt).getTime() > Date.now();
}

// Solo i tipi di evento per cui purchased_at_ms rappresenta in modo
// affidabile "quando e' avvenuta QUESTA transazione" (quindi puo' solo
// avanzare nel tempo, mai tornare indietro tra un evento e il successivo).
// CANCELLATION/EXPIRATION/BILLING_ISSUE/REFUND_REVERSED sono deliberatamente
// esclusi: per questi tipi non c'e' certezza che purchased_at_ms rifletta la
// data dell'evento stesso invece della data d'acquisto originale — se cosi'
// fosse, una CANCELLATION reale su un abbonamento gia' rinnovato piu' volte
// verrebbe scartata come "obsoleta" solo perche' il suo purchased_at_ms
// (il vecchio acquisto originale) precede lo starts_at gia' avanzato dai
// rinnovi, lasciando l'utente con un accesso che ha davvero disdetto. Stessa
// suddivisione gia' usata dal primo case di statusForEvent qui sotto.
//
// FIX BUG-061: REFUND esclusa per LO STESSO identico motivo, con una posta
// in gioco piu' seria se si sbagliasse in questa direzione — includerla nel
// controllo di staleness rischierebbe di scartare come "obsoleto" un
// rimborso REALE arrivato dopo uno o piu' rinnovi (esattamente lo scenario
// "rimborso dopo rinnovo" richiesto esplicitamente), lasciando un cliente
// rimborsato con l'accesso ancora attivo. Meglio applicare SEMPRE un
// rimborso non appena arriva (stessa scelta gia' presa per CANCELLATION):
// revocare un accesso gia' pagato-e-restituito e' sempre corretto,
// indipendentemente da quando la transazione originale risale.
const STALE_CHECK_EVENT_TYPES = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'SUBSCRIPTION_EXTENDED',
]);

// Best-effort, non un ordinamento generale garantito: RevenueCat non espone
// oggi (in questo codice) alcun campo di sequenza/ordinamento affidabile per
// OGNI tipo di evento — vedi STALE_CHECK_EVENT_TYPES sopra per il perche' la
// protezione e' applicata solo dove purchased_at_ms e' un segnale sicuro.
// Due eventi con lo stesso purchased_at_ms restano indistinguibili.
export function isStaleEventApplicable(type: string): boolean {
  return STALE_CHECK_EVENT_TYPES.has(type);
}

// Vedi il commento al punto di chiamata (Deno.serve) per il ragionamento
// completo: confronta solo contro starts_at gia' salvato, mai contro l'ora
// corrente, e non fa nulla se manca uno dei due timestamp (nessun falso
// positivo su un evento senza purchased_at_ms o su una riga mai aggiornata).
export function isStaleEvent(incomingStartsAt: string, existing: { starts_at: string | null } | null): boolean {
  if (!existing?.starts_at) return false;
  return new Date(incomingStartsAt).getTime() < new Date(existing.starts_at).getTime();
}

export function statusForEvent(type: string, event: RevenueCatEvent, expiresAt: string | null) {
  const validNow = isFutureOrOpenEnded(expiresAt);
  switch (type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
    case 'NON_RENEWING_PURCHASE':
    case 'SUBSCRIPTION_EXTENDED':
      return validNow ? 'active' : 'expired';
    case 'CANCELLATION':
      return validNow ? 'active' : 'canceled';
    case 'SUBSCRIPTION_PAUSED':
      return validNow ? 'active' : 'expired';
    case 'EXPIRATION':
      return 'expired';
    case 'BILLING_ISSUE':
      return validNow ? 'active' : 'pending';
    // FIX BUG-061: un rimborso revoca l'accesso SUBITO, indipendentemente da
    // expiresAt/validNow — a differenza di CANCELLATION (che rispetta
    // l'accesso fino alla scadenza gia' pagata, perche' l'utente ha davvero
    // pagato quel periodo), qui il denaro e' stato restituito: non c'e'
    // alcun periodo "gia' pagato" da onorare.
    case 'REFUND':
      return 'refunded';
    case 'REFUND_REVERSED':
      return expiresAt && validNow ? 'active' : 'expired';
    case 'TEMPORARY_ENTITLEMENT_GRANT':
      return expiresAt && validNow ? 'active' : 'expired';
    default:
      return validNow ? 'active' : 'expired';
  }
}

async function timingSafeEqual(a: string, b: string) {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  const max = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < max; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

function providedSecret(req: Request) {
  const auth = req.headers.get('Authorization') ?? '';
  const bearer = auth.replace(/^Bearer\s+/i, '').trim();
  return bearer || req.headers.get('x-revenuecat-webhook-secret')?.trim() || '';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, code: 'method_not_allowed', message: 'Metodo non consentito.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const webhookSecret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET')?.trim();
    if (!supabaseUrl || !serviceRoleKey || !webhookSecret) {
      return json({ ok: false, code: 'server_misconfigured', message: 'Configurazione server mancante.' }, 500);
    }
    if (!(await timingSafeEqual(providedSecret(req), webhookSecret))) {
      return json({ ok: false, code: 'forbidden', message: 'Webhook non autorizzato.' }, 401);
    }

    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return json({ ok: false, code: 'invalid_body', message: 'Payload JSON non valido.' }, 400);
    }

    const event = extractEvent(payload);
    const type = pickString(event?.type);
    const eventId = pickString(event?.id) ?? (type === 'TEST' ? `test:${crypto.randomUUID()}` : null);
    if (!event || !eventId || !type || !VALID_TYPES.has(type)) {
      return json({ ok: false, code: 'invalid_event', message: 'Evento RevenueCat mancante o non supportato.' }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const productId = extractProductId(event);
    const entitlementId = extractEntitlementId(event);
    const externalSubscriptionId = extractExternalSubscriptionId(event, eventId);

    const { data: existingLedger } = await supabaseAdmin
      .from('revenuecat_webhook_events')
      .select('processed')
      .eq('event_id', eventId)
      .maybeSingle();
    if (existingLedger?.processed === true) {
      return json({ ok: true, data: { duplicate: true, eventId } }, 200);
    }

    if (!existingLedger) {
      const { error: ledgerInsertError } = await supabaseAdmin.from('revenuecat_webhook_events').insert({
        event_id: eventId,
        event_type: type,
        app_user_id: null,
        product_id: productId,
        entitlement_id: entitlementId,
        payload,
      });
      if (ledgerInsertError?.code === '23505') {
        return json({ ok: true, data: { duplicateInFlight: true, eventId } }, 200);
      }
      if (ledgerInsertError) {
        return json({ ok: false, code: 'event_ledger_failed', message: 'Impossibile registrare evento webhook.' }, 500);
      }
    }

    async function markEvent(processed: boolean, error: string | null) {
      await supabaseAdmin
        .from('revenuecat_webhook_events')
        .update({ processed, processing_error: error, processed_at: processed ? new Date().toISOString() : null })
        .eq('event_id', eventId);
    }

    if (type === 'TEST') {
      await markEvent(true, null);
      return json({ ok: true, data: { processed: true, eventId, recordOnly: true, type } }, 200);
    }

    if (type === 'TRANSFER') {
      const transfer = extractTransferIds(event);
      await markEvent(true, null);
      return json({ ok: true, data: { processed: true, eventId, recordOnly: true, type, ...transfer } }, 200);
    }

    const identity = await resolveSupabaseUserId(supabaseAdmin, event);
    if (!identity.ok) {
      await markEvent(false, identity.message);
      return json({ ok: true, data: { processed: false, reason: identity.code } }, 200);
    }
    const appUserId = identity.userId;
    await supabaseAdmin.from('revenuecat_webhook_events').update({ app_user_id: appUserId }).eq('event_id', eventId);

    const startsAt = pickMsDate(event.purchased_at_ms) ?? new Date().toISOString();
    const expiresAt = pickMsDate(event.expiration_at_ms);
    if (type === 'TEMPORARY_ENTITLEMENT_GRANT' && (!expiresAt || !productId)) {
      await markEvent(true, null);
      return json({ ok: true, data: { processed: true, eventId, recordOnly: true, type, reason: 'temporary_grant_without_product_or_expiry' } }, 200);
    }
    const status = statusForEvent(type, event, expiresAt);

    let existingSubscription: { id: string; package_id: string; starts_at: string | null } | null = null;
    if (externalSubscriptionId) {
      const { data, error } = await supabaseAdmin
        .from('user_subscriptions')
        .select('id,package_id,starts_at')
        .eq('payment_provider', 'revenuecat')
        .eq('external_subscription_id', externalSubscriptionId)
        .maybeSingle();
      if (error) {
        await markEvent(false, error.message);
        return json({ ok: false, code: 'subscription_lookup_failed', message: 'Lookup abbonamento non riuscito.' }, 500);
      }
      existingSubscription = (data as { id: string; package_id: string; starts_at: string | null } | null) ?? null;
    }

    // Protezione contro eventi fuori ordine: RevenueCat non garantisce
    // l'ordine di consegna dei webhook. Applicata SOLO ai tipi elencati in
    // STALE_CHECK_EVENT_TYPES (vedi commento li' sopra per il perche' gli
    // altri tipi sono esclusi). Se esiste gia' una riga per questo
    // external_subscription_id e il nuovo evento riporta un purchased_at_ms
    // precedente allo starts_at gia' salvato, e' la consegna tardiva di un
    // evento piu' vecchio (es. una RENEWAL rimasta in coda arrivata dopo un
    // PRODUCT_CHANGE piu' recente gia' applicato): non deve mai poter
    // riportare indietro package_id/stato/date. purchased_at_ms e' l'unico
    // timestamp gia' presente nel payload di questo progetto (nessuna nuova
    // colonna; nessun event_timestamp_ms mai stato analizzato/gestito qui:
    // se RevenueCat lo invia non e' oggi tra i campi letti da extractEvent/
    // RevenueCatEvent, quindi non e' "gia' presente" secondo questo codice).
    // Resta un segnale best-effort, non un ordinamento generale garantito:
    // due eventi con lo stesso purchased_at_ms restano indistinguibili.
    if (isStaleEventApplicable(type) && isStaleEvent(startsAt, existingSubscription)) {
      await markEvent(true, null);
      return json({ ok: true, data: { processed: true, eventId, recordOnly: true, type, reason: 'stale_event_ignored' } }, 200);
    }

    const decision = decidePackageResolution({
      productId,
      entitlementId,
      existingPackageId: existingSubscription?.package_id ?? null,
    });

    let packageId: string;
    if (decision.kind === 'error') {
      // Nessun prodotto nell'evento E nessuna riga preesistente da cui
      // ereditare package_id: non c'e' alcun modo sicuro di sapere quale
      // pacchetto associare. Stesso modello di errore/retryable usato sotto,
      // mai un falso successo.
      const diagnosticMessage = `Nessun product_id/entitlement_id nell'evento e nessuna sottoscrizione preesistente da cui ereditare il pacchetto (eventId=${eventId}, eventType=${type}).`;
      await markEvent(false, diagnosticMessage);
      return json({ ok: true, data: { processed: false, reason: decision.code, eventId, type } }, 200);
    } else if (decision.kind === 'keep_existing') {
      // Nessun product_id/entitlement_id in questo evento (es. alcuni
      // CANCELLATION/EXPIRATION che non lo comunicano): conserva il pacchetto
      // gia' collegato a questa sottoscrizione, mai null, mai una nuova
      // associazione inventata.
      packageId = decision.packageId;
    } else {
      // Un product_id/entitlement_id presente nell'evento e' sempre la fonte
      // autorevole per package_id, anche quando esiste gia' una riga: e'
      // esattamente questo il caso di PRODUCT_CHANGE (Base -> Pro o
      // viceversa), dove external_subscription_id/original_transaction_id
      // restano invariati ma il prodotto acquistato cambia. Non riusare mai
      // silenziosamente existingSubscription.package_id quando l'evento
      // comunica un prodotto: se il pacchetto risolto e' diverso da quello
      // gia' salvato, subscriptionPayload sotto lo aggiorna nella stessa UPDATE.
      const packageLookup = await resolvePackageId(supabaseAdmin, decision.productId, decision.entitlementId);
      if (!packageLookup.ok) {
        // Prodotto/entitlement presenti ma non mappati su alcun
        // subscription_packages: mai un falso successo ne' un fallback
        // silenzioso al vecchio package_id (lascerebbe il DB a indicare un
        // pacchetto che l'utente non ha piu'). Nessun dato sensibile nel
        // messaggio diagnostico: solo eventId/eventType/productId, mai il
        // payload completo (che puo' contenere identificativi di
        // transazione/store) ne' i secret dell'ambiente.
        const diagnosticMessage = `${packageLookup.message} (eventId=${eventId}, eventType=${type}, productId=${productId ?? 'null'})`;
        await markEvent(false, diagnosticMessage);
        return json({ ok: true, data: { processed: false, reason: packageLookup.code, eventId, type } }, 200);
      }
      packageId = packageLookup.packageId;
    }

    const subscriptionPayload = {
      user_id: appUserId,
      package_id: packageId,
      status,
      starts_at: startsAt,
      expires_at: expiresAt,
      payment_provider: 'revenuecat',
      external_subscription_id: externalSubscriptionId,
      updated_at: new Date().toISOString(),
    };

    if (existingSubscription) {
      const { error } = await supabaseAdmin
        .from('user_subscriptions')
        .update(subscriptionPayload)
        .eq('id', existingSubscription.id)
        .eq('payment_provider', 'revenuecat');
      if (error) {
        await markEvent(false, error.message);
        return json({ ok: false, code: 'subscription_update_failed', message: 'Aggiornamento abbonamento non riuscito.' }, 500);
      }
    } else {
      const { error } = await supabaseAdmin.from('user_subscriptions').insert(subscriptionPayload);
      if (error) {
        await markEvent(false, error.message);
        return json({ ok: false, code: 'subscription_insert_failed', message: 'Creazione abbonamento non riuscita.' }, 500);
      }
    }

    await markEvent(true, null);
    return json({ ok: true, data: { processed: true, eventId, status } }, 200);
  } catch (err) {
    console.error('REVENUECAT_WEBHOOK_ERROR', { message: err instanceof Error ? err.message : String(err) });
    return json({ ok: false, code: 'internal_error', message: 'Errore interno.' }, 500);
  }
});

export type PackageResolutionDecision =
  | { kind: 'resolve'; productId: string | null; entitlementId: string | null }
  | { kind: 'keep_existing'; packageId: string }
  | { kind: 'error'; code: 'package_not_resolvable' };

// Decisione pura (nessuna chiamata DB): dato cosa comunica l'evento e cosa
// esiste gia' per questo external_subscription_id, stabilisce SE risolvere
// un package_id fresco dal prodotto corrente (mai piu' un riuso silenzioso
// del vecchio quando l'evento comunica un prodotto — questo e' il bug
// PRODUCT_CHANGE corretto qui), conservare quello esistente (nessun
// prodotto nell'evento ma una riga gia' collegata), o segnalare che non
// c'e' alcun modo sicuro di risolvere un pacchetto.
export function decidePackageResolution(input: {
  productId: string | null;
  entitlementId: string | null;
  existingPackageId: string | null;
}): PackageResolutionDecision {
  if (input.productId || input.entitlementId) {
    return { kind: 'resolve', productId: input.productId, entitlementId: input.entitlementId };
  }
  if (input.existingPackageId) {
    return { kind: 'keep_existing', packageId: input.existingPackageId };
  }
  return { kind: 'error', code: 'package_not_resolvable' };
}

export async function resolvePackageId(
  supabaseAdmin: ReturnType<typeof createClient>,
  productId: string | null,
  entitlementId: string | null,
): Promise<{ ok: true; packageId: string } | { ok: false; code: string; message: string }> {
  // Nessun filtro su target_role qui: android_product_id/ios_product_id sono
  // vincolati da unique index parziali GLOBALI (non scoped per ruolo, vedi
  // docs/SUPABASE_SCHEMA.sql), quindi un product id risolve sempre al piu' un
  // pacchetto, coach o client indifferentemente. Restringere a un solo ruolo
  // impedirebbe di risolvere gli eventi RevenueCat dei pacchetti cliente
  // (Client Pro, target_role='client').
  if (productId) {
    const { data, error } = await supabaseAdmin
      .from('subscription_packages')
      .select('id')
      .or(`android_product_id.eq.${productId},ios_product_id.eq.${productId}`);
    if (error) return { ok: false, code: 'package_lookup_failed', message: error.message };
    if ((data ?? []).length === 1) return { ok: true, packageId: (data as Array<{ id: string }>)[0].id };
    if ((data ?? []).length > 1) {
      return { ok: false, code: 'ambiguous_product_id', message: `Product id non univoco: ${productId}` };
    }
  }

  if (entitlementId) {
    const { data, error } = await supabaseAdmin
      .from('subscription_packages')
      .select('id')
      .eq('revenuecat_entitlement_id', entitlementId);
    if (error) return { ok: false, code: 'package_lookup_failed', message: error.message };
    if ((data ?? []).length === 1) return { ok: true, packageId: (data as Array<{ id: string }>)[0].id };
    if ((data ?? []).length > 1) {
      // Un entitlement condiviso da piu' pacchetti (es. le 3 durate Client
      // Pro condividono client_pro) e' ambiguo SOLO come fallback: il
      // percorso primario e' sempre productId (una durata = un product id
      // univoco). Nessun pacchetto scelto a caso.
      return { ok: false, code: 'ambiguous_entitlement_id', message: `Entitlement id non univoco: ${entitlementId}` };
    }
  }

  return { ok: false, code: 'package_not_found', message: 'Nessun pacchetto collegato al product id/entitlement RevenueCat.' };
}

async function resolveSupabaseUserId(
  supabaseAdmin: ReturnType<typeof createClient>,
  event: RevenueCatEvent,
): Promise<{ ok: true; userId: string } | { ok: false; code: string; message: string }> {
  const candidates = candidateUserIds(event);
  if (candidates.length === 0) {
    return {
      ok: false,
      code: 'missing_valid_identity',
      message: 'Nessun UUID valido in app_user_id/original_app_user_id/aliases.',
    };
  }
  const { data, error } = await supabaseAdmin.from('profiles').select('id').in('id', candidates);
  if (error) return { ok: false, code: 'identity_lookup_failed', message: error.message };
  const matched = [...new Set((data ?? []).map((row: { id: string }) => row.id))];
  if (matched.length === 0) {
    return {
      ok: false,
      code: 'identity_not_found',
      message: `Nessun profilo Supabase trovato per gli UUID RevenueCat: ${candidates.join(', ')}`,
    };
  }
  if (matched.length > 1) {
    return {
      ok: false,
      code: 'ambiguous_identity',
      message: `Identita RevenueCat ambigua: piu' UUID corrispondono a profili Supabase (${matched.join(', ')})`,
    };
  }
  return { ok: true, userId: matched[0] };
}
