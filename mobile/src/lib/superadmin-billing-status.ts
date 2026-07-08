import type { AppBillingStatus } from '@/types/superadmin';

const BILLING_STATUS_LABELS: Record<AppBillingStatus, string> = {
  trial: 'In prova',
  active: 'Attivo',
  past_due: 'Pagamento scaduto',
  canceled: 'Annullato',
  blocked: 'Bloccato',
};

export function getBillingStatusLabel(status: AppBillingStatus) {
  return BILLING_STATUS_LABELS[status];
}

export function isAppBillingStatus(status: string): status is AppBillingStatus {
  return status in BILLING_STATUS_LABELS;
}
