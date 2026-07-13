import { StyleSheet, Text, View } from 'react-native';

import { AppBadge, AppCard, type AppBadgeTone } from '@/components/ui';
import { SuperadminShell } from '@/components/superadmin-shell';
import { useSuperadminStore } from '@/store/superadmin-store';
import { AppFontSize, AppSpacing, useAppTheme } from '@/theme';
import type { DemoPaymentEvent } from '@/types/superadmin';

export default function SuperadminPaymentEvents() {
  const coaches = useSuperadminStore((s) => s.coaches);
  const events = useSuperadminStore((s) => s.paymentEvents);

  return (
    <SuperadminShell title="Pagamenti" description="Storico amministrativo degli eventi pagamento.">
      {events.map((event) => (
        <PaymentEventCard
          key={event.id}
          event={event}
          coachName={coaches.find((coach) => coach.id === event.coachId)?.name ?? 'Coach non trovato'}
        />
      ))}
    </SuperadminShell>
  );
}

function PaymentEventCard({ event, coachName }: { event: DemoPaymentEvent; coachName: string }) {
  const { colors } = useAppTheme();
  const tone: AppBadgeTone = event.status === 'succeeded' ? 'moss' : event.status === 'failed' ? 'rust' : 'amber';

  return (
    <AppCard style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text style={[styles.coachName, { color: colors.ink }]}>{coachName}</Text>
          <Text style={[styles.smallText, { color: colors.inkSoft }]}>{getPaymentEventLabel(event.eventType)}</Text>
        </View>
        <AppBadge label={getPaymentStatusLabel(event.status)} tone={tone} />
      </View>

      <View style={styles.grid}>
        <Field label="Origine" value={getPaymentProviderLabel(event.provider)} />
        <Field label="Data" value={event.createdAt} />
        <Field label="Importo" value={event.amount === undefined ? '-' : `EUR ${event.amount}`} />
      </View>
    </AppCard>
  );
}

function getPaymentEventLabel(eventType: string) {
  const labels: Record<string, string> = {
    subscription_renewed: 'Abbonamento rinnovato',
    trial_started: 'Periodo di prova avviato',
    invoice_payment_failed: 'Pagamento fattura non riuscito',
    access_blocked_manual: 'Accesso bloccato manualmente',
  };
  return labels[eventType] ?? 'Evento pagamento';
}

function getPaymentStatusLabel(status: DemoPaymentEvent['status']) {
  const labels: Record<DemoPaymentEvent['status'], string> = {
    succeeded: 'Completato',
    pending: 'In attesa',
    failed: 'Non riuscito',
    ignored: 'Archiviato',
  };
  return labels[status];
}

function getPaymentProviderLabel(provider: DemoPaymentEvent['provider']) {
  const labels: Record<DemoPaymentEvent['provider'], string> = {
    demo: 'Sistema amministrativo',
    demo_gateway: 'Canale pagamenti',
    manual_admin: 'Intervento amministratore',
  };
  return labels[provider];
}

function Field({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.smallText, { color: colors.inkSoft }]}>{label}</Text>
      <Text style={[styles.fieldValue, { color: colors.ink }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: AppSpacing[2],
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: AppSpacing[2],
    justifyContent: 'space-between',
  },
  titleBlock: {
    flex: 1,
  },
  coachName: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  smallText: {
    fontSize: AppFontSize.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  field: {
    flexBasis: 130,
    flexGrow: 1,
    gap: 2,
  },
  fieldValue: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
});
