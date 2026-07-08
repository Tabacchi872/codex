import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { SuperadminShell } from '@/components/superadmin-shell';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSuperadminStore } from '@/store/superadmin-store';
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
  const theme = useTheme();
  const color = event.status === 'succeeded' ? theme.statusActive : event.status === 'failed' ? theme.statusExpired : theme.statusWarning;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <ThemedText type="smallBold">{coachName}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {getPaymentEventLabel(event.eventType)}
          </ThemedText>
        </View>
        <ThemedText type="smallBold" style={[styles.badge, { borderColor: color, color }]}>
          {getPaymentStatusLabel(event.status)}
        </ThemedText>
      </View>

      <View style={styles.grid}>
        <Field label="Origine" value={getPaymentProviderLabel(event.provider)} />
        <Field label="Data" value={event.createdAt} />
        <Field label="Importo" value={event.amount === undefined ? '-' : `EUR ${event.amount}`} />
      </View>
    </Card>
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
  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  titleBlock: {
    flex: 1,
  },
  badge: {
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  field: {
    flexBasis: 130,
    flexGrow: 1,
    gap: Spacing.half,
  },
});
