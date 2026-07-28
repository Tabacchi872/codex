// Test del webhook RevenueCat (fix PRODUCT_CHANGE, commit successivo a b8a8b725).
//
// LIMITE NOTO: import { ... } from './index.ts' esegue anche Deno.serve(...)
// al top level del modulo (side effect gia' presente prima di questo fix,
// non introdotto qui) — apre un listener HTTP che il sanitizer di risorse di
// Deno considererebbe "leaked" a fine test, per questo sanitizeOps/
// sanitizeResources sono disattivati sotto. Se la porta di default fosse gia'
// occupata nell'ambiente in cui questo file viene eseguito, l'IMPORT stesso
// (non un singolo test) fallirebbe: nessun modo di evitarlo senza separare
// Deno.serve in un file diverso, cosa che questo fix non fa deliberatamente
// (nessuna infrastruttura Deno disponibile in questo ambiente per verificarlo
// comunque — vedi ESITO del commit).
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  decidePackageResolution,
  isStaleEvent,
  isStaleEventApplicable,
  resolvePackageId,
  statusForEvent,
} from './index.ts';

const TEST_OPTS = { sanitizeOps: false, sanitizeResources: false };

// --- decidePackageResolution: il bug corretto in questo commit -------------

Deno.test({
  name: 'decidePackageResolution: INITIAL_PURCHASE (nessuna riga esistente) risolve dal prodotto',
  ...TEST_OPTS,
  fn: () => {
    const decision = decidePackageResolution({ productId: 'base_monthly', entitlementId: null, existingPackageId: null });
    assertEquals(decision, { kind: 'resolve', productId: 'base_monthly', entitlementId: null });
  },
});

Deno.test({
  name: 'decidePackageResolution: PRODUCT_CHANGE Base -> Pro NON riusa il vecchio package_id (bug corretto)',
  ...TEST_OPTS,
  fn: () => {
    const decision = decidePackageResolution({ productId: 'pro_monthly', entitlementId: null, existingPackageId: 'pkg-base' });
    assertEquals(decision.kind, 'resolve');
  },
});

Deno.test({
  name: 'decidePackageResolution: PRODUCT_CHANGE Pro -> Base risolve anch\'esso dal prodotto corrente',
  ...TEST_OPTS,
  fn: () => {
    const decision = decidePackageResolution({ productId: 'base_monthly', entitlementId: null, existingPackageId: 'pkg-pro' });
    assertEquals(decision.kind, 'resolve');
  },
});

Deno.test({
  name: 'decidePackageResolution: CANCELLATION senza product_id conserva il package_id esistente (mai revertito)',
  ...TEST_OPTS,
  fn: () => {
    const decision = decidePackageResolution({ productId: null, entitlementId: null, existingPackageId: 'pkg-pro' });
    assertEquals(decision, { kind: 'keep_existing', packageId: 'pkg-pro' });
  },
});

Deno.test({
  name: 'decidePackageResolution: nessun product_id e nessuna riga preesistente -> errore esplicito, mai null',
  ...TEST_OPTS,
  fn: () => {
    const decision = decidePackageResolution({ productId: null, entitlementId: null, existingPackageId: null });
    assertEquals(decision, { kind: 'error', code: 'package_not_resolvable' });
  },
});

Deno.test({
  name: 'decidePackageResolution: e\' deterministica/idempotente per lo stesso input (proxy del replay dello stesso evento)',
  ...TEST_OPTS,
  fn: () => {
    const input = { productId: 'pro_monthly', entitlementId: null, existingPackageId: 'pkg-base' };
    assertEquals(decidePackageResolution(input), decidePackageResolution(input));
  },
});

// --- resolvePackageId: mappatura product/entitlement -> package_id ---------
//
// Nessun .eq('target_role', ...) nella query reale (rimosso: android_product_id/
// ios_product_id/revenuecat_entitlement_id non sono scoped per ruolo, vedi
// index.ts) — il fake sotto rispecchia esattamente questa forma: select()
// espone direttamente or()/eq() senza un eq('target_role', ...) intermedio.

function fakeSupabaseForPackageLookup(opts: {
  byProductId?: Record<string, Array<{ id: string }>>;
  byEntitlementId?: Record<string, Array<{ id: string }>>;
}) {
  return {
    from(table: string) {
      if (table !== 'subscription_packages') throw new Error(`tabella inattesa nel test: ${table}`);
      return {
        select(_columns: string) {
          return {
            or(orExpression: string) {
              const match = /\.eq\.([^,]+)/.exec(orExpression);
              const productId = match ? match[1] : '';
              return Promise.resolve({ data: opts.byProductId?.[productId] ?? [], error: null });
            },
            eq(entitlementColumn: string, entitlementValue: string) {
              if (entitlementColumn !== 'revenuecat_entitlement_id') throw new Error(`eq inatteso nel test: ${entitlementColumn}`);
              return Promise.resolve({ data: opts.byEntitlementId?.[entitlementValue] ?? [], error: null });
            },
          };
        },
      };
    },
    // deno-lint-ignore no-explicit-any
  } as any;
}

Deno.test({
  name: 'resolvePackageId: prodotto noto risolve il package_id corretto',
  ...TEST_OPTS,
  fn: async () => {
    const client = fakeSupabaseForPackageLookup({ byProductId: { pro_monthly: [{ id: 'pkg-pro' }] } });
    const result = await resolvePackageId(client, 'pro_monthly', null);
    assertEquals(result, { ok: true, packageId: 'pkg-pro' });
  },
});

Deno.test({
  name: 'resolvePackageId: prodotto sconosciuto -> errore esplicito, mai un fallback silenzioso',
  ...TEST_OPTS,
  fn: async () => {
    const client = fakeSupabaseForPackageLookup({ byProductId: { pro_monthly: [{ id: 'pkg-pro' }] } });
    const result = await resolvePackageId(client, 'unknown_product_xyz', null);
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.code, 'package_not_found');
  },
});

Deno.test({
  name: 'resolvePackageId: product_id duplicato su piu\' pacchetti -> ambiguous_product_id, non il primo a caso',
  ...TEST_OPTS,
  fn: async () => {
    const client = fakeSupabaseForPackageLookup({ byProductId: { dup_product: [{ id: 'pkg-a' }, { id: 'pkg-b' }] } });
    const result = await resolvePackageId(client, 'dup_product', null);
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.code, 'ambiguous_product_id');
  },
});

Deno.test({
  name: 'resolvePackageId: nessun product_id, risolve tramite entitlement_id',
  ...TEST_OPTS,
  fn: async () => {
    const client = fakeSupabaseForPackageLookup({ byEntitlementId: { pro_entitlement: [{ id: 'pkg-pro' }] } });
    const result = await resolvePackageId(client, null, 'pro_entitlement');
    assertEquals(result, { ok: true, packageId: 'pkg-pro' });
  },
});

// --- Client Pro (target_role='client'): stesso resolver, nessun filtro di
// ruolo. Le 3 durate (monthly/quarterly/annual) hanno product id distinti ma
// condividono lo stesso revenuecat_entitlement_id ('client_pro') -----------

Deno.test({
  name: 'resolvePackageId: prodotto client (monthly/quarterly/annual) risolve come un prodotto coach, nessun filtro target_role',
  ...TEST_OPTS,
  fn: async () => {
    const client = fakeSupabaseForPackageLookup({
      byProductId: {
        'client_pro:monthly': [{ id: 'pkg-client-monthly' }],
        'client_pro:quarterly': [{ id: 'pkg-client-quarterly' }],
        'com.fitcoachapp.mobile.client.annual': [{ id: 'pkg-client-annual' }],
      },
    });
    assertEquals(await resolvePackageId(client, 'client_pro:monthly', null), { ok: true, packageId: 'pkg-client-monthly' });
    assertEquals(await resolvePackageId(client, 'client_pro:quarterly', null), { ok: true, packageId: 'pkg-client-quarterly' });
    assertEquals(await resolvePackageId(client, 'com.fitcoachapp.mobile.client.annual', null), {
      ok: true,
      packageId: 'pkg-client-annual',
    });
  },
});

Deno.test({
  name: 'resolvePackageId: un product id coach e uno client non si confondono mai (namespace distinti nel fake, come nel DB reale)',
  ...TEST_OPTS,
  fn: async () => {
    const client = fakeSupabaseForPackageLookup({
      byProductId: {
        pro_monthly: [{ id: 'pkg-coach' }],
        'client_pro:monthly': [{ id: 'pkg-client' }],
      },
    });
    assertEquals(await resolvePackageId(client, 'pro_monthly', null), { ok: true, packageId: 'pkg-coach' });
    assertEquals(await resolvePackageId(client, 'client_pro:monthly', null), { ok: true, packageId: 'pkg-client' });
  },
});

Deno.test({
  name: 'resolvePackageId: entitlement client_pro condiviso da 3 pacchetti (le 3 durate) -> ambiguous_entitlement_id come fallback, mai una scelta a caso',
  ...TEST_OPTS,
  fn: async () => {
    const client = fakeSupabaseForPackageLookup({
      byEntitlementId: {
        client_pro: [{ id: 'pkg-client-monthly' }, { id: 'pkg-client-quarterly' }, { id: 'pkg-client-annual' }],
      },
    });
    const result = await resolvePackageId(client, null, 'client_pro');
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.code, 'ambiguous_entitlement_id');
  },
});

// --- isStaleEventApplicable: la correzione al finding dell'advisor ---------
// (isStaleEvent applicato a CANCELLATION/EXPIRATION avrebbe potuto scartare
// una disdetta reale come "evento obsoleto" solo perche' purchased_at_ms
// riflette l'acquisto originale, non la data della cancellazione).

Deno.test({
  name: 'isStaleEventApplicable: true per i tipi dove purchased_at_ms rappresenta la transazione corrente',
  ...TEST_OPTS,
  fn: () => {
    for (const type of ['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE', 'SUBSCRIPTION_EXTENDED']) {
      assertEquals(isStaleEventApplicable(type), true, `atteso true per ${type}`);
    }
  },
});

Deno.test({
  name: 'isStaleEventApplicable: false per CANCELLATION/EXPIRATION/BILLING_ISSUE/REFUND_REVERSED/REFUND (mai scartati come obsoleti)',
  ...TEST_OPTS,
  fn: () => {
    for (const type of ['CANCELLATION', 'EXPIRATION', 'BILLING_ISSUE', 'REFUND_REVERSED', 'REFUND']) {
      assertEquals(isStaleEventApplicable(type), false, `atteso false per ${type}`);
    }
  },
});

// --- isStaleEvent: protezione contro eventi fuori ordine --------------------

Deno.test({
  name: 'isStaleEvent: evento con purchased_at_ms precedente a starts_at gia\' salvato -> stale',
  ...TEST_OPTS,
  fn: () => {
    const result = isStaleEvent('2026-01-01T00:00:00.000Z', { starts_at: '2026-02-01T00:00:00.000Z' });
    assertEquals(result, true);
  },
});

Deno.test({
  name: 'isStaleEvent: evento piu\' recente dello starts_at salvato -> non stale',
  ...TEST_OPTS,
  fn: () => {
    const result = isStaleEvent('2026-03-01T00:00:00.000Z', { starts_at: '2026-02-01T00:00:00.000Z' });
    assertEquals(result, false);
  },
});

Deno.test({
  name: 'isStaleEvent: nessuna riga preesistente -> mai stale (es. INITIAL_PURCHASE)',
  ...TEST_OPTS,
  fn: () => {
    assertEquals(isStaleEvent('2026-01-01T00:00:00.000Z', null), false);
  },
});

Deno.test({
  name: 'isStaleEvent: riga preesistente senza starts_at salvato -> mai stale (nessun falso positivo)',
  ...TEST_OPTS,
  fn: () => {
    assertEquals(isStaleEvent('2026-01-01T00:00:00.000Z', { starts_at: null }), false);
  },
});

// --- statusForEvent: nessuna regressione per rinnovo/scadenza ---------------

Deno.test({
  name: 'statusForEvent: RENEWAL con scadenza futura resta active',
  ...TEST_OPTS,
  fn: () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    assertEquals(statusForEvent('RENEWAL', {}, future), 'active');
  },
});

Deno.test({
  name: 'statusForEvent: RENEWAL con scadenza passata diventa expired',
  ...TEST_OPTS,
  fn: () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    assertEquals(statusForEvent('RENEWAL', {}, past), 'expired');
  },
});

Deno.test({
  name: 'statusForEvent: EXPIRATION e\' sempre expired, indipendentemente dalla data',
  ...TEST_OPTS,
  fn: () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    assertEquals(statusForEvent('EXPIRATION', {}, future), 'expired');
    assertEquals(statusForEvent('EXPIRATION', {}, null), 'expired');
  },
});

Deno.test({
  name: 'statusForEvent: CANCELLATION resta active fino alla scadenza, poi canceled',
  ...TEST_OPTS,
  fn: () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();
    assertEquals(statusForEvent('CANCELLATION', {}, future), 'active');
    assertEquals(statusForEvent('CANCELLATION', {}, past), 'canceled');
  },
});

// --- statusForEvent: BUG-061, REFUND revoca sempre, subito -----------------

Deno.test({
  name: 'statusForEvent: REFUND e\' sempre refunded anche con scadenza futura (revoca immediata, mai "valido fino alla scadenza")',
  ...TEST_OPTS,
  fn: () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    assertEquals(statusForEvent('REFUND', {}, future), 'refunded');
  },
});

Deno.test({
  name: 'statusForEvent: REFUND e\' sempre refunded anche senza alcuna data di scadenza nel payload',
  ...TEST_OPTS,
  fn: () => {
    assertEquals(statusForEvent('REFUND', {}, null), 'refunded');
  },
});

Deno.test({
  name: 'statusForEvent: REFUND e\' sempre refunded anche con scadenza gia\' passata',
  ...TEST_OPTS,
  fn: () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    assertEquals(statusForEvent('REFUND', {}, past), 'refunded');
  },
});
