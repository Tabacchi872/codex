import type { CoachFeatureKey, CoachPlanCode } from '@/lib/coach-gating';

export type AppPlanCode = CoachPlanCode | (string & {});

export type AppBillingStatus = 'trial' | 'active' | 'past_due' | 'canceled' | 'blocked';

export type SuperadminNotificationType =
  | 'coach_created'
  | 'coach_updated'
  | 'coach_blocked'
  | 'coach_unblocked'
  | 'coach_plan_assigned'
  | 'coach_plan_changed'
  | 'payment_past_due'
  | 'plan_updated';

export type DemoCoachClient = {
  id: string;
  coachId: string;
  name: string;
  contact?: string;
  status?: string;
  createdAt?: string;
};

export type DemoCoachAccount = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  planCode: AppPlanCode;
  billingStatus: AppBillingStatus;
  clientsUsed: number;
  clientLimitOverride?: number | null;
  periodStartsAt: string;
  periodEndsAt: string;
  blocked: boolean;
};

export type DemoAppPlan = {
  code: AppPlanCode;
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  clientLimit: number | null;
  features: CoachFeatureKey[];
  active: boolean;
};

export type DemoPaymentEvent = {
  id: string;
  coachId: string;
  provider: 'demo' | 'demo_gateway' | 'manual_admin';
  eventType: string;
  createdAt: string;
  status: 'succeeded' | 'pending' | 'failed' | 'ignored';
  amount?: number;
};

export type SuperadminNotification = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  type: SuperadminNotificationType;
  read: boolean;
};
