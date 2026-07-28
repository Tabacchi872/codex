import { AppNotificationList } from '@/components/app-notification-list';
import { BackHeader } from '@/components/ui';
import { SuperadminShell } from '@/components/superadmin-shell';

// Distinta di proposito da /superadmin/notifications (registro LOCALE degli
// eventi amministrativi coach/pagamenti, useSuperadminStore — mai backed dal
// DB): questa schermata mostra le notifiche reali di app_notifications
// relative al sistema "Programmi automatici" (Blocco 2/3): pending_template,
// sicurezza, clienti da rivedere, errori di generazione, coach assegnato.
export default function SuperadminNotificheProgrammi() {
  return (
    <SuperadminShell title="Notifiche programmi automatici" description="Eventi che richiedono attenzione sui cicli automatici dei clienti.">
      <BackHeader title="Notifiche programmi" fallbackHref="/superadmin" />
      <AppNotificationList role="superadmin" />
    </SuperadminShell>
  );
}
