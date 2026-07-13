import { MessageCircle, Plus, Send } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton, AppCard, AppEmptyState, AppIconButton, AppTextField } from '@/components/ui';
import { BottomTabInset } from '@/constants/theme';
import { clientFullName } from '@/lib/client-helpers';
import { useAuthStore } from '@/store/auth-store';
import { useChatStore } from '@/store/chat-store';
import { useClientStore } from '@/store/client-store';
import { AppFontSize, AppRadius, AppSpacing, AppTextStyle, useAppTheme } from '@/theme';
import type { ChatMessage } from '@/types/chat';
import type { Client } from '@/types/client';

type CoachConversation = {
  client: Client;
  lastMessage: ChatMessage;
  unreadCount: number;
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatConversationTime(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const isToday =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();

  if (isToday) return formatTime(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function sortByCreatedAt(a: ChatMessage, b: ChatMessage) {
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

// Schermata condivisa coach/cliente: il ruolo determina se si vede la lista
// conversazioni (coach, multi-cliente) o direttamente il thread con il coach
// (cliente, un solo thread). Migrata al nuovo design system per entrambi i
// ruoli in un colpo solo.
export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const currentRole = useAuthStore((s) => s.currentRole);
  const currentClientId = useAuthStore((s) => s.currentClientId);
  const clients = useClientStore((s) => s.clients);
  const messages = useChatStore((s) => s.messages);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const markClientThreadReadByCoach = useChatStore((s) => s.markClientThreadReadByCoach);
  const markClientThreadReadByClient = useChatStore((s) => s.markClientThreadReadByClient);
  const [draft, setDraft] = useState('');
  const [selectedCoachClientId, setSelectedCoachClientId] = useState<string | null>(null);
  const [isSelectingClient, setIsSelectingClient] = useState(false);

  const isCoach = currentRole === 'coach';
  const selectedClientId = isCoach ? selectedCoachClientId ?? '' : currentClientId ?? '';
  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId),
    [clients, selectedClientId]
  );

  const threadMessages = useMemo(
    () => messages.filter((m) => m.clientId === selectedClientId).sort(sortByCreatedAt),
    [messages, selectedClientId]
  );

  const conversations = useMemo<CoachConversation[]>(() => {
    return clients
      .map((client) => {
        const clientMessages = messages.filter((message) => message.clientId === client.id).sort(sortByCreatedAt);
        const lastMessage = clientMessages.at(-1);
        if (!lastMessage) return null;

        return {
          client,
          lastMessage,
          unreadCount: clientMessages.filter((message) => message.sender === 'client' && !message.readByCoachAt).length,
        };
      })
      .filter((conversation): conversation is CoachConversation => conversation !== null)
      .sort((a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime());
  }, [clients, messages]);

  const clientsWithoutConversation = useMemo(() => {
    const conversationClientIds = new Set(conversations.map((conversation) => conversation.client.id));
    return clients.filter((client) => !conversationClientIds.has(client.id));
  }, [clients, conversations]);

  const selectedCoachUnreadCount = useMemo(() => {
    if (!selectedCoachClientId) return 0;
    return messages.filter(
      (message) => message.clientId === selectedCoachClientId && message.sender === 'client' && !message.readByCoachAt
    ).length;
  }, [messages, selectedCoachClientId]);

  const selectedClientUnreadCount = useMemo(() => {
    if (!currentClientId) return 0;
    return messages.filter(
      (message) => message.clientId === currentClientId && message.sender === 'coach' && !message.readByClientAt
    ).length;
  }, [currentClientId, messages]);

  useEffect(() => {
    if (isCoach && selectedCoachClientId && selectedCoachUnreadCount > 0) {
      markClientThreadReadByCoach(selectedCoachClientId);
    }
  }, [isCoach, markClientThreadReadByCoach, selectedCoachClientId, selectedCoachUnreadCount]);

  useEffect(() => {
    if (!isCoach && currentClientId && selectedClientUnreadCount > 0) {
      markClientThreadReadByClient(currentClientId);
    }
  }, [currentClientId, isCoach, markClientThreadReadByClient, selectedClientUnreadCount]);

  function handleOpenConversation(clientId: string) {
    setIsSelectingClient(false);
    setSelectedCoachClientId(clientId);
    markClientThreadReadByCoach(clientId);
  }

  function handleSend() {
    const text = draft.trim();
    if (!text || !selectedClientId) return;

    const now = new Date().toISOString();
    const message: ChatMessage = {
      id: `chat-${Date.now()}`,
      clientId: selectedClientId,
      sender: isCoach ? 'coach' : 'client',
      text,
      createdAt: now,
      ...(isCoach ? { readByCoachAt: now } : { readByClientAt: now }),
    };
    sendMessage(message);
    setDraft('');
  }

  if (isCoach && isSelectingClient) {
    return (
      <CoachClientSelector
        clients={clientsWithoutConversation}
        insetsTop={insets.top}
        insetsBottom={insets.bottom}
        onCancel={() => setIsSelectingClient(false)}
        onSelect={handleOpenConversation}
      />
    );
  }

  if (isCoach && !selectedCoachClientId) {
    return (
      <CoachConversationList
        conversations={conversations}
        insetsTop={insets.top}
        insetsBottom={insets.bottom}
        onNewConversation={() => setIsSelectingClient(true)}
        onSelect={handleOpenConversation}
      />
    );
  }

  const sendDisabled = !draft.trim() || !selectedClientId;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          data={threadMessages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingTop: Platform.OS === 'web' ? AppSpacing[4] : insets.top + AppSpacing[3] }]}
          ListHeaderComponent={
            <View style={styles.header}>
              {isCoach ? (
                <Pressable onPress={() => setSelectedCoachClientId(null)} hitSlop={8} style={styles.backButton}>
                  <Text style={[styles.backLabel, { color: colors.inkSoft }]}>Indietro</Text>
                </Pressable>
              ) : null}
              <Text style={[AppTextStyle.title, { color: colors.ink }]}>
                {isCoach && selectedClient ? clientFullName(selectedClient) : 'Chat con il coach'}
              </Text>
            </View>
          }
          ListEmptyComponent={
            <AppCard>
              <AppEmptyState
                icon={<MessageCircle size={20} color={colors.moss} strokeWidth={2} />}
                title="Nessun messaggio ancora"
                subtitle={
                  isCoach
                    ? 'Nessun messaggio con questo cliente. Scrivi il primo messaggio qui sotto.'
                    : 'Scrivi al tuo coach qui sotto per iniziare la conversazione.'
                }
              />
            </AppCard>
          }
          renderItem={({ item }) => <MessageBubble message={item} isCoach={isCoach} />}
        />
        <View
          style={[
            styles.inputRow,
            {
              borderTopColor: colors.border,
              paddingBottom: insets.bottom + (Platform.OS === 'web' ? BottomTabInset + AppSpacing[2] : AppSpacing[2]),
            },
          ]}>
          <View style={styles.inputWrap}>
            <AppTextField
              placeholder={isCoach && selectedClient ? `Scrivi a ${clientFullName(selectedClient)}` : 'Scrivi un messaggio...'}
              value={draft}
              onChangeText={setDraft}
              multiline
              style={styles.input}
            />
          </View>
          <AppIconButton
            icon={<Send size={17} color={colors.onCoral} />}
            onPress={handleSend}
            disabled={sendDisabled}
            tone="coral"
            bordered={false}
            accessibilityLabel="Invia messaggio"
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function CoachConversationList({
  conversations,
  insetsTop,
  insetsBottom,
  onNewConversation,
  onSelect,
}: {
  conversations: CoachConversation[];
  insetsTop: number;
  insetsBottom: number;
  onNewConversation: () => void;
  onSelect: (clientId: string) => void;
}) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.client.id}
        contentContainerStyle={[
          styles.list,
          {
            paddingTop: Platform.OS === 'web' ? AppSpacing[4] : insetsTop + AppSpacing[3],
            paddingBottom: insetsBottom + BottomTabInset + AppSpacing[4],
          },
        ]}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={[AppTextStyle.title, { color: colors.ink }]}>Messaggi</Text>
            <AppIconButton
              icon={<Plus size={20} color={colors.onCoral} />}
              onPress={onNewConversation}
              tone="coral"
              bordered={false}
              accessibilityLabel="Nuova conversazione"
            />
          </View>
        }
        ListEmptyComponent={
          <AppCard>
            <AppEmptyState
              icon={<MessageCircle size={20} color={colors.moss} strokeWidth={2} />}
              title="Nessun messaggio"
              subtitle="Quando un cliente ti scrive, la conversazione comparira qui. Usa + per iniziare tu."
            />
          </AppCard>
        }
        renderItem={({ item }) => (
          <AppCard onPress={() => onSelect(item.client.id)} style={styles.conversationCard}>
            <View style={styles.conversationRow}>
              <View style={styles.conversationMain}>
                <View style={styles.conversationTitleRow}>
                  <Text style={[styles.conversationName, { color: colors.ink }]} numberOfLines={1}>
                    {clientFullName(item.client)}
                  </Text>
                  <Text style={[styles.metaText, { color: colors.inkSoft }]}>{formatConversationTime(item.lastMessage.createdAt)}</Text>
                </View>
                <Text style={[styles.metaText, { color: colors.inkSoft }]} numberOfLines={1}>
                  {item.lastMessage.text}
                </Text>
              </View>
              {item.unreadCount > 0 ? <UnreadBadge count={item.unreadCount} /> : null}
            </View>
          </AppCard>
        )}
        ItemSeparatorComponent={() => <View style={{ height: AppSpacing[2] }} />}
      />
    </View>
  );
}

function CoachClientSelector({
  clients,
  insetsTop,
  insetsBottom,
  onCancel,
  onSelect,
}: {
  clients: Client[];
  insetsTop: number;
  insetsBottom: number;
  onCancel: () => void;
  onSelect: (clientId: string) => void;
}) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={clients}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.list,
          {
            paddingTop: Platform.OS === 'web' ? AppSpacing[4] : insetsTop + AppSpacing[3],
            paddingBottom: insetsBottom + BottomTabInset + AppSpacing[4],
          },
        ]}
        ListHeaderComponent={
          <View style={styles.header}>
            <Pressable onPress={onCancel} hitSlop={8} style={styles.backButton}>
              <Text style={[styles.backLabel, { color: colors.inkSoft }]}>Annulla</Text>
            </Pressable>
            <Text style={[AppTextStyle.title, { color: colors.ink }]}>Nuovo messaggio</Text>
          </View>
        }
        ListEmptyComponent={
          <AppCard>
            <AppEmptyState
              icon={<MessageCircle size={20} color={colors.moss} strokeWidth={2} />}
              title="Tutti i clienti sono gia in lista"
              subtitle="Apri una conversazione esistente per continuare a scrivere."
            />
          </AppCard>
        }
        renderItem={({ item }) => (
          <AppCard onPress={() => onSelect(item.id)} style={styles.clientCard}>
            <Text style={[styles.conversationName, { color: colors.ink }]}>{clientFullName(item)}</Text>
          </AppCard>
        )}
        ItemSeparatorComponent={() => <View style={{ height: AppSpacing[2] }} />}
      />
    </View>
  );
}

function MessageBubble({ message, isCoach }: { message: ChatMessage; isCoach: boolean }) {
  const { colors } = useAppTheme();
  const isMine = isCoach ? message.sender === 'coach' : message.sender === 'client';
  return (
    <View style={[styles.bubbleRow, isMine ? styles.bubbleRowRight : styles.bubbleRowLeft]}>
      <View
        style={[
          styles.bubble,
          isMine
            ? { backgroundColor: colors.coral, borderColor: colors.coral }
            : { backgroundColor: colors.surface, borderColor: colors.border },
        ]}>
        <Text style={[styles.bubbleText, { color: isMine ? colors.onCoral : colors.ink }]}>{message.text}</Text>
      </View>
      <Text style={[styles.bubbleTime, { color: colors.inkFaint }]}>{formatTime(message.createdAt)}</Text>
    </View>
  );
}

function UnreadBadge({ count }: { count: number }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.unreadBadge, { backgroundColor: colors.coral }]}>
      <Text style={[styles.unreadBadgeText, { color: colors.onCoral }]}>{count > 99 ? '99+' : String(count)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  list: {
    paddingHorizontal: AppSpacing[5],
    gap: AppSpacing[2],
    flexGrow: 1,
  },
  header: {
    gap: AppSpacing[2],
    marginBottom: AppSpacing[2],
  },
  listHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: AppSpacing[2],
  },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    paddingVertical: AppSpacing[1],
  },
  backLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  conversationCard: {
    padding: AppSpacing[3],
  },
  conversationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[2],
  },
  conversationMain: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  conversationTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[2],
    justifyContent: 'space-between',
    minWidth: 0,
  },
  conversationName: {
    flex: 1,
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  metaText: {
    fontSize: AppFontSize.sm,
  },
  clientCard: {
    padding: AppSpacing[3],
    minHeight: 48,
    justifyContent: 'center',
  },
  unreadBadge: {
    alignItems: 'center',
    borderRadius: AppRadius.pill,
    minWidth: 22,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  unreadBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  bubbleRow: {
    maxWidth: '80%',
    gap: 2,
  },
  bubbleRowLeft: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubbleRowRight: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  bubble: {
    borderRadius: AppRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: AppSpacing[3],
    paddingVertical: AppSpacing[2],
  },
  bubbleText: {
    fontSize: AppFontSize.sm,
  },
  bubbleTime: {
    fontSize: 11,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing[2],
    paddingHorizontal: AppSpacing[5],
    paddingTop: AppSpacing[2],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputWrap: {
    flex: 1,
  },
  input: {
    maxHeight: 100,
  },
});
