import { useEffect, useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { ThemedTextInput } from '@/components/themed-text-input';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { clientFullName } from '@/lib/client-helpers';
import { useAuthStore } from '@/store/auth-store';
import { useChatStore } from '@/store/chat-store';
import { useClientStore } from '@/store/client-store';
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

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
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
        onNewConversation={() => setIsSelectingClient(true)}
        onSelect={handleOpenConversation}
      />
    );
  }

  const sendDisabled = !draft.trim() || !selectedClientId;

  return (
    <ScreenBackground>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          data={threadMessages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            { paddingTop: Platform.OS === 'web' ? Spacing.four : insets.top + Spacing.three },
          ]}
          ListHeaderComponent={
            <View style={styles.header}>
              {isCoach && (
                <Pressable onPress={() => setSelectedCoachClientId(null)} style={styles.backButton}>
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    Indietro
                  </ThemedText>
                </Pressable>
              )}
              <ThemedText type="title" style={styles.title}>
                {isCoach && selectedClient ? clientFullName(selectedClient) : 'Chat con il coach'}
              </ThemedText>
            </View>
          }
          ListEmptyComponent={
            <ThemedText type="small" themeColor="textSecondary">
              {isCoach
                ? 'Nessun messaggio con questo cliente. Scrivi il primo messaggio qui sotto.'
                : 'Nessun messaggio ancora. Scrivi al tuo coach qui sotto.'}
            </ThemedText>
          }
          renderItem={({ item }) => <MessageBubble message={item} isCoach={isCoach} />}
        />
        <View
          style={[
            styles.inputRow,
            {
              borderTopColor: theme.border,
              paddingBottom: insets.bottom + (Platform.OS === 'web' ? BottomTabInset + Spacing.two : Spacing.two),
            },
          ]}>
          <ThemedTextInput
            style={styles.input}
            placeholder={isCoach && selectedClient ? `Scrivi a ${clientFullName(selectedClient)}` : 'Scrivi un messaggio...'}
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <Pressable onPress={handleSend} disabled={sendDisabled}>
            <View style={[styles.sendButton, { backgroundColor: theme.primary }, sendDisabled && styles.sendButtonDisabled]}>
              <ThemedText type="smallBold" themeColor="onPrimary">
                Invia
              </ThemedText>
            </View>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
}

function CoachConversationList({
  conversations,
  insetsTop,
  onNewConversation,
  onSelect,
}: {
  conversations: CoachConversation[];
  insetsTop: number;
  onNewConversation: () => void;
  onSelect: (clientId: string) => void;
}) {
  const theme = useTheme();

  return (
    <ScreenBackground>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.client.id}
        contentContainerStyle={[
          styles.list,
          { paddingTop: Platform.OS === 'web' ? Spacing.four : insetsTop + Spacing.three },
        ]}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <ThemedText type="title" style={styles.title}>
              Messaggi
            </ThemedText>
            <Pressable onPress={onNewConversation} accessibilityLabel="Nuova conversazione">
              <View style={[styles.addButton, { backgroundColor: theme.primary }]}>
                <ThemedText type="title" themeColor="onPrimary" style={styles.addButtonText}>
                  +
                </ThemedText>
              </View>
            </Pressable>
          </View>
        }
        ListEmptyComponent={
          <View style={[styles.emptyBox, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <ThemedText type="subtitle">Nessun messaggio</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Quando un cliente ti scrive, la conversazione comparira qui. Usa + per iniziare tu.
            </ThemedText>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => onSelect(item.client.id)}>
            <View style={[styles.conversationRow, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <View style={styles.conversationMain}>
                <View style={styles.conversationTitleRow}>
                  <ThemedText type="smallBold" numberOfLines={1} style={styles.conversationName}>
                    {clientFullName(item.client)}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatConversationTime(item.lastMessage.createdAt)}
                  </ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {item.lastMessage.text}
                </ThemedText>
              </View>
              {item.unreadCount > 0 && <UnreadBadge count={item.unreadCount} />}
            </View>
          </Pressable>
        )}
      />
    </ScreenBackground>
  );
}

function CoachClientSelector({
  clients,
  insetsTop,
  onCancel,
  onSelect,
}: {
  clients: Client[];
  insetsTop: number;
  onCancel: () => void;
  onSelect: (clientId: string) => void;
}) {
  const theme = useTheme();

  return (
    <ScreenBackground>
      <FlatList
        data={clients}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.list,
          { paddingTop: Platform.OS === 'web' ? Spacing.four : insetsTop + Spacing.three },
        ]}
        ListHeaderComponent={
          <View style={styles.header}>
            <Pressable onPress={onCancel} style={styles.backButton}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Annulla
              </ThemedText>
            </Pressable>
            <ThemedText type="title" style={styles.title}>
              Nuovo messaggio
            </ThemedText>
          </View>
        }
        ListEmptyComponent={
          <View style={[styles.emptyBox, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <ThemedText type="subtitle">Tutti i clienti sono gia in lista</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Apri una conversazione esistente per continuare a scrivere.
            </ThemedText>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => onSelect(item.id)}>
            <View style={[styles.clientRow, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <ThemedText type="smallBold">{clientFullName(item)}</ThemedText>
            </View>
          </Pressable>
        )}
      />
    </ScreenBackground>
  );
}

function MessageBubble({ message, isCoach }: { message: ChatMessage; isCoach: boolean }) {
  const theme = useTheme();
  const isMine = isCoach ? message.sender === 'coach' : message.sender === 'client';
  return (
    <View style={[styles.bubbleRow, isMine ? styles.bubbleRowRight : styles.bubbleRowLeft]}>
      <View
        style={[
          styles.bubble,
          { backgroundColor: isMine ? theme.primary : theme.backgroundElement, borderColor: theme.border },
        ]}>
        <ThemedText type="small" themeColor={isMine ? 'onPrimary' : 'text'}>
          {message.text}
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.bubbleTime}>
        {formatTime(message.createdAt)}
      </ThemedText>
    </View>
  );
}

function UnreadBadge({ count }: { count: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.unreadBadge, { backgroundColor: theme.primary }]}>
      <ThemedText type="smallBold" themeColor="onPrimary" style={styles.unreadBadgeText}>
        {count > 99 ? '99+' : String(count)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  list: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
    flexGrow: 1,
  },
  header: {
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  listHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.one,
  },
  addButton: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  addButtonText: {
    fontSize: 28,
    lineHeight: 30,
  },
  emptyBox: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.one,
    padding: Spacing.three,
  },
  conversationRow: {
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  conversationMain: {
    flex: 1,
    gap: Spacing.one,
    minWidth: 0,
  },
  conversationTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  conversationName: {
    flex: 1,
  },
  clientRow: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
  unreadBadge: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    minWidth: 22,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  unreadBadgeText: {
    fontSize: 11,
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
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  bubbleTime: {
    fontSize: 11,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    maxHeight: 100,
  },
  sendButton: {
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
