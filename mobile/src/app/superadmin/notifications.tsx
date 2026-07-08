import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { SuperadminShell } from '@/components/superadmin-shell';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSuperadminStore } from '@/store/superadmin-store';
import type { SuperadminNotification, SuperadminNotificationType } from '@/types/superadmin';

export default function SuperadminNotifications() {
  const theme = useTheme();
  const notifications = useSuperadminStore((s) => s.notifications);
  const markAllNotificationsRead = useSuperadminStore((s) => s.markAllNotificationsRead);
  const unreadCount = notifications.filter((notification) => !notification.read).length;

  return (
    <SuperadminShell title="Notifiche" description="Registro interno degli eventi amministrativi importanti.">
      <Card style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryText}>
            <ThemedText type="smallBold">Non lette</ThemedText>
            <ThemedText type="subtitle" style={{ color: unreadCount > 0 ? theme.primary : theme.text }}>
              {unreadCount}
            </ThemedText>
          </View>
          <Pressable
            onPress={markAllNotificationsRead}
            disabled={unreadCount === 0}
            hitSlop={6}
            style={[styles.outlineButton, { borderColor: unreadCount > 0 ? theme.primary : theme.border, opacity: unreadCount > 0 ? 1 : 0.55 }]}>
            <ThemedText type="smallBold" style={{ color: unreadCount > 0 ? theme.primary : theme.textSecondary }}>
              Segna tutte come lette
            </ThemedText>
          </Pressable>
        </View>
      </Card>

      {notifications.length === 0 ? (
        <Card style={styles.emptyCard}>
          <ThemedText type="smallBold">Nessuna notifica</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Gli eventi amministrativi verranno mostrati qui.
          </ThemedText>
        </Card>
      ) : (
        notifications.map((notification) => <NotificationCard key={notification.id} notification={notification} />)
      )}
    </SuperadminShell>
  );
}

function NotificationCard({ notification }: { notification: SuperadminNotification }) {
  const theme = useTheme();
  const markNotificationRead = useSuperadminStore((s) => s.markNotificationRead);
  const tone = notification.read ? theme.textSecondary : theme.primary;

  return (
    <Card style={[styles.notificationCard, { borderColor: notification.read ? theme.border : theme.primary }]}>
      <View style={styles.notificationHeader}>
        <View style={styles.notificationTitle}>
          <View style={[styles.readDot, { backgroundColor: notification.read ? theme.disabled : theme.primary }]} />
          <ThemedText type="smallBold">{notification.title}</ThemedText>
        </View>
        <ThemedText type="smallBold" style={[styles.typeBadge, { borderColor: tone, color: tone }]}>
          {getNotificationTypeLabel(notification.type)}
        </ThemedText>
      </View>

      <ThemedText type="small" themeColor="textSecondary">
        {notification.description}
      </ThemedText>

      <View style={styles.notificationFooter}>
        <ThemedText type="small" themeColor="textSecondary">
          {formatNotificationDate(notification.createdAt)}
        </ThemedText>
        <ThemedText type="smallBold" style={{ color: notification.read ? theme.textSecondary : theme.primary }}>
          {notification.read ? 'Letta' : 'Non letta'}
        </ThemedText>
      </View>

      {!notification.read ? (
        <Pressable onPress={() => markNotificationRead(notification.id)} hitSlop={6} style={[styles.readButton, { backgroundColor: theme.primary }]}>
          <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
            Segna come letta
          </ThemedText>
        </Pressable>
      ) : null}
    </Card>
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
    gap: Spacing.two,
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  summaryText: {
    flex: 1,
  },
  outlineButton: {
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  emptyCard: {
    gap: Spacing.one,
  },
  notificationCard: {
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  notificationHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  notificationTitle: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.one,
  },
  readDot: {
    borderRadius: Radius.pill,
    height: 9,
    width: 9,
  },
  typeBadge: {
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  notificationFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  readButton: {
    alignItems: 'center',
    borderRadius: Radius.md,
    minHeight: 44,
    paddingVertical: Spacing.two,
    width: '100%',
  },
});
