import { supabase, supabaseConfig } from './supabase';

export type SuperadminServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: 'not_configured' | 'db_error'; message: string };

export type SuperadminClientRow = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  coachId: string | null;
  coachName: string | null;
  mode: 'with_coach' | 'auto_program';
  clientProStatus: string;
  clientProExpiresAt: string | null;
  clientProProductId: string | null;
  questionnaireStatus: string;
  programStatus: string;
  needsReview: boolean;
  completedWorkouts: number;
  lastActivityAt: string | null;
};

export type SuperadminDashboardData = {
  kpis: {
    activeCoaches: number;
    totalClients: number;
    clientsWithoutCoach: number;
    clientProActive: number;
    clientProExpired: number;
    activeAutoPrograms: number;
    reviewsToCheck: number;
    coachMonthRevenue: number | null;
    clientProMonthRevenue: number | null;
    clientProMonthRevenueCurrency: string | null;
    openTickets: number;
  };
  recentCoaches: Array<{ id: string; name: string; email: string; createdAt: string }>;
  recentClients: Array<{ id: string; name: string; email: string; createdAt: string }>;
  notes?: Record<string, string>;
};

export type ClientProSummary = {
  packages: Array<{
    id: string;
    name: string;
    entitlementIdentifier: string | null;
    offeringIdentifier: string | null;
    androidProductId: string | null;
    iosProductId: string | null;
    isActive: boolean;
    backendPrice: number | null;
    backendCurrency: string | null;
    priceSource: 'store_available_in_app' | 'backend_unavailable' | string;
  }>;
  counts: {
    active?: number;
    expired?: number;
    canceled?: number;
    refunded?: number;
    revoked?: number;
    sandbox?: number;
    production?: number;
  };
};

export type SuperadminPaymentRow = {
  id: string;
  transactionKey?: string | null;
  userId?: string;
  clientId?: string | null;
  userName?: string;
  clientName?: string | null;
  userEmail?: string;
  clientEmail?: string | null;
  packageName?: string;
  productIdentifier: string | null;
  entitlementIdentifier?: string | null;
  provider?: string | null;
  store?: string | null;
  transactionId: string | null;
  originalTransactionId?: string | null;
  eventId?: string;
  eventType?: string;
  date: string | null;
  purchasedAt?: string | null;
  receivedAt?: string | null;
  status: string;
  eventStatus?: string | null;
  subscriptionStatus?: string | null;
  amount: number | string | null;
  currency: string | null;
  amountUnavailableReason?: string;
  environment?: string | null;
  renewal?: boolean;
  expiresAt?: string | null;
  refund?: boolean;
  revocation?: boolean;
  processed?: boolean;
  processingError?: string | null;
  clientResolved?: boolean;
};

export type SuperadminPayments = {
  coachPayments: SuperadminPaymentRow[];
  clientProPayments: SuperadminPaymentRow[];
};

export type SuperadminClientDetail = {
  profile: Record<string, unknown>;
  coach: Record<string, unknown> | null;
  subscriptions: Record<string, unknown>[];
  fitnessProfile: Record<string, unknown> | null;
  currentCycle: Record<string, unknown> | null;
  cycles: Record<string, unknown>[];
  workoutPlans: Record<string, unknown>[];
  checkins: Record<string, unknown>[];
  reviews: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
  overrides: Record<string, unknown>[];
};

const NOT_CONFIGURED_MESSAGE = 'Supabase non e configurato: dati Superadmin reali non disponibili.';

function notConfigured<T>(): SuperadminServiceResult<T> {
  return { ok: false, code: 'not_configured', message: NOT_CONFIGURED_MESSAGE };
}

async function callRpc<T>(name: string, args?: Record<string, unknown>): Promise<SuperadminServiceResult<T>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();
  const { data, error } = await supabase.rpc(name, args ?? {});
  if (error) {
    if (__DEV__) console.error('SUPERADMIN_RPC_ERROR', { name, args: redactRpcArgs(args), error: safeRpcError(error) });
    return { ok: false, code: 'db_error', message: error.message };
  }
  if (__DEV__) console.info('SUPERADMIN_RPC_RESULT', safeRpcResult(name, data));
  return { ok: true, data: data as T };
}

function redactRpcArgs(args: Record<string, unknown> | undefined) {
  if (!args) return {};
  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => [key, typeof value === 'string' && key.toLowerCase().includes('id') ? anonymizeId(value) : typeof value]),
  );
}

function safeRpcError(error: { code?: string; message?: string; details?: string; hint?: string }) {
  return {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  };
}

function safeRpcResult(name: string, data: unknown) {
  const rows = extractRows(data);
  return {
    name,
    rowCount: rows.length,
    firstRowShape: rows[0] ? anonymizeShape(rows[0]) : null,
    topLevelShape: anonymizeShape(data),
  };
}

function extractRows(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  const record = data as Record<string, unknown>;
  if (Array.isArray(record.clientProPayments)) return record.clientProPayments;
  if (Array.isArray(record.coachPayments)) return record.coachPayments;
  return [];
}

function anonymizeShape(value: unknown): unknown {
  if (Array.isArray(value)) return { type: 'array', length: value.length, first: value[0] ? anonymizeShape(value[0]) : null };
  if (!value || typeof value !== 'object') return typeof value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      const lowered = key.toLowerCase();
      if (lowered.includes('email')) return [key, '[redacted-email]'];
      if (lowered.endsWith('id') || lowered.includes('transaction')) return [key, typeof item === 'string' ? anonymizeId(item) : typeof item];
      if (Array.isArray(item)) return [key, { type: 'array', length: item.length }];
      return [key, item === null ? 'null' : typeof item];
    }),
  );
}

function anonymizeId(value: string) {
  if (value.length <= 8) return '[id]';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function listSuperadminClients() {
  return callRpc<SuperadminClientRow[]>('superadmin_list_clients');
}

export function getSuperadminClientDetail(clientId: string) {
  return callRpc<SuperadminClientDetail>('superadmin_get_client_detail', { p_client_id: clientId });
}

export function getSuperadminDashboard() {
  return callRpc<SuperadminDashboardData>('superadmin_get_dashboard');
}

export function getClientProSummary() {
  return callRpc<ClientProSummary>('superadmin_get_client_pro_summary');
}

export function getSuperadminPayments() {
  return callRpc<SuperadminPayments>('superadmin_get_payments');
}
