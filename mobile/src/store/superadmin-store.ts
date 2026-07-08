import { create } from 'zustand';

import { getBillingStatusLabel } from '@/lib/superadmin-billing-status';
import type {
  AppPlanCode,
  DemoAppPlan,
  DemoCoachAccount,
  DemoCoachClient,
  DemoPaymentEvent,
  SuperadminNotification,
  SuperadminNotificationType,
} from '@/types/superadmin';

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
    email: 'giulia.ferri@fitcoach.it',
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
    email: 'marco.rinaldi@fitcoach.it',
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
    email: 'sara.conti@fitcoach.it',
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
    email: 'luca.moretti@fitcoach.it',
    planCode: 'free',
    billingStatus: 'blocked',
    clientsUsed: 3,
    periodStartsAt: '2026-05-20',
    periodEndsAt: '2026-06-20',
    blocked: true,
  },
];

const demoCoachClients: DemoCoachClient[] = [
  { id: 'client_demo_1', coachId: 'coach_demo_1', name: 'Anna Rossi', contact: 'anna.rossi@email.it', status: 'active', createdAt: '2026-06-01' },
  { id: 'client_demo_2', coachId: 'coach_demo_1', name: 'Davide Neri', contact: '+39 320 111 2200', status: 'active', createdAt: '2026-06-10' },
  { id: 'client_demo_3', coachId: 'coach_demo_2', name: 'Elena Bianchi', contact: 'elena.bianchi@email.it', status: 'trial', createdAt: '2026-07-05' },
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
  notifications: SuperadminNotification[];
  createCoach: (coach: Omit<DemoCoachAccount, 'id' | 'clientsUsed' | 'blocked'> & { clientsUsed?: number }) => DemoCoachAccount;
  updateCoach: (coachId: string, patch: Partial<Omit<DemoCoachAccount, 'id'>>) => void;
  toggleCoachBlocked: (coachId: string) => void;
  changeCoachPlan: (coachId: string, planCode: AppPlanCode) => void;
  updatePlan: (planCode: AppPlanCode, patch: Partial<DemoAppPlan>) => void;
  markNotificationRead: (notificationId: string) => void;
  markAllNotificationsRead: () => void;
};

function normalizeCoach(coach: DemoCoachAccount): DemoCoachAccount {
  const blocked = coach.billingStatus === 'blocked';
  return { ...coach, blocked, billingStatus: blocked ? 'blocked' : coach.billingStatus };
}

function createNotification(input: Omit<SuperadminNotification, 'id' | 'createdAt' | 'read'>): SuperadminNotification {
  return {
    ...input,
    id: `notification_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    read: false,
  };
}

function findPlanName(plans: DemoAppPlan[], planCode: AppPlanCode) {
  return plans.find((plan) => plan.code === planCode)?.name ?? String(planCode);
}

function buildCoachNotifications(
  previous: DemoCoachAccount | undefined,
  next: DemoCoachAccount,
  plans: DemoAppPlan[],
): SuperadminNotification[] {
  const notifications: SuperadminNotification[] = [];
  const nextPlanName = findPlanName(plans, next.planCode);

  if (!previous) {
    notifications.push(
      createNotification({
        title: 'Nuovo coach creato',
        description: `${next.name} e' stato aggiunto al pannello superadmin.`,
        type: 'coach_created',
      }),
      createNotification({
        title: 'Nuovo abbonamento coach',
        description: `${next.name} e' stato assegnato al piano ${nextPlanName}.`,
        type: 'coach_plan_assigned',
      }),
    );
    if (next.billingStatus === 'past_due') {
      notifications.push(
        createNotification({
          title: 'Pagamento scaduto',
          description: `${next.name} e' stato impostato su ${getBillingStatusLabel('past_due')}.`,
          type: 'payment_past_due',
        }),
      );
    }
    return notifications;
  }

  notifications.push(
    createNotification({
      title: 'Coach modificato',
      description: `${next.name} e' stato aggiornato.`,
      type: 'coach_updated',
    }),
  );

  if (previous.planCode !== next.planCode) {
    notifications.push(
      createNotification({
        title: 'Piano coach aggiornato',
        description: `${next.name} e' passato al piano ${nextPlanName}.`,
        type: 'coach_plan_changed',
      }),
    );
  }

  if (!previous.blocked && next.blocked) {
    notifications.push(
      createNotification({
        title: 'Coach bloccato',
        description: `${next.name} e' stato bloccato.`,
        type: 'coach_blocked',
      }),
    );
  }

  if (previous.blocked && !next.blocked) {
    notifications.push(
      createNotification({
        title: 'Coach sbloccato',
        description: `${next.name} e' stato sbloccato.`,
        type: 'coach_unblocked',
      }),
    );
  }

  if (previous.billingStatus !== 'past_due' && next.billingStatus === 'past_due') {
    notifications.push(
      createNotification({
        title: 'Pagamento scaduto',
        description: `${next.name} e' stato impostato su ${getBillingStatusLabel('past_due')}.`,
        type: 'payment_past_due',
      }),
    );
  }

  return notifications;
}

export const useSuperadminStore = create<SuperadminState>()((set) => ({
  coaches: demoCoaches,
  plans: demoPlans,
  coachClients: demoCoachClients,
  paymentEvents: demoPaymentEvents,
  notifications: [],
  createCoach: (coachInput) => {
    const coach = normalizeCoach({
      id: `coach_demo_${Date.now()}`,
      clientsUsed: coachInput.clientsUsed ?? 0,
      blocked: coachInput.billingStatus === 'blocked',
      ...coachInput,
    });
    set((state) => ({
      coaches: [...state.coaches, coach],
      notifications: [...buildCoachNotifications(undefined, coach, state.plans), ...state.notifications],
    }));
    return coach;
  },
  updateCoach: (coachId, patch) =>
    set((state) => {
      const previous = state.coaches.find((coach) => coach.id === coachId);
      if (!previous) return {};
      const next = normalizeCoach({ ...previous, ...patch });
      return {
        coaches: state.coaches.map((coach) => (coach.id === coachId ? next : coach)),
        notifications: [...buildCoachNotifications(previous, next, state.plans), ...state.notifications],
      };
    }),
  toggleCoachBlocked: (coachId) =>
    set((state) => {
      const previous = state.coaches.find((coach) => coach.id === coachId);
      if (!previous) return {};
      const blocked = !previous.blocked;
      const next = { ...previous, blocked, billingStatus: blocked ? 'blocked' : 'active' } as DemoCoachAccount;
      return {
        coaches: state.coaches.map((coach) => (coach.id === coachId ? next : coach)),
        notifications: [...buildCoachNotifications(previous, next, state.plans), ...state.notifications],
      };
    }),
  changeCoachPlan: (coachId, planCode) =>
    set((state) => {
      const previous = state.coaches.find((coach) => coach.id === coachId);
      if (!previous) return {};
      const next = { ...previous, planCode };
      return {
        coaches: state.coaches.map((coach) => (coach.id === coachId ? next : coach)),
        notifications: [...buildCoachNotifications(previous, next, state.plans), ...state.notifications],
      };
    }),
  updatePlan: (planCode, patch) =>
    set((state) => {
      const nextCode = patch.code ?? planCode;
      const previousPlan = state.plans.find((plan) => plan.code === planCode);
      const nextPlan = previousPlan ? { ...previousPlan, ...patch, code: nextCode } : undefined;
      const notification =
        nextPlan === undefined
          ? []
          : [
              createNotification({
                title: 'Piano modificato',
                description: `Il piano ${nextPlan.name} e' stato aggiornato.`,
                type: 'plan_updated' satisfies SuperadminNotificationType,
              }),
            ];
      return {
        plans: state.plans.map((plan) => (plan.code === planCode ? { ...plan, ...patch, code: nextCode } : plan)),
        coaches: state.coaches.map((coach) => (coach.planCode === planCode ? { ...coach, planCode: nextCode } : coach)),
        notifications: [...notification, ...state.notifications],
      };
    }),
  markNotificationRead: (notificationId) =>
    set((state) => ({
      notifications: state.notifications.map((notification) =>
        notification.id === notificationId ? { ...notification, read: true } : notification,
      ),
    })),
  markAllNotificationsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((notification) => ({ ...notification, read: true })),
    })),
}));
