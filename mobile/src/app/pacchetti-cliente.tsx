import { CheckCircle2 } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppBadge, AppButton, AppCard, AppEmptyState, AppErrorState, AppHeader, AppScreen } from '@/components/ui';
import { useMySubscription } from '@/hooks/use-my-subscription';
import { useSubscriptionPackages } from '@/hooks/use-subscription-packages';
import { startPackageCheckout } from '@/lib/package-checkout-service';
import { supabaseConfig } from '@/lib/supabase';
import { AppFontSize, AppSpacing, useAppTheme } from '@/theme';
import type { SubscriptionPackage, UserSubscriptionStatus } from '@/types/subscription-packages';

// Sezione "Pacchetti" del cliente: pacchetti clienti attivi creati dal
// superadmin (letti sempre da Supabase), distinti dagli abbonamenti sessioni
// che il proprio coach puo' assegnare (subscriptions, gestita in
// clienti/[id].tsx lato coach) — qui il cliente acquista direttamente un
// pacchetto del superadmin, uguale per tutti i coach. Nessun pagamento reale
// collegato in questa fase (vedi lib/package-checkout-service.ts).
export default function PacchettiClienteScreen() {
  const { colors } = useAppTheme();
  const { packages, loading: loadingPackages, error: packagesError, reload: reloadPackages } = useSubscriptionPackages('client');
  const { current, history, loading: loadingSubscription, error: subscriptionError, reload: reloadSubscription } = useMySubscription();

  if (!supabaseConfig.isConfigured) {
    return (
      <AppScreen>
        <AppHeader title="Pacchetti" />
        <AppCard>
          <AppEmptyState
            title="Supabase non configurato"
            subtitle="I pacchetti sono disponibili solo con un account Supabase reale collegato."
          />
        </AppCard>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <AppHeader title="Pacchetti" />

      <AppCard style={styles.card}>
        <Text style={[styles.sectionTitle, { color: colors.ink }]}>Il tuo pacchetto</Text>
        {loadingSubscription ? (
          <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>Caricamento...</Text>
        ) : subscriptionError ? (
          <AppErrorState message={subscriptionError} onRetry={reloadSubscription} />
        ) : current ? (
          <CurrentSubscriptionSummary
            status={current.status}
            packageName={current.package?.name ?? 'Pacchetto'}
            startsAt={current.startsAt}
            expiresAt={current.expiresAt}
          />
        ) : (
          <AppEmptyState title="Nessun pacchetto attivo" subtitle="Scegli un pacchetto qui sotto per abbonarti." />
        )}
      </AppCard>

      <Text style={[styles.sectionLabel, { color: colors.inkFaint }]}>PACCHETTI DISPONIBILI</Text>

      {loadingPackages ? (
        <AppCard>
          <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>Caricamento pacchetti...</Text>
        </AppCard>
      ) : packagesError ? (
        <AppCard>
          <AppErrorState message={packagesError} onRetry={reloadPackages} />
        </AppCard>
      ) : packages.length === 0 ? (
        <AppCard>
          <AppEmptyState title="Nessun pacchetto disponibile" subtitle="Il tuo coach o l'assistenza ti aggiorneranno appena disponibili." />
        </AppCard>
      ) : (
        packages.map((item) => (
          <PackageOfferCard key={item.id} item={item} isCurrent={current?.package?.id === item.id && current.status === 'active'} />
        ))
      )}

      {history.length > 1 ? (
        <>
          <Text style={[styles.sectionLabel, { color: colors.inkFaint }]}>STORICO</Text>
          <AppCard style={styles.card}>
            {history.map((item, index) => (
              <View
                key={item.id}
                style={[styles.historyRow, index > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                <Text style={{ color: colors.ink, fontSize: AppFontSize.sm, fontWeight: '700' }}>{item.package?.name ?? 'Pacchetto'}</Text>
                <AppBadge label={getStatusLabel(item.status)} tone={getStatusTone(item.status)} />
              </View>
            ))}
          </AppCard>
        </>
      ) : null}
    </AppScreen>
  );
}

function CurrentSubscriptionSummary({
  status,
  packageName,
  startsAt,
  expiresAt,
}: {
  status: UserSubscriptionStatus;
  packageName: string;
  startsAt: string | null;
  expiresAt: string | null;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.currentBlock}>
      <View style={styles.currentRow}>
        <View style={styles.currentText}>
          <Text style={[styles.currentPackageName, { color: colors.ink }]}>{packageName}</Text>
          <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>
            {startsAt ? `Inizio: ${formatDate(startsAt)}` : 'Data di inizio non ancora registrata'}
          </Text>
        </View>
        <AppBadge label={getStatusLabel(status)} tone={getStatusTone(status)} />
      </View>
      <Text style={{ color: colors.inkSoft, fontSize: AppFontSize.sm }}>
        {expiresAt ? `Scadenza: ${formatDate(expiresAt)}` : 'Nessuna scadenza registrata'}
      </Text>
    </View>
  );
}

function PackageOfferCard({ item, isCurrent }: { item: SubscriptionPackage; isCurrent: boolean }) {
  const { colors } = useAppTheme();
  const [checkoutMessage, setCheckoutMessage] = useState('');
  const [starting, setStarting] = useState(false);

  async function handleSubscribe() {
    setStarting(true);
    setCheckoutMessage('');
    const result = await startPackageCheckout(item);
    setStarting(false);
    setCheckoutMessage(result.message);
  }

  return (
    <AppCard style={styles.card}>
      <View style={styles.header}>
        <View style={styles.nameBlock}>
          <Text style={[styles.name, { color: colors.ink }]}>{item.name}</Text>
          <Text style={[styles.price, { color: colors.inkSoft }]}>
            {formatPrice(item.price, item.currency)} / {formatDuration(item.durationValue, item.durationUnit)}
          </Text>
        </View>
        {isCurrent ? (
          <View style={[styles.currentPill, { backgroundColor: colors.mossSoft }]}>
            <CheckCircle2 size={14} color={colors.moss} strokeWidth={2.5} />
            <Text style={[styles.currentPillLabel, { color: colors.moss }]}>Attuale</Text>
          </View>
        ) : null}
      </View>

      {item.description ? <Text style={[styles.description, { color: colors.inkSoft }]}>{item.description}</Text> : null}

      {item.features.length > 0 ? (
        <View style={styles.features}>
          {item.features.map((feature) => (
            <AppBadge key={feature} label={feature} tone="neutral" />
          ))}
        </View>
      ) : null}

      {checkoutMessage ? <Text style={[styles.checkoutMessage, { color: colors.inkSoft }]}>{checkoutMessage}</Text> : null}

      <AppButton label={isCurrent ? 'Rinnova' : 'Abbonati'} onPress={handleSubscribe} loading={starting} fullWidth />
    </AppCard>
  );
}

function formatPrice(price: number, currency: string) {
  return `${currency === 'EUR' ? '€' : currency + ' '}${price.toFixed(2)}`;
}

function formatDuration(value: number, unit: 'days' | 'months') {
  const label = unit === 'days' ? (value === 1 ? 'giorno' : 'giorni') : value === 1 ? 'mese' : 'mesi';
  return `${value} ${label}`;
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return value;
  }
}

function getStatusLabel(status: UserSubscriptionStatus) {
  const labels: Record<UserSubscriptionStatus, string> = {
    pending: 'In attesa',
    active: 'Attivo',
    expired: 'Scaduto',
    canceled: 'Annullato',
  };
  return labels[status];
}

function getStatusTone(status: UserSubscriptionStatus) {
  if (status === 'active') return 'moss' as const;
  if (status === 'pending') return 'amber' as const;
  if (status === 'expired' || status === 'canceled') return 'rust' as const;
  return 'neutral' as const;
}

const styles = StyleSheet.create({
  card: {
    gap: AppSpacing[2],
  },
  sectionTitle: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  sectionLabel: {
    fontSize: AppFontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginTop: AppSpacing[1],
  },
  currentBlock: {
    gap: 4,
  },
  currentRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[2],
    justifyContent: 'space-between',
  },
  currentText: {
    flex: 1,
    minWidth: 0,
  },
  currentPackageName: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: AppSpacing[2],
    justifyContent: 'space-between',
  },
  nameBlock: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  price: {
    fontSize: AppFontSize.sm,
    marginTop: 2,
  },
  currentPill: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  currentPillLabel: {
    fontSize: AppFontSize.sm - 1,
    fontWeight: '700',
  },
  description: {
    fontSize: AppFontSize.sm,
    lineHeight: AppFontSize.sm * 1.4,
  },
  features: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  checkoutMessage: {
    fontSize: AppFontSize.sm,
    lineHeight: AppFontSize.sm * 1.4,
  },
  historyRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: AppSpacing[2],
  },
});
