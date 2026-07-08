import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { SuperadminShell } from '@/components/superadmin-shell';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getSuperadminSupportConversations, useSuperadminStore } from '@/store/superadmin-store';
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
        <Card style={styles.emptyCard}>
          <ThemedText type="smallBold">Nessun coach ha scritto</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Le richieste dei coach verranno mostrate qui.
          </ThemedText>
        </Card>
      ) : (
        conversations.map((conversation) => (
          <Pressable
            key={conversation.coach.id}
            hitSlop={4}
            style={styles.conversationLink}
            onPress={() =>
              router.push({ pathname: '/superadmin/support/[coachId]', params: { coachId: conversation.coach.id } })
            }>
            <ConversationCard conversation={conversation} />
          </Pressable>
        ))
      )}
    </SuperadminShell>
  );
}

function ConversationCard({ conversation }: { conversation: SuperadminSupportConversation }) {
  const theme = useTheme();

  return (
    <Card style={[styles.card, { borderColor: conversation.unreadCount > 0 ? theme.primary : theme.border }]}>
      <View style={styles.headerRow}>
        <View style={styles.identity}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {conversation.coach.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {conversation.coach.email}
          </ThemedText>
        </View>
        <View style={styles.metaColumn}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.metaText}>
            {formatDateTime(conversation.lastMessage.createdAt)}
          </ThemedText>
          {conversation.unreadCount > 0 ? <UnreadBadge count={conversation.unreadCount} /> : null}
        </View>
      </View>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.previewText}>
        {conversation.lastMessage.text}
      </ThemedText>
    </Card>
  );
}

function UnreadBadge({ count }: { count: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.unreadBadge, { backgroundColor: theme.primary }]}>
      <ThemedText type="smallBold" style={styles.unreadText} themeColor="onPrimary">
        {count > 99 ? '99+' : String(count)}
      </ThemedText>
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
  conversationLink: {
    maxWidth: '100%',
    width: '100%',
  },
  emptyCard: {
    gap: Spacing.one,
    maxWidth: '100%',
    width: '100%',
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
    maxWidth: '100%',
    overflow: 'hidden',
    width: '100%',
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
    maxWidth: '100%',
    minWidth: 0,
  },
  identity: {
    flex: 1,
    minWidth: 0,
  },
  metaColumn: {
    alignItems: 'flex-end',
    gap: Spacing.one,
    flexShrink: 0,
    maxWidth: 116,
  },
  metaText: {
    textAlign: 'right',
  },
  previewText: {
    minWidth: 0,
  },
  unreadBadge: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    justifyContent: 'center',
    minWidth: 24,
    paddingHorizontal: Spacing.one,
    paddingVertical: 2,
  },
  unreadText: {
    fontSize: 11,
    lineHeight: 14,
  },
});
