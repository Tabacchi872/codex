import type { SuperadminPaymentRow } from './superadmin-platform-service';

export type PaymentBadgeTone = 'moss' | 'amber' | 'rust' | 'neutral';

export type RevenueCatEventPresentation = {
  label: string;
  tone: PaymentBadgeTone;
  economic: boolean;
  positiveRevenue: boolean;
};

const EVENT_PRESENTATION: Record<string, RevenueCatEventPresentation> = {
  INITIAL_PURCHASE: { label: 'ACQUISTO', tone: 'moss', economic: true, positiveRevenue: true },
  RENEWAL: { label: 'RINNOVO', tone: 'moss', economic: true, positiveRevenue: true },
  NON_RENEWING_PURCHASE: { label: 'ACQUISTO', tone: 'moss', economic: true, positiveRevenue: true },
  PRODUCT_CHANGE: { label: 'CAMBIO PRODOTTO', tone: 'amber', economic: true, positiveRevenue: true },
  SUBSCRIPTION_EXTENDED: { label: 'ESTENSIONE', tone: 'neutral', economic: false, positiveRevenue: false },
  CANCELLATION: { label: 'CANCELLATO', tone: 'amber', economic: false, positiveRevenue: false },
  UNCANCELLATION: { label: 'RIATTIVATO', tone: 'moss', economic: false, positiveRevenue: false },
  EXPIRATION: { label: 'SCADUTO', tone: 'rust', economic: false, positiveRevenue: false },
  BILLING_ISSUE: { label: 'PROBLEMA PAGAMENTO', tone: 'amber', economic: false, positiveRevenue: false },
  REFUND: { label: 'RIMBORSATO', tone: 'rust', economic: true, positiveRevenue: false },
  REFUND_REVERSED: { label: 'RIMBORSO STORNATO', tone: 'amber', economic: true, positiveRevenue: true },
  TRANSFER: { label: 'TRASFERIMENTO', tone: 'neutral', economic: false, positiveRevenue: false },
  TEMPORARY_ENTITLEMENT_GRANT: { label: 'GRANT TEMPORANEO', tone: 'neutral', economic: false, positiveRevenue: false },
  TEST: { label: 'TEST / SANDBOX', tone: 'amber', economic: false, positiveRevenue: false },
};

export function revenueCatEventPresentation(eventType: string | null | undefined): RevenueCatEventPresentation {
  const key = normalizeEventType(eventType);
  return EVENT_PRESENTATION[key] ?? { label: 'EVENTO NON RICONOSCIUTO', tone: 'neutral', economic: false, positiveRevenue: false };
}

export function normalizeEventType(eventType: string | null | undefined) {
  return String(eventType ?? '').trim().toUpperCase();
}

export function isSandboxEnvironment(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'sandbox' || normalized === 'test';
}

export function formatPaymentDate(value: unknown, fallback = 'Data non disponibile') {
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function validAmount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatPaymentAmount(amount: unknown, currency: unknown, unavailableReason?: string | null) {
  const numeric = validAmount(amount);
  const code = typeof currency === 'string' && currency.trim() ? currency.trim().toUpperCase() : null;
  if (numeric == null) return unavailableReason || 'Importo non disponibile';
  if (!code) return 'Valuta non disponibile';
  try {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: code }).format(numeric);
  } catch {
    return `${code} ${numeric.toFixed(2)}`;
  }
}

export function paymentIdentity(row: SuperadminPaymentRow) {
  const transactionId = nonEmpty(row.transactionId);
  if (transactionId) return `tx:${transactionId}`;

  const original = nonEmpty(row.originalTransactionId);
  const eventType = normalizeEventType(row.eventType ?? row.eventStatus ?? row.status);
  const date = nonEmpty(row.purchasedAt) ?? nonEmpty(row.date) ?? nonEmpty(row.receivedAt);
  if (original && eventType && date) return `orig:${original}:${eventType}:${date}`;

  return `event:${nonEmpty(row.eventId) ?? row.id}`;
}

export function dedupePayments(rows: SuperadminPaymentRow[]) {
  const seen = new Set<string>();
  const result: SuperadminPaymentRow[] = [];
  for (const row of rows) {
    const key = paymentIdentity(row);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}

export function clientDisplayName(row: SuperadminPaymentRow) {
  const name = nonEmpty(row.clientName) ?? nonEmpty(row.userName);
  if (name) return name;
  return 'Cliente non disponibile';
}

export function nonEmpty(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function missingPaymentFields(row: SuperadminPaymentRow) {
  const missing: string[] = [];
  if (!nonEmpty(row.productIdentifier)) missing.push('productIdentifier');
  if (!nonEmpty(row.eventType)) missing.push('eventType');
  if (!nonEmpty(row.transactionId) && !nonEmpty(row.originalTransactionId) && !nonEmpty(row.eventId)) missing.push('transaction identity');
  if (!nonEmpty(row.date) && !nonEmpty(row.purchasedAt) && !nonEmpty(row.receivedAt)) missing.push('date');
  if (validAmount(row.amount) == null) missing.push('amount');
  if (!nonEmpty(row.currency)) missing.push('currency');
  if (!nonEmpty(row.environment)) missing.push('environment');
  if (!nonEmpty(row.store)) missing.push('store');
  return missing;
}

export function isRealPositiveRevenue(row: SuperadminPaymentRow) {
  const presentation = revenueCatEventPresentation(row.eventType ?? row.eventStatus ?? row.status);
  return presentation.positiveRevenue && !isSandboxEnvironment(row.environment) && validAmount(row.amount) != null && Boolean(nonEmpty(row.currency));
}
