import { useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const currentRole = useAuthStore((s) => s.currentRole);
  const currentClientId = useAuthStore((s) => s.currentClientId);
  const clients = useClientStore((s) => s.clients);
  const messages = useChatStore((s) => s.messages);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const [draft, setDraft] = useState('');
  const [selectedCoachClientId, setSelectedCoachClientId] = useState('');

  const isCoach = currentRole === 'coach';
  const selectedClientId = isCoach ? selectedCoachClientId || clients[0]?.id || '' : currentClientId || '';
  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId),
    [clients, selectedClientId]
  );

  const threadMessages = useMemo(
    () =>
      messages
        .filter((m) => m.clientId === selectedClientId)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [messages, selectedClientId]
  );

  function handleSend() {
    const text = draft.trim();
    if (!text || !selectedClientId) return;
    const message: ChatMessage = {
      id: `chat-${Date.now()}`,
      clientId: selectedClientId,
      sender: isCoach ? 'coach' : 'client',
      text,
      createdAt: new Date().toISOString(),
    };
    sendMessage(message);
    setDraft('');
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
              <ThemedText type="title" style={styles.title}>
                {isCoach ? 'Chat clienti' : 'Chat con il coach'}
              </ThemedText>
              {isCoach && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.clientChips}>
                  {clients.map((client) => {
                    const active = client.id === selectedClientId;
                    return (
                      <Pressable key={client.id} onPress={() => setSelectedCoachClientId(client.id)}>
                        <View
                          style={[
                            styles.clientChip,
                            {
                              backgroundColor: active ? theme.primary : theme.backgroundElement,
                              borderColor: active ? theme.primary : theme.border,
                            },
                          ]}>
                          <ThemedText type="small" themeColor={active ? 'onPrimary' : 'text'}>
                            {clientFullName(client)}
                          </ThemedText>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          }
          ListEmptyComponent={
            <ThemedText type="small" themeColor="textSecondary">
              {isCoach
                ? 'Nessun messaggio con questo cliente.'
                : 'Nessun messaggio ancora. Scrivi al tuo coach qui sotto.'}
            </ThemedText>
          }
          renderItem={({ item }) => <MessageBubble message={item} isCoach={isCoach} />}
        />
        <View
          style={[
            styles.inputRow,
            { borderTopColor: theme.border, paddingBottom: insets.bottom + (Platform.OS === 'web' ? BottomTabInset + Spacing.two : Spacing.two) },
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
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
  },
  clientChips: {
    gap: Spacing.two,
    paddingRight: Spacing.four,
  },
  clientChip: {
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
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
