// Pacchetti acquistabili gestiti dal superadmin (2026-07-12), letti sempre da
// Supabase (mai hardcodati in app). Distinti da:
// - plans/coach_billing (types/superadmin.ts): piano SaaS interno del coach,
//   gia' esistente, non toccato da questa feature;
// - subscriptions (abbonamento sessioni creato dal singolo coach per il
//   proprio cliente): questi pacchetti sono invece creati dal superadmin,
//   uguali per tutti i coach/clienti.
// Vedi docs/SUPABASE_SCHEMA.sql per lo schema DB.

export type SubscriptionPackageTargetRole = 'coach' | 'client';

export type SubscriptionPackageDurationUnit = 'days' | 'months';

export type UserSubscriptionStatus = 'pending' | 'active' | 'expired' | 'canceled';

export type SubscriptionPackage = {
  id: string;
  targetRole: SubscriptionPackageTargetRole;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  durationValue: number;
  durationUnit: SubscriptionPackageDurationUnit;
  // Solo per targetRole 'coach' (vincolo anche lato DB): quanti clienti puo'
  // gestire un coach con questo pacchetto attivo.
  maxClients: number | null;
  features: string[];
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type SubscriptionPackageInput = {
  targetRole: SubscriptionPackageTargetRole;
  name: string;
  description: string;
  price: number;
  currency: string;
  durationValue: number;
  durationUnit: SubscriptionPackageDurationUnit;
  maxClients: number | null;
  features: string[];
  isActive: boolean;
  sortOrder: number;
};

export type UserSubscription = {
  id: string;
  userId: string;
  packageId: string;
  status: UserSubscriptionStatus;
  startsAt: string | null;
  expiresAt: string | null;
  paymentProvider: string | null;
  externalSubscriptionId: string | null;
  createdAt: string;
  updatedAt: string;
  // Presente solo quando la riga viene caricata insieme al pacchetto
  // collegato (join lato servizio), assente in un insert/update puro.
  package?: SubscriptionPackage;
};

// Limite clienti coach collegato all'abbonamento (2026-07-12): risultato
// della RPC get_coach_client_capacity (docs/SUPABASE_SCHEMA.sql). Usato sia
// dalla schermata "Clienti" del coach (la propria capacita') sia dal
// pannello superadmin (la capacita' di un coach qualsiasi).
export type CoachClientCapacity = {
  hasActiveSubscription: boolean;
  packageName: string | null;
  maxClients: number | null;
  usedClients: number;
  // null quando maxClients e' null (illimitato): nessuno slot da esaurire.
  availableSlots: number | null;
  expiresAt: string | null;
};
