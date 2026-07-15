import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { generateCoachCode, normalizeCoachCode } from '@/lib/coach-code';
import { getBillingStatusLabel } from '@/lib/superadmin-billing-status';
import type {
  AppPlanCode,
  DemoAppPlan,
  DemoCoachAccount,
  DemoCoachClient,
  DemoPaymentEvent,
  DemoPlanBillingRule,
  CoachSupportMessage,
  SuperadminNotification,
  SuperadminNotificationType,
  SuperadminSupportConversation,
} from '@/types/superadmin';

const demoPlans: DemoAppPlan[] = [
  {
    code: 'free',
    name: 'Free',
    monthlyPrice: 0,
    annualPrice: 0,
    clientLimit: 10,
    features: ['clients', 'workout_templates'],
    active: true,
  },
  {
    code: 'starter',
    name: 'Starter',
    monthlyPrice: 30,
    annualPrice: 300,
    clientLimit: 30,
    features: ['clients', 'workout_templates', 'appointments'],
    active: true,
  },
  {
    code: 'pro',
    name: 'Pro',
    monthlyPrice: 50,
    annualPrice: 500,
    clientLimit: 50,
    features: ['clients', 'workout_templates', 'appointments', 'messages_realtime', 'advanced_analytics'],
    active: true,
  },
  {
    code: 'plus',
    name: 'Plus',
    monthlyPrice: 70,
    annualPrice: 700,
    clientLimit: 70,
    features: ['clients', 'workout_templates', 'appointments', 'messages_realtime', 'push_notifications'],
    active: true,
  },
  {
    code: 'studio',
    name: 'Studio',
    monthlyPrice: 100,
    annualPrice: 1000,
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
];

export const demoPlanBillingRule: DemoPlanBillingRule = {
  monthlyPricePerClient: 1,
  extraClientStep: 10,
  extraMonthlyPricePerStep: 10,
  prorataFirstMonthImplemented: false,
};

const demoCoaches: DemoCoachAccount[] = [
  {
    id: 'coach_demo_1',
    name: 'Giulia Ferri',
    email: 'giulia.ferri@fitcoach.it',
    phone: '+39 333 100 2000',
    businessName: 'GF Coaching',
    billingProfile: {
      subjectType: 'freelancer',
      legalName: 'Giulia Ferri',
      vatNumber: '12345678901',
      fiscalCode: 'FRRGLI90A41H501X',
      address: 'Via Roma 10',
      postalCode: '00100',
      city: 'Roma',
      province: 'RM',
      country: 'Italia',
      pec: 'giulia.ferri@pec.it',
      sdiCode: '0000000',
      billingEmail: 'fatture@fitcoach.it',
    },
    coachCode: 'FC-8KQ4-MR2P',
    coachCodeActive: true,
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
    businessName: 'Rinaldi Performance',
    billingProfile: {
      subjectType: 'sole_proprietorship',
      legalName: 'Rinaldi Performance di Marco Rinaldi',
      vatNumber: '10987654321',
      fiscalCode: 'RNLMRC88B12F205K',
      address: 'Corso Milano 21',
      postalCode: '20100',
      city: 'Milano',
      province: 'MI',
      country: 'Italia',
      sdiCode: '0000000',
      billingEmail: 'amministrazione@rinaldiperformance.it',
    },
    coachCode: 'FC-5VHD-9NTA',
    coachCodeActive: true,
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
    businessName: 'Sara Conti Studio',
    billingProfile: {
      subjectType: 'company',
      legalName: 'Sara Conti Studio SRL',
      vatNumber: '13579246801',
      fiscalCode: '13579246801',
      address: 'Via Torino 5',
      postalCode: '10100',
      city: 'Torino',
      province: 'TO',
      country: 'Italia',
      pec: 'saracontistudio@pec.it',
      billingEmail: 'billing@saracontistudio.it',
    },
    coachCode: 'FC-P7LM-42QK',
    coachCodeActive: true,
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
    coachCode: 'FC-Z6RC-83HX',
    coachCodeActive: false,
    planCode: 'free',
    billingStatus: 'blocked',
    clientsUsed: 3,
    periodStartsAt: '2026-05-20',
    periodEndsAt: '2026-06-20',
    blocked: true,
  },
];

const demoCoachClients: DemoCoachClient[] = [
  { id: 'client_demo_1', coachId: 'coach_demo_1', name: 'Anna Rossi', contact: 'anna.rossi@email.it', status: 'active', createdAt: '2026-06-01', linkedByCode: 'FC-8KQ4-MR2P' },
  { id: 'client_demo_2', coachId: 'coach_demo_1', name: 'Davide Neri', contact: '+39 320 111 2200', status: 'active', createdAt: '2026-06-10', linkedByCode: 'FC-8KQ4-MR2P' },
  { id: 'client_demo_3', coachId: 'coach_demo_2', name: 'Elena Bianchi', contact: 'elena.bianchi@email.it', status: 'trial', createdAt: '2026-07-05', linkedByCode: 'FC-5VHD-9NTA' },
  { id: 'client_demo_4', coachId: 'coach_demo_3', name: 'Matteo Gallo', contact: '+39 320 111 2201', status: 'past_due', createdAt: '2026-05-28', linkedByCode: 'FC-P7LM-42QK' },
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

const demoCoachSupportMessages: CoachSupportMessage[] = [
  {
    id: 'support_demo_1',
    coachId: 'coach_demo_1',
    sender: 'coach',
    text: 'Ciao, posso avere una verifica sul rinnovo del piano Pro?',
    createdAt: '2026-07-08T08:45:00.000Z',
    readByCoachAt: '2026-07-08T08:45:00.000Z',
    readBySuperadminAt: '2026-07-08T09:10:00.000Z',
  },
  {
    id: 'support_demo_2',
    coachId: 'coach_demo_1',
    sender: 'superadmin',
    text: 'Certo Giulia, il rinnovo risulta attivo fino al 01/08/2026.',
    createdAt: '2026-07-08T09:10:00.000Z',
    readBySuperadminAt: '2026-07-08T09:10:00.000Z',
  },
  {
    id: 'support_demo_3',
    coachId: 'coach_demo_2',
    sender: 'coach',
    text: 'Vorrei capire come passare da Starter a Pro per il prossimo mese.',
    createdAt: '2026-07-08T10:20:00.000Z',
    readByCoachAt: '2026-07-08T10:20:00.000Z',
  },
];

type SuperadminState = {
  coaches: DemoCoachAccount[];
  plans: DemoAppPlan[];
  coachClients: DemoCoachClient[];
  paymentEvents: DemoPaymentEvent[];
  coachSupportMessages: CoachSupportMessage[];
  notifications: SuperadminNotification[];
  createCoach: (
    coach: Omit<DemoCoachAccount, 'id' | 'clientsUsed' | 'blocked' | 'coachCode' | 'coachCodeActive'> & {
      clientsUsed?: number;
      coachCode?: string;
      coachCodeActive?: boolean;
    },
  ) => DemoCoachAccount;
  updateCoach: (coachId: string, patch: Partial<Omit<DemoCoachAccount, 'id'>>) => void;
  addCoachClient: (client: DemoCoachClient) => void;
  findCoachByCode: (code: string) => DemoCoachAccount | undefined;
  regenerateCoachCode: (coachId: string) => string | null;
  setCoachCodeActive: (coachId: string, active: boolean) => void;
  toggleCoachBlocked: (coachId: string) => void;
  changeCoachPlan: (coachId: string, planCode: AppPlanCode) => void;
  updatePlan: (planCode: AppPlanCode, patch: Partial<DemoAppPlan>) => void;
  markNotificationRead: (notificationId: string) => void;
  markAllNotificationsRead: () => void;
  sendSupportMessageAsCoach: (coachId: string, text: string) => void;
  sendSupportMessageAsSuperadmin: (coachId: string, text: string) => void;
  markCoachSupportReadByCoach: (coachId: string) => void;
  markCoachSupportReadBySuperadmin: (coachId: string) => void;
};

function normalizeCoach(coach: DemoCoachAccount): DemoCoachAccount {
  const blocked = coach.billingStatus === 'blocked';
  return {
    ...coach,
    coachCode: normalizeCoachCode(coach.coachCode),
    coachCodeActive: coach.coachCodeActive ?? true,
    blocked,
    billingStatus: blocked ? 'blocked' : coach.billingStatus,
  };
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

export function getSuperadminSupportConversations(
  coaches: DemoCoachAccount[],
  messages: CoachSupportMessage[],
): SuperadminSupportConversation[] {
  return coaches
    .map((coach) => {
      const coachMessages = messages
        .filter((message) => message.coachId === coach.id)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const lastMessage = coachMessages.at(-1);
      if (!lastMessage || !coachMessages.some((message) => message.sender === 'coach')) return null;
      return {
        coach,
        lastMessage,
        unreadCount: coachMessages.filter((message) => message.sender === 'coach' && !message.readBySuperadminAt).length,
      };
    })
    .filter((item): item is SuperadminSupportConversation => item !== null)
    .sort((a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime());
}

export function getUnreadSuperadminSupportCount(coaches: DemoCoachAccount[], messages: CoachSupportMessage[]) {
  return getSuperadminSupportConversations(coaches, messages).reduce(
    (total, conversation) => total + conversation.unreadCount,
    0,
  );
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

export const useSuperadminStore = create<SuperadminState>()(
  persist(
    (set, get) => ({
  coaches: demoCoaches,
  plans: demoPlans,
  coachClients: demoCoachClients,
  paymentEvents: demoPaymentEvents,
  coachSupportMessages: demoCoachSupportMessages,
  notifications: [],
  createCoach: (coachInput) => {
    const coach = normalizeCoach({
      id: `coach_demo_${Date.now()}`,
      clientsUsed: coachInput.clientsUsed ?? 0,
      blocked: coachInput.billingStatus === 'blocked',
      coachCode: coachInput.coachCode || generateCoachCode(get().coaches.map((item) => item.coachCode)),
      coachCodeActive: coachInput.coachCodeActive ?? true,
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
  addCoachClient: (client) =>
    set((state) => ({
      coachClients: [...state.coachClients, client],
      coaches: state.coaches.map((coach) =>
        coach.id === client.coachId ? { ...coach, clientsUsed: coach.clientsUsed + 1 } : coach,
      ),
    })),
  findCoachByCode: (code) => {
    const normalizedCode = normalizeCoachCode(code);
    return get().coaches.find((coach) => normalizeCoachCode(coach.coachCode) === normalizedCode);
  },
  regenerateCoachCode: (coachId) => {
    const nextCode = generateCoachCode(get().coaches.filter((coach) => coach.id !== coachId).map((coach) => coach.coachCode));
    let changed = false;
    set((state) => ({
      coaches: state.coaches.map((coach) => {
        if (coach.id !== coachId) return coach;
        changed = true;
        return { ...coach, coachCode: nextCode, coachCodeActive: true };
      }),
    }));
    return changed ? nextCode : null;
  },
  setCoachCodeActive: (coachId, active) =>
    set((state) => ({
      coaches: state.coaches.map((coach) => (coach.id === coachId ? { ...coach, coachCodeActive: active } : coach)),
    })),
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
  sendSupportMessageAsCoach: (coachId, text) =>
    set((state) => {
      const coach = state.coaches.find((item) => item.id === coachId);
      if (!coach) return {};
      const now = new Date().toISOString();
      const message: CoachSupportMessage = {
        id: `support_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        coachId,
        sender: 'coach',
        text,
        createdAt: now,
        readByCoachAt: now,
      };
      const notification = createNotification({
        title: 'Nuovo messaggio coach',
        description: `${coach.name} ha inviato un messaggio al supporto.`,
        type: 'coach_support_message',
        relatedCoachId: coach.id,
      });
      return {
        coachSupportMessages: [...state.coachSupportMessages, message],
        notifications: [notification, ...state.notifications],
      };
    }),
  sendSupportMessageAsSuperadmin: (coachId, text) =>
    set((state) => {
      if (!state.coaches.some((coach) => coach.id === coachId)) return {};
      const now = new Date().toISOString();
      const message: CoachSupportMessage = {
        id: `support_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        coachId,
        sender: 'superadmin',
        text,
        createdAt: now,
        readBySuperadminAt: now,
      };
      return { coachSupportMessages: [...state.coachSupportMessages, message] };
    }),
  markCoachSupportReadByCoach: (coachId) =>
    set((state) => {
      const now = new Date().toISOString();
      let changed = false;
      const coachSupportMessages = state.coachSupportMessages.map((message) => {
        if (message.coachId === coachId && message.sender === 'superadmin' && !message.readByCoachAt) {
          changed = true;
          return { ...message, readByCoachAt: now };
        }
        return message;
      });
      return changed ? { coachSupportMessages } : {};
    }),
  markCoachSupportReadBySuperadmin: (coachId) =>
    set((state) => {
      const now = new Date().toISOString();
      let changed = false;
      const coachSupportMessages = state.coachSupportMessages.map((message) => {
        if (message.coachId === coachId && message.sender === 'coach' && !message.readBySuperadminAt) {
          changed = true;
          return { ...message, readBySuperadminAt: now };
        }
        return message;
      });
      const notifications = state.notifications.map((notification) =>
        notification.type === 'coach_support_message' && notification.relatedCoachId === coachId
          ? { ...notification, read: true }
          : notification,
      );
      return changed ? { coachSupportMessages, notifications } : { notifications };
    }),
    }),
    {
      name: 'coachdesk-superadmin-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        coaches: state.coaches,
        plans: state.plans,
        coachClients: state.coachClients,
        paymentEvents: state.paymentEvents,
        coachSupportMessages: state.coachSupportMessages,
        notifications: state.notifications,
      }),
    },
  ),
);
