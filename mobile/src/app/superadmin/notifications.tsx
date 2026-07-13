import { StyleSheet, Text, View } from 'react-native';

import { AppBadge, AppButton, AppCard } from '@/components/ui';
import { SuperadminShell } from '@/components/superadmin-shell';
import { useSuperadminStore } from '@/store/superadmin-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import type { SuperadminNotification, SuperadminNotificationType } from '@/types/superadmin';

export default function SuperadminNotifications() {
  const { colors } = useAppTheme();
  const notifications = useSuperadminStore((s) => s.notifications);
  const markAllNotificationsRead = useSuperadminStore((s) => s.markAllNotificationsRead);
  const unreadCount = notifications.filter((notification) => !notification.read).length;

  return (
    <SuperadminShell title="Notifiche" description="Registro interno degli eventi amministrativi importanti.">
      <AppCard style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryText}>
            <Text style={[styles.summaryLabel, { color: colors.ink }]}>Non lette</Text>
            <Text style={[styles.summaryValue, { color: unreadCount > 0 ? colors.coral : colors.ink }]}>{unreadCount}</Text>
          </View>
          <AppButton
            label="Segna tutte come lette"
            onPress={markAllNotificationsRead}
            disabled={unreadCount === 0}
            variant="outline"
          />
        </View>
      </AppCard>

      {notifications.length === 0 ? (
        <AppCard style={styles.emptyCard}>
          <Text style={[styles.emptyTitle, { color: colors.ink }]}>Nessuna notifica</Text>
          <Text style={[styles.smallText, { color: colors.inkSoft }]}>Gli eventi amministrativi verranno mostrati qui.</Text>
        </AppCard>
      ) : (
        notifications.map((notification) => <NotificationCard key={notification.id} notification={notification} />)
      )}
    </SuperadminShell>
  );
}

function NotificationCard({ notification }: { notification: SuperadminNotification }) {
  const { colors } = useAppTheme();
  const markNotificationRead = useSuperadminStore((s) => s.markNotificationRead);

  return (
    <AppCard style={[styles.notificationCard, { borderColor: notification.read ? colors.border : colors.coral }]}>
      <View style={styles.notificationHeader}>
        <View style={styles.notificationTitle}>
          <View style={[styles.readDot, { backgroundColor: notification.read ? colors.inkFaint : colors.coral }]} />
          <Text style={[styles.notificationTitleText, { color: colors.ink }]}>{notification.title}</Text>
        </View>
        <AppBadge label={getNotificationTypeLabel(notification.type)} tone={notification.read ? 'neutral' : 'coral'} />
      </View>

      <Text style={[styles.smallText, { color: colors.inkSoft }]}>{notification.description}</Text>

      <View style={styles.notificationFooter}>
        <Text style={[styles.smallText, { color: colors.inkSoft }]}>{formatNotificationDate(notification.createdAt)}</Text>
        <Text style={[styles.statusText, { color: notification.read ? colors.inkSoft : colors.coral }]}>
          {notification.read ? 'Letta' : 'Non letta'}
        </Text>
      </View>

      {!notification.read ? (
        <AppButton label="Segna come letta" onPress={() => markNotificationRead(notification.id)} fullWidth />
      ) : null}
    </AppCard>
  );
}

function getNotificationTypeLabel(type: SuperadminNotificationType) {
  const labels: Record<SuperadminNotificationType, string> = {
    coach_created: 'Coach',
    coach_updated: 'Coach',
    coach_blocked: 'Accesso',
    coach_unblocked: 'Accesso',
    coach_plan_assigned: 'Abbonamento',
    coach_plan_changed: 'Piano coach',
    coach_support_message: 'Supporto',
    payment_past_due: 'Pagamento',
    plan_updated: 'Piano',
  };
  return labels[type];
}

function formatNotificationDate(value: string) {
  return new Date(value).toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  summaryCard: {
    gap: AppSpacing[2],
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[2],
    justifyContent: 'space-between',
  },
  summaryText: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  smallText: {
    fontSize: AppFontSize.sm,
  },
  emptyCard: {
    gap: 4,
  },
  emptyTitle: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  notificationCard: {
    borderWidth: 1.5,
    gap: AppSpacing[2],
  },
  notificationHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: AppSpacing[2],
    justifyContent: 'space-between',
  },
  notificationTitle: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: AppSpacing[1],
  },
  notificationTitleText: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
    flexShrink: 1,
  },
  readDot: {
    borderRadius: AppRadius.pill,
    height: 9,
    width: 9,
  },
  notificationFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[2],
    justifyContent: 'space-between',
  },
  statusText: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
});
