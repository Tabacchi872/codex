import type { AppBillingStatus, DemoAppPlan, DemoCoachAccount } from '@/types/superadmin';

const COACH_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function normalizeCoachCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

export function generateCoachCode(existingCodes: string[] = []) {
  const existing = new Set(existingCodes.map(normalizeCoachCode));
  let code = '';

  do {
    code = `FC-${randomSegment()}-${randomSegment()}`;
  } while (existing.has(code));

  return code;
}

export function canCoachAcceptClients(coach: DemoCoachAccount, plan: DemoAppPlan | undefined) {
  if (!coach.coachCodeActive) return { allowed: false, reason: 'Questo codice coach non e attivo.' };
  if (isBlockedBillingStatus(coach.billingStatus) || coach.blocked) {
    return { allowed: false, reason: 'Questo coach non puo accettare nuove registrazioni al momento.' };
  }
  if (!plan?.active) return { allowed: false, reason: 'Il piano del coach non consente nuove registrazioni al momento.' };

  const limit = coach.clientLimitOverride ?? plan.clientLimit;
  if (limit !== null && coach.clientsUsed >= limit) {
    return { allowed: false, reason: 'Il coach ha raggiunto il limite clienti del piano attivo.' };
  }

  return { allowed: true, reason: '' };
}

function isBlockedBillingStatus(status: AppBillingStatus) {
  return status === 'blocked' || status === 'past_due' || status === 'canceled';
}

function randomSegment() {
  return Array.from({ length: 4 }, () => COACH_CODE_ALPHABET[Math.floor(Math.random() * COACH_CODE_ALPHABET.length)]).join('');
}
