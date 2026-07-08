export type CoachFeatureKey =
  | 'clients'
  | 'workout_templates'
  | 'appointments'
  | 'messages_realtime'
  | 'push_notifications'
  | 'advanced_analytics';

export type CoachPlanCode = 'free' | 'starter' | 'pro' | 'studio' | 'custom';

export type CoachBillingStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'blocked' | 'manual_override';

export type CoachAccessInput = {
  coachId: string;
  isCoachActive: boolean;
  planCode: CoachPlanCode | null;
  billingStatus: CoachBillingStatus | null;
  currentClientCount: number;
  clientLimit: number | null;
  enabledFeatures: readonly CoachFeatureKey[];
  requiredFeature?: CoachFeatureKey;
  demoBypass?: boolean;
};

export type CoachAccessResult = {
  allowed: boolean;
  reason:
    | 'allowed'
    | 'demo_bypass'
    | 'coach_inactive'
    | 'missing_plan'
    | 'billing_not_valid'
    | 'client_limit_reached'
    | 'feature_not_enabled';
};

const VALID_BILLING_STATUSES = new Set<CoachBillingStatus>(['trialing', 'active', 'manual_override']);

export function evaluateCoachAccess(input: CoachAccessInput): CoachAccessResult {
  if (input.demoBypass) {
    return { allowed: true, reason: 'demo_bypass' };
  }

  if (!input.isCoachActive) {
    return { allowed: false, reason: 'coach_inactive' };
  }

  if (!input.planCode) {
    return { allowed: false, reason: 'missing_plan' };
  }

  if (!input.billingStatus || !VALID_BILLING_STATUSES.has(input.billingStatus)) {
    return { allowed: false, reason: 'billing_not_valid' };
  }

  if (input.clientLimit !== null && input.currentClientCount >= input.clientLimit) {
    return { allowed: false, reason: 'client_limit_reached' };
  }

  if (input.requiredFeature && !input.enabledFeatures.includes(input.requiredFeature)) {
    return { allowed: false, reason: 'feature_not_enabled' };
  }

  return { allowed: true, reason: 'allowed' };
}
