import { AppNotificationList } from '@/components/app-notification-list';
import { AppScreen, BackHeader } from '@/components/ui';

export default function NotificheScreen() {
  return (
    <AppScreen contentStyle={{ gap: 12 }}>
      <BackHeader title="Notifiche" fallbackHref="/cliente-home" />
      <AppNotificationList role="cliente" />
    </AppScreen>
  );
}
