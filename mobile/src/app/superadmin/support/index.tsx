import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppCard } from '@/components/ui';
import { SuperadminShell } from '@/components/superadmin-shell';
import { getSuperadminSupportConversations, useSuperadminStore } from '@/store/superadmin-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import type { SuperadminSupportConversation } from '@/types/superadmin';

export default function SuperadminSupport() {
  const coaches = useSuperadminStore((s) => s.coaches);
  const messages = useSuperadminStore((s) => s.coachSupportMessages);

  const conversations = useMemo<SuperadminSupportConversation[]>(() => {
    return getSuperadminSupportConversations(coaches, messages);
  }, [coaches, messages]);

  return (
    <SuperadminShell
      title="Supporto coach"
      description="Chat interna tra coach e superadmin per assistenza e comunicazioni amministrative."
      contentStyle={styles.shellContent}>
      {conversations.length === 0 ? (
        <AppCard style={styles.emptyCard}>
          <EmptyText />
        </AppCard>
      ) : (
        conversations.map((conversation) => (
          <ConversationCard
            key={conversation.coach.id}
            conversation={conversation}
            onPress={() => router.push({ pathname: '/superadmin/support/[coachId]', params: { coachId: conversation.coach.id } })}
          />
        ))
      )}
    </SuperadminShell>
  );
}

function EmptyText() {
  const { colors } = useAppTheme();
  return (
    <>
      <Text style={[styles.emptyTitle, { color: colors.ink }]}>Nessun coach ha scritto</Text>
      <Text style={[styles.smallText, { color: colors.inkSoft }]}>Le richieste dei coach verranno mostrate qui.</Text>
    </>
  );
}

function ConversationCard({ conversation, onPress }: { conversation: SuperadminSupportConversation; onPress: () => void }) {
  const { colors } = useAppTheme();

  return (
    <AppCard onPress={onPress} style={[styles.card, { borderColor: conversation.unreadCount > 0 ? colors.coral : colors.border }]}>
      <View style={styles.headerRow}>
        <View style={styles.identity}>
          <Text style={[styles.coachName, { color: colors.ink }]} numberOfLines={1}>
            {conversation.coach.name}
          </Text>
          <Text style={[styles.smallText, { color: colors.inkSoft }]} numberOfLines={1}>
            {conversation.coach.email}
          </Text>
        </View>
        <View style={styles.metaColumn}>
          <Text style={[styles.metaText, { color: colors.inkSoft }]}>{formatDateTime(conversation.lastMessage.createdAt)}</Text>
          {conversation.unreadCount > 0 ? <UnreadBadge count={conversation.unreadCount} /> : null}
        </View>
      </View>
      <Text style={[styles.smallText, styles.previewText, { color: colors.inkSoft }]} numberOfLines={2}>
        {conversation.lastMessage.text}
      </Text>
    </AppCard>
  );
}

function UnreadBadge({ count }: { count: number }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.unreadBadge, { backgroundColor: colors.coral }]}>
      <Text style={[styles.unreadText, { color: colors.onCoral }]}>{count > 99 ? '99+' : String(count)}</Text>
    </View>
  );
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  shellContent: {
    maxWidth: '100%',
    width: '100%',
  },
  emptyCard: {
    gap: 4,
    maxWidth: '100%',
    width: '100%',
  },
  emptyTitle: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  smallText: {
    fontSize: AppFontSize.sm,
  },
  card: {
    borderWidth: 1.5,
    gap: AppSpacing[2],
    maxWidth: '100%',
    overflow: 'hidden',
    width: '100%',
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: AppSpacing[2],
    justifyContent: 'space-between',
    maxWidth: '100%',
    minWidth: 0,
  },
  identity: {
    flex: 1,
    minWidth: 0,
  },
  coachName: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  metaColumn: {
    alignItems: 'flex-end',
    gap: AppSpacing[1],
    flexShrink: 0,
    maxWidth: 116,
  },
  metaText: {
    fontSize: AppFontSize.sm,
    textAlign: 'right',
  },
  previewText: {
    minWidth: 0,
  },
  unreadBadge: {
    alignItems: 'center',
    borderRadius: AppRadius.pill,
    justifyContent: 'center',
    minWidth: 24,
    paddingHorizontal: AppSpacing[1],
    paddingVertical: 2,
  },
  unreadText: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
});
