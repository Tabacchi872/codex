import { useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { ThemedTextInput } from '@/components/themed-text-input';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/store/auth-store';
import { useChatStore } from '@/store/chat-store';
import type { ChatMessage } from '@/types/chat';

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Chat locale con il coach: invio reale nello store persistito, ma senza
// backend/realtime il coach non la riceve su un altro dispositivo — limite
// dichiarato nel report tecnico, non in UI (nessuna scritta "demo").
export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const currentClientId = useAuthStore((s) => s.currentClientId);
  const messages = useChatStore((s) => s.messages);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const [draft, setDraft] = useState('');

  const myMessages = useMemo(
    () =>
      messages
        .filter((m) => m.clientId === currentClientId)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [messages, currentClientId]
  );

  function handleSend() {
    const text = draft.trim();
    if (!text || !currentClientId) return;
    const message: ChatMessage = {
      id: `chat-${Date.now()}`,
      clientId: currentClientId,
      sender: 'client',
      text,
      createdAt: new Date().toISOString(),
    };
    sendMessage(message);
    setDraft('');
  }

  return (
    <ScreenBackground>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          data={myMessages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            { paddingTop: Platform.OS === 'web' ? Spacing.four : insets.top + Spacing.three },
          ]}
          ListHeaderComponent={
            <ThemedText type="title" style={styles.title}>
              Chat con il coach
            </ThemedText>
          }
          ListEmptyComponent={
            <ThemedText type="small" themeColor="textSecondary">
              Nessun messaggio ancora. Scrivi al tuo coach qui sotto.
            </ThemedText>
          }
          renderItem={({ item }) => <MessageBubble message={item} />}
        />
        <View
          style={[
            styles.inputRow,
            { borderTopColor: theme.border, paddingBottom: insets.bottom + (Platform.OS === 'web' ? BottomTabInset + Spacing.two : Spacing.two) },
          ]}>
          <ThemedTextInput
            style={styles.input}
            placeholder="Scrivi un messaggio…"
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <Pressable onPress={handleSend} disabled={!draft.trim()}>
            <View style={[styles.sendButton, { backgroundColor: theme.primary }, !draft.trim() && styles.sendButtonDisabled]}>
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

function MessageBubble({ message }: { message: ChatMessage }) {
  const theme = useTheme();
  const isClient = message.sender === 'client';
  return (
    <View style={[styles.bubbleRow, isClient ? styles.bubbleRowRight : styles.bubbleRowLeft]}>
      <View
        style={[
          styles.bubble,
          { backgroundColor: isClient ? theme.primary : theme.backgroundElement, borderColor: theme.border },
        ]}>
        <ThemedText type="small" themeColor={isClient ? 'onPrimary' : 'text'}>
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
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
    marginBottom: Spacing.two,
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
