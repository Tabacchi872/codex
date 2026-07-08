import type { CoachFeatureKey, CoachPlanCode } from '@/lib/coach-gating';

export type AppPlanCode = CoachPlanCode | 'unlimited';

export type AppBillingStatus = 'trial' | 'active' | 'past_due' | 'canceled' | 'blocked';

export type DemoCoachAccount = {
  id: string;
  name: string;
  email: string;
  planCode: AppPlanCode;
  billingStatus: AppBillingStatus;
  clientsUsed: number;
  periodEndsAt: string;
  blocked: boolean;
};

export type DemoAppPlan = {
  code: AppPlanCode;
  name: string;
  monthlyPrice: number;
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
