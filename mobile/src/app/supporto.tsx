import { Redirect } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { ThemedTextInput } from '@/components/themed-text-input';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/store/auth-store';
import { useSuperadminStore } from '@/store/superadmin-store';
import type { CoachSupportMessage } from '@/types/superadmin';

export default function CoachSupportScreen() {
  const currentRole = useAuthStore((s) => s.currentRole);
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const coaches = useSuperadminStore((s) => s.coaches);
  const messages = useSuperadminStore((s) => s.coachSupportMessages);
  const sendSupportMessageAsCoach = useSuperadminStore((s) => s.sendSupportMessageAsCoach);
  const markCoachSupportReadByCoach = useSuperadminStore((s) => s.markCoachSupportReadByCoach);
  const [draft, setDraft] = useState('');

  const coach = coaches[0];
  const conversationMessages = useMemo(
    () =>
      messages
        .filter((message) => message.coachId === coach?.id)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [coach?.id, messages],
  );

  useEffect(() => {
    if (coach?.id) markCoachSupportReadByCoach(coach.id);
  }, [coach?.id, markCoachSupportReadByCoach]);

  if (currentRole !== 'coach') {
    return <Redirect href="/" />;
  }

  function handleSend() {
    const text = draft.trim();
    if (!coach?.id || !text) return;
    sendSupportMessageAsCoach(coach.id, text);
    setDraft('');
  }

  const sendDisabled = !draft.trim();

  return (
    <ScreenBackground>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: Platform.OS === 'web' ? Spacing.five : insets.top + Spacing.three,
              paddingBottom: Spacing.three,
            },
          ]}>
          <View style={styles.header}>
            <ThemedText type="title" style={styles.title}>
              Supporto
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Chat interna con il superadmin per assistenza e comunicazioni amministrative.
            </ThemedText>
          </View>

          <Card style={styles.messagesCard}>
            {conversationMessages.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                Nessun messaggio ancora. Scrivi al superadmin qui sotto.
              </ThemedText>
            ) : (
              conversationMessages.map((message) => <MessageBubble key={message.id} message={message} />)
            )}
          </Card>
        </ScrollView>

        <View
          style={[
            styles.inputRow,
            {
              borderTopColor: theme.border,
              backgroundColor: theme.backgroundElement,
              paddingBottom: insets.bottom + (Platform.OS === 'web' ? BottomTabInset + Spacing.two : Spacing.two),
            },
          ]}>
          <ThemedTextInput
            style={styles.input}
            placeholder="Scrivi al superadmin..."
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <Pressable onPress={handleSend} disabled={sendDisabled}>
            <View style={[styles.sendButton, { backgroundColor: theme.primary }, sendDisabled && styles.disabled]}>
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

function MessageBubble({ message }: { message: CoachSupportMessage }) {
  const theme = useTheme();
  const isMine = message.sender === 'coach';
  return (
    <View style={[styles.bubbleRow, isMine ? styles.bubbleRight : styles.bubbleLeft]}>
      <View
        style={[
          styles.bubble,
          { backgroundColor: isMine ? theme.primary : theme.backgroundElement, borderColor: theme.border },
        ]}>
        <ThemedText type="small" themeColor={isMine ? 'onPrimary' : 'text'}>
          {message.text}
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.timeText}>
        {formatTime(message.createdAt)}
      </ThemedText>
    </View>
  );
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  header: {
    gap: Spacing.one,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 32,
  },
  messagesCard: {
    gap: Spacing.two,
    minHeight: 320,
  },
  bubbleRow: {
    maxWidth: '84%',
    gap: Spacing.half,
  },
  bubbleLeft: {
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
  },
  bubbleRight: {
    alignItems: 'flex-end',
    alignSelf: 'flex-end',
  },
  bubble: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  timeText: {
    fontSize: 11,
    lineHeight: 14,
  },
  inputRow: {
    alignItems: 'flex-end',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
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
  disabled: {
    opacity: 0.5,
  },
});
