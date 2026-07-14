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

function statusForEvent(type: string, event: RevenueCatEvent, expiresAt: string | null) {
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

    if (type === 'PRODUCT_CHANGE') {
      await markEvent(true, null);
      return json({ ok: true, data: { processed: true, eventId, recordOnly: true, type, reason: 'deferred_product_change' } }, 200);
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

    let existingSubscription: { id: string; package_id: string } | null = null;
    if (externalSubscriptionId) {
      const { data, error } = await supabaseAdmin
        .from('user_subscriptions')
        .select('id,package_id')
        .eq('payment_provider', 'revenuecat')
        .eq('external_subscription_id', externalSubscriptionId)
        .maybeSingle();
      if (error) {
        await markEvent(false, error.message);
        return json({ ok: false, code: 'subscription_lookup_failed', message: 'Lookup abbonamento non riuscito.' }, 500);
      }
      existingSubscription = (data as { id: string; package_id: string } | null) ?? null;
    }

    let packageId = existingSubscription?.package_id ?? null;
    if (!packageId) {
      const packageLookup = await resolvePackageId(supabaseAdmin, productId, entitlementId);
      if (!packageLookup.ok) {
        await markEvent(false, packageLookup.message);
        return json({ ok: true, data: { processed: false, reason: packageLookup.code } }, 200);
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

async function resolvePackageId(
  supabaseAdmin: ReturnType<typeof createClient>,
  productId: string | null,
  entitlementId: string | null,
): Promise<{ ok: true; packageId: string } | { ok: false; code: string; message: string }> {
  if (productId) {
    const { data, error } = await supabaseAdmin
      .from('subscription_packages')
      .select('id')
      .eq('target_role', 'coach')
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
      .eq('target_role', 'coach')
      .eq('revenuecat_entitlement_id', entitlementId);
    if (error) return { ok: false, code: 'package_lookup_failed', message: error.message };
    if ((data ?? []).length === 1) return { ok: true, packageId: (data as Array<{ id: string }>)[0].id };
    if ((data ?? []).length > 1) {
      return { ok: false, code: 'ambiguous_entitlement_id', message: `Entitlement id non univoco: ${entitlementId}` };
    }
  }

  return { ok: false, code: 'package_not_found', message: 'Nessun pacchetto coach collegato al product id RevenueCat.' };
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
