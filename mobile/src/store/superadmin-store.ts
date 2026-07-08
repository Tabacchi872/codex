import { create } from 'zustand';

import type { AppPlanCode, DemoAppPlan, DemoCoachAccount, DemoPaymentEvent } from '@/types/superadmin';

const demoPlans: DemoAppPlan[] = [
  {
    code: 'free',
    name: 'Free',
    monthlyPrice: 0,
    clientLimit: 3,
    features: ['clients', 'workout_templates'],
    active: true,
  },
  {
    code: 'starter',
    name: 'Starter',
    monthlyPrice: 19,
    clientLimit: 10,
    features: ['clients', 'workout_templates', 'appointments'],
    active: true,
  },
  {
    code: 'pro',
    name: 'Pro',
    monthlyPrice: 49,
    clientLimit: 30,
    features: ['clients', 'workout_templates', 'appointments', 'messages_realtime', 'advanced_analytics'],
    active: true,
  },
  {
    code: 'studio',
    name: 'Studio',
    monthlyPrice: 99,
    clientLimit: 100,
    features: [
      'clients',
      'workout_templates',
      'appointments',
      'messages_realtime',
      'push_notifications',
      'advanced_analytics',
    ],
    active: true,
  },
  {
    code: 'unlimited',
    name: 'Unlimited',
    monthlyPrice: 199,
    clientLimit: null,
    features: [
      'clients',
      'workout_templates',
      'appointments',
      'messages_realtime',
      'push_notifications',
      'advanced_analytics',
    ],
    active: false,
  },
];

const demoCoaches: DemoCoachAccount[] = [
  {
    id: 'coach_demo_1',
    name: 'Giulia Ferri',
    email: 'giulia.ferri@fitcoach.local',
    planCode: 'pro',
    billingStatus: 'active',
    clientsUsed: 22,
    periodEndsAt: '2026-08-01',
    blocked: false,
  },
  {
    id: 'coach_demo_2',
    name: 'Marco Rinaldi',
    email: 'marco.rinaldi@fitcoach.local',
    planCode: 'starter',
    billingStatus: 'trial',
    clientsUsed: 6,
    periodEndsAt: '2026-07-18',
    blocked: false,
  },
  {
    id: 'coach_demo_3',
    name: 'Sara Conti',
    email: 'sara.conti@fitcoach.local',
    planCode: 'studio',
    billingStatus: 'past_due',
    clientsUsed: 64,
    periodEndsAt: '2026-07-03',
    blocked: false,
  },
  {
    id: 'coach_demo_4',
    name: 'Luca Moretti',
    email: 'luca.moretti@fitcoach.local',
    planCode: 'free',
    billingStatus: 'blocked',
    clientsUsed: 3,
    periodEndsAt: '2026-06-20',
    blocked: true,
  },
];

const demoPaymentEvents: DemoPaymentEvent[] = [
  {
    id: 'evt_demo_1',
    coachId: 'coach_demo_1',
    provider: 'demo',
    eventType: 'subscription_renewed',
    createdAt: '2026-07-01',
    status: 'succeeded',
    amount: 49,
  },
  {
    id: 'evt_demo_2',
    coachId: 'coach_demo_2',
    provider: 'demo',
    eventType: 'trial_started',
    createdAt: '2026-07-04',
    status: 'succeeded',
  },
  {
    id: 'evt_demo_3',
    coachId: 'coach_demo_3',
    provider: 'demo_gateway',
    eventType: 'invoice_payment_failed',
    createdAt: '2026-07-03',
    status: 'failed',
    amount: 99,
  },
  {
    id: 'evt_demo_4',
    coachId: 'coach_demo_4',
    provider: 'manual_admin',
    eventType: 'access_blocked_manual',
    createdAt: '2026-06-21',
    status: 'ignored',
  },
];

type SuperadminState = {
  coaches: DemoCoachAccount[];
  plans: DemoAppPlan[];
  paymentEvents: DemoPaymentEvent[];
  toggleCoachBlocked: (coachId: string) => void;
  changeCoachPlan: (coachId: string, planCode: AppPlanCode) => void;
};

export const useSuperadminStore = create<SuperadminState>()((set) => ({
  coaches: demoCoaches,
  plans: demoPlans,
  paymentEvents: demoPaymentEvents,
  toggleCoachBlocked: (coachId) =>
    set((state) => ({
      coaches: state.coaches.map((coach) => {
        if (coach.id !== coachId) return coach;
        const blocked = !coach.blocked;
        return { ...coach, blocked, billingStatus: blocked ? 'blocked' : 'active' };
      }),
    })),
  changeCoachPlan: (coachId, planCode) =>
    set((state) => ({
      coaches: state.coaches.map((coach) => (coach.id === coachId ? { ...coach, planCode } : coach)),
    })),
}));
