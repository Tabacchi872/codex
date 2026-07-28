import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppCard, AppEmptyState, AppPressableCard } from './ui';

import { useAppNotificationStore } from '@/store/app-notification-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import type { AppNotification } from '@/types/app-notification';

// Condiviso da cliente e Superadmin: entrambi vedono solo le PROPRIE
// notifiche (RLS + RPC scopano sempre su auth.uid(), mai un id passato
// dalla UI). La destinazione di navigazione cambia in base a `type`/`data`,
// ma la lista/il badge/segna-letta sono identici per i due ruoli — nessuna
// logica duplicata.
const CLIENT_ROUTE_BY_TYPE: Record<string, (data: Record<string, unknown>) => string | null> = {
  auto_program_assigned: () => '/cliente-home',
  auto_program_coach_assigned: () => '/cliente-home',
  auto_program_override_applied: () => '/cliente-home',
  review_progress_applied: () => '/cliente-home',
  review_simplified: () => '/cliente-home',
  review_exercises_replaced: () => '/cliente-home',
  review_maintained: () => '/cliente-home',
  review_insufficient_data: () => '/cliente-home',
  review_blocked_subscription: () => '/abbonamento-cliente',
  review_blocked_safety_client: () => '/cliente-home',
};

function resolveClientHref(notification: AppNotification): string | null {
  const resolver = CLIENT_ROUTE_BY_TYPE[notification.type];
  return resolver ? resolver(notification.data) : null;
}

type Props = {
  role: 'cliente' | 'superadmin';
};

export function AppNotificationList({ role }: Props) {
  const router = useRouter();
  const { colors } = useAppTheme();
  const notifications = useAppNotificationStore((s) => s.notifications);
  const unreadCount = useAppNotificationStore((s) => s.unreadCount);
  const loading = useAppNotificationStore((s) => s.loading);
  const error = useAppNotificationStore((s) => s.error);
  const load = useAppNotificationStore((s) => s.load);
  const markRead = useAppNotificationStore((s) => s.markRead);
  const markAllRead = useAppNotificationStore((s) => s.markAllRead);

  useEffect(() => {
    load();
  }, [load]);

  async function handlePress(notification: AppNotification) {
    if (!notification.readAt) await markRead(notification.id);
    if (role === 'cliente') {
      const href = resolveClientHref(notification);
      if (href) router.push(href as never);
    }
    // Superadmin: nessuna schermata dedicata di risoluzione esiste ancora
    // (gap noto, vedi docs/TODO_NEXT.md) — la card resta espansa in loco
    // (titolo + corpo completi, già visibili) invece di navigare verso
    // una destinazione inventata.
  }

  if (error) {
    return (
      <AppCard style={styles.card}>
        <AppEmptyState title="Notifiche non disponibili" subtitle={error} actionLabel="Riprova" onAction={load} />
      </AppCard>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.summaryRow}>
        <Text style={[styles.summaryText, { color: colors.inkSoft }]}>
          {unreadCount > 0 ? `${unreadCount} non lette` : 'Tutto letto'}
        </Text>
        {unreadCount > 0 ? <AppButton label="Segna tutte come lette" onPress={markAllRead} variant="outline" size="sm" /> : null}
      </View>

      {!loading && notifications.length === 0 ? (
        <AppCard style={styles.card}>
          <AppEmptyState title="Nessuna notifica" subtitle="Le notifiche relative al tuo programma automatico compariranno qui." />
        </AppCard>
      ) : (
        notifications.map((notification) => (
          <NotificationRow key={notification.id} notification={notification} onPress={() => handlePress(notification)} />
        ))
      )}
    </View>
  );
}

function NotificationRow({ notification, onPress }: { notification: AppNotification; onPress: () => void }) {
  const { colors } = useAppTheme();
  const isUnread = !notification.readAt;

  return (
    <AppPressableCard
      onPress={onPress}
      accessibilityLabel={`Notifica: ${notification.title}${isUnread ? ', non letta' : ''}`}
      style={[styles.notificationCard, { borderColor: isUnread ? colors.moss : colors.border }]}>
      <View style={styles.notificationHeader}>
        <View style={[styles.readDot, { backgroundColor: isUnread ? colors.moss : colors.inkFaint }]} />
        <Text style={[styles.notificationTitle, { color: colors.ink }]} numberOfLines={2}>
          {notification.title}
        </Text>
      </View>
      {notification.body ? (
        <Text style={[styles.notificationBody, { color: colors.inkSoft }]} numberOfLines={4}>
          {notification.body}
        </Text>
      ) : null}
      <Text style={[styles.notificationDate, { color: colors.inkSoft }]}>{formatNotificationDate(notification.createdAt)}</Text>
    </AppPressableCard>
  );
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
  container: {
    gap: AppSpacing[2],
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[2],
    justifyContent: 'space-between',
  },
  summaryText: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  card: {
    gap: AppSpacing[2],
  },
  notificationCard: {
    borderWidth: 1.5,
    gap: AppSpacing[1],
  },
  notificationHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[2],
  },
  readDot: {
    borderRadius: AppRadius.pill,
    height: 9,
    width: 9,
  },
  notificationTitle: {
    flex: 1,
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  notificationBody: {
    fontSize: AppFontSize.sm,
    lineHeight: 19,
  },
  notificationDate: {
    fontSize: AppFontSize.xs,
    fontWeight: '600',
  },
});
