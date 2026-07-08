import type { CoachFeatureKey, CoachPlanCode } from '@/lib/coach-gating';

export type AppPlanCode = CoachPlanCode | (string & {});

export type AppBillingStatus = 'trial' | 'active' | 'past_due' | 'canceled' | 'blocked';

export type CoachBillingSubjectType = 'private' | 'freelancer' | 'sole_proprietorship' | 'company';

export type CoachBillingProfile = {
  subjectType: CoachBillingSubjectType;
  legalName: string;
  vatNumber?: string;
  fiscalCode?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  province?: string;
  country: string;
  pec?: string;
  sdiCode?: string;
  billingEmail: string;
};

export type SuperadminNotificationType =
  | 'coach_created'
  | 'coach_updated'
  | 'coach_blocked'
  | 'coach_unblocked'
  | 'coach_plan_assigned'
  | 'coach_plan_changed'
  | 'coach_support_message'
  | 'payment_past_due'
  | 'plan_updated';

export type DemoCoachClient = {
  id: string;
  coachId: string;
  clientId?: string;
  name: string;
  contact?: string;
  status?: string;
  createdAt?: string;
  linkedByCode?: string | null;
};

export type DemoCoachAccount = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  businessName?: string;
  billingProfile?: CoachBillingProfile;
  coachCode: string;
  coachCodeActive: boolean;
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

export type DemoPlanBillingRule = {
  monthlyPricePerClient: number;
  extraClientStep: number;
  extraMonthlyPricePerStep: number;
  prorataFirstMonthImplemented: boolean;
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
  relatedCoachId?: string;
};

export type CoachSupportMessage = {
  id: string;
  coachId: string;
  sender: 'coach' | 'superadmin';
  text: string;
  createdAt: string;
  readByCoachAt?: string;
  readBySuperadminAt?: string;
};

export type SuperadminSupportConversation = {
  coach: DemoCoachAccount;
  lastMessage: CoachSupportMessage;
  unreadCount: number;
};
