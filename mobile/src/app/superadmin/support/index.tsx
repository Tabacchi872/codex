import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { SuperadminShell } from '@/components/superadmin-shell';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSuperadminStore } from '@/store/superadmin-store';
import type { CoachSupportMessage, DemoCoachAccount } from '@/types/superadmin';

type SupportConversation = {
  coach: DemoCoachAccount;
  lastMessage: CoachSupportMessage;
  unreadCount: number;
};

export default function SuperadminSupport() {
  const coaches = useSuperadminStore((s) => s.coaches);
  const messages = useSuperadminStore((s) => s.coachSupportMessages);

  const conversations = useMemo<SupportConversation[]>(() => {
    return coaches
      .map((coach) => {
        const coachMessages = messages
          .filter((message) => message.coachId === coach.id)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        const lastMessage = coachMessages.at(-1);
        if (!lastMessage || !coachMessages.some((message) => message.sender === 'coach')) return null;
        return {
          coach,
          lastMessage,
          unreadCount: coachMessages.filter((message) => message.sender === 'coach' && !message.readBySuperadminAt).length,
        };
      })
      .filter((item): item is SupportConversation => item !== null)
      .sort((a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime());
  }, [coaches, messages]);

  return (
    <SuperadminShell title="Supporto coach" description="Chat interna tra coach e superadmin per assistenza e comunicazioni amministrative.">
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

function ConversationCard({ conversation }: { conversation: SupportConversation }) {
  const theme = useTheme();

  return (
    <Card style={[styles.card, { borderColor: conversation.unreadCount > 0 ? theme.primary : theme.border }]}>
      <View style={styles.headerRow}>
        <View style={styles.identity}>
          <ThemedText type="smallBold">{conversation.coach.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {conversation.coach.email}
          </ThemedText>
        </View>
        <View style={styles.metaColumn}>
          <ThemedText type="small" themeColor="textSecondary">
            {formatDateTime(conversation.lastMessage.createdAt)}
          </ThemedText>
          {conversation.unreadCount > 0 ? <UnreadBadge count={conversation.unreadCount} /> : null}
        </View>
      </View>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
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
  emptyCard: {
    gap: Spacing.one,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  identity: {
    flex: 1,
    minWidth: 0,
  },
  metaColumn: {
    alignItems: 'flex-end',
    gap: Spacing.one,
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
