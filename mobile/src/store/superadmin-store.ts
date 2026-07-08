import { create } from 'zustand';

import type { AppPlanCode, DemoAppPlan, DemoCoachAccount, DemoCoachClient, DemoPaymentEvent } from '@/types/superadmin';

const demoPlans: DemoAppPlan[] = [
  {
    code: 'free',
    name: 'Free',
    monthlyPrice: 0,
    annualPrice: 0,
    clientLimit: 3,
    features: ['clients', 'workout_templates'],
    active: true,
  },
  {
    code: 'starter',
    name: 'Starter',
    monthlyPrice: 19,
    annualPrice: 190,
    clientLimit: 10,
    features: ['clients', 'workout_templates', 'appointments'],
    active: true,
  },
  {
    code: 'pro',
    name: 'Pro',
    monthlyPrice: 49,
    annualPrice: 490,
    clientLimit: 30,
    features: ['clients', 'workout_templates', 'appointments', 'messages_realtime', 'advanced_analytics'],
    active: true,
  },
  {
    code: 'studio',
    name: 'Studio',
    monthlyPrice: 99,
    annualPrice: 990,
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
    annualPrice: 1990,
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
    phone: '+39 333 100 2000',
    planCode: 'pro',
    billingStatus: 'active',
    clientsUsed: 22,
    periodStartsAt: '2026-07-01',
    periodEndsAt: '2026-08-01',
    blocked: false,
  },
  {
    id: 'coach_demo_2',
    name: 'Marco Rinaldi',
    email: 'marco.rinaldi@fitcoach.local',
    phone: '+39 333 100 2001',
    planCode: 'starter',
    billingStatus: 'trial',
    clientsUsed: 6,
    periodStartsAt: '2026-07-04',
    periodEndsAt: '2026-07-18',
    blocked: false,
  },
  {
    id: 'coach_demo_3',
    name: 'Sara Conti',
    email: 'sara.conti@fitcoach.local',
    phone: '+39 333 100 2002',
    planCode: 'studio',
    billingStatus: 'past_due',
    clientsUsed: 64,
    periodStartsAt: '2026-06-03',
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
    periodStartsAt: '2026-05-20',
    periodEndsAt: '2026-06-20',
    blocked: true,
  },
];

const demoCoachClients: DemoCoachClient[] = [
  { id: 'client_demo_1', coachId: 'coach_demo_1', name: 'Anna Rossi', contact: 'anna.rossi@email.local', status: 'active', createdAt: '2026-06-01' },
  { id: 'client_demo_2', coachId: 'coach_demo_1', name: 'Davide Neri', contact: '+39 320 111 2200', status: 'active', createdAt: '2026-06-10' },
  { id: 'client_demo_3', coachId: 'coach_demo_2', name: 'Elena Bianchi', contact: 'elena.bianchi@email.local', status: 'trial', createdAt: '2026-07-05' },
  { id: 'client_demo_4', coachId: 'coach_demo_3', name: 'Matteo Gallo', contact: '+39 320 111 2201', status: 'past_due', createdAt: '2026-05-28' },
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
  coachClients: DemoCoachClient[];
  paymentEvents: DemoPaymentEvent[];
  createCoach: (coach: Omit<DemoCoachAccount, 'id' | 'clientsUsed' | 'blocked'> & { clientsUsed?: number }) => DemoCoachAccount;
  updateCoach: (coachId: string, patch: Partial<Omit<DemoCoachAccount, 'id'>>) => void;
  toggleCoachBlocked: (coachId: string) => void;
  changeCoachPlan: (coachId: string, planCode: AppPlanCode) => void;
  updatePlan: (planCode: AppPlanCode, patch: Partial<DemoAppPlan>) => void;
};

function normalizeCoach(coach: DemoCoachAccount): DemoCoachAccount {
  const blocked = coach.billingStatus === 'blocked';
  return { ...coach, blocked, billingStatus: blocked ? 'blocked' : coach.billingStatus };
}

export const useSuperadminStore = create<SuperadminState>()((set) => ({
  coaches: demoCoaches,
  plans: demoPlans,
  coachClients: demoCoachClients,
  paymentEvents: demoPaymentEvents,
  createCoach: (coachInput) => {
    const coach = normalizeCoach({
      id: `coach_demo_${Date.now()}`,
      clientsUsed: coachInput.clientsUsed ?? 0,
      blocked: coachInput.billingStatus === 'blocked',
      ...coachInput,
    });
    set((state) => ({ coaches: [...state.coaches, coach] }));
    return coach;
  },
  updateCoach: (coachId, patch) =>
    set((state) => ({
      coaches: state.coaches.map((coach) => (coach.id === coachId ? normalizeCoach({ ...coach, ...patch }) : coach)),
    })),
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
  updatePlan: (planCode, patch) =>
    set((state) => {
      const nextCode = patch.code ?? planCode;
      return {
        plans: state.plans.map((plan) => (plan.code === planCode ? { ...plan, ...patch, code: nextCode } : plan)),
        coaches: state.coaches.map((coach) => (coach.planCode === planCode ? { ...coach, planCode: nextCode } : coach)),
      };
    }),
}));
