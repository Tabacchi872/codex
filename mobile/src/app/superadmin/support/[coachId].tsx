import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { SuperadminShell } from '@/components/superadmin-shell';
import { ThemedText } from '@/components/themed-text';
import { ThemedTextInput } from '@/components/themed-text-input';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSuperadminStore } from '@/store/superadmin-store';
import type { CoachSupportMessage } from '@/types/superadmin';

export default function SuperadminCoachSupportDetail() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ coachId?: string }>();
  const coachId = Array.isArray(params.coachId) ? params.coachId[0] : params.coachId;
  const coaches = useSuperadminStore((s) => s.coaches);
  const messages = useSuperadminStore((s) => s.coachSupportMessages);
  const sendSupportMessageAsSuperadmin = useSuperadminStore((s) => s.sendSupportMessageAsSuperadmin);
  const markCoachSupportReadBySuperadmin = useSuperadminStore((s) => s.markCoachSupportReadBySuperadmin);
  const [draft, setDraft] = useState('');

  const coach = coaches.find((item) => item.id === coachId);
  const conversationMessages = useMemo(
    () =>
      messages
        .filter((message) => message.coachId === coach?.id)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [coach?.id, messages],
  );

  useEffect(() => {
    if (coach?.id) markCoachSupportReadBySuperadmin(coach.id);
  }, [coach?.id, markCoachSupportReadBySuperadmin]);

  function handleSend() {
    const text = draft.trim();
    if (!coach || !text) return;
    sendSupportMessageAsSuperadmin(coach.id, text);
    setDraft('');
  }

  if (!coach || !coachId) {
    return (
      <SuperadminShell title="Chat coach" description="Conversazione non trovata." contentStyle={styles.shellContent}>
        <Card style={styles.card}>
          <ThemedText type="smallBold">Coach non trovato</ThemedText>
          <Pressable onPress={() => router.push('/superadmin/support' as Href)} hitSlop={8}>
            <ThemedText type="smallBold" style={{ color: theme.primary }}>
              Torna al supporto
            </ThemedText>
          </Pressable>
        </Card>
      </SuperadminShell>
    );
  }

  const sendDisabled = !draft.trim();

  return (
    <SuperadminShell title={coach.name} description={coach.email} contentStyle={styles.shellContent}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <Pressable onPress={() => router.push('/superadmin/support' as Href)} hitSlop={8} style={styles.backButton}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Indietro
          </ThemedText>
        </Pressable>

        <Card style={styles.messagesCard}>
          {conversationMessages.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Nessun messaggio in questa conversazione.
            </ThemedText>
          ) : (
            conversationMessages.map((message) => <MessageBubble key={message.id} message={message} />)
          )}
        </Card>

        <View style={[styles.inputRow, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
          <ThemedTextInput
            style={styles.input}
            placeholder={`Rispondi a ${coach.name}`}
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <Pressable onPress={handleSend} disabled={sendDisabled} hitSlop={6}>
            <View style={[styles.sendButton, { backgroundColor: theme.primary }, sendDisabled && styles.disabled]}>
              <ThemedText type="smallBold" themeColor="onPrimary">
                Invia
              </ThemedText>
            </View>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SuperadminShell>
  );
}

function MessageBubble({ message }: { message: CoachSupportMessage }) {
  const theme = useTheme();
  const isMine = message.sender === 'superadmin';
  return (
    <View style={[styles.bubbleRow, isMine ? styles.bubbleRight : styles.bubbleLeft]}>
      <View
        style={[
          styles.bubble,
          { backgroundColor: isMine ? theme.primary : theme.background, borderColor: theme.border },
        ]}>
        <ThemedText type="small" themeColor={isMine ? 'onPrimary' : 'text'} style={styles.messageText}>
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
  shellContent: {
    maxWidth: '100%',
    width: '100%',
  },
  keyboard: {
    gap: Spacing.two,
    maxWidth: '100%',
    width: '100%',
  },
  card: {
    gap: Spacing.two,
    maxWidth: '100%',
    width: '100%',
  },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    paddingVertical: Spacing.one,
  },
  messagesCard: {
    gap: Spacing.two,
    maxWidth: '100%',
    overflow: 'hidden',
    width: '100%',
  },
  bubbleRow: {
    maxWidth: '84%',
    gap: Spacing.half,
    minWidth: 0,
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
    maxWidth: '100%',
    minWidth: 0,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  messageText: {
    flexShrink: 1,
    minWidth: 0,
  },
  timeText: {
    fontSize: 11,
    lineHeight: 14,
  },
  inputRow: {
    alignItems: 'flex-end',
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.two,
    maxWidth: '100%',
    padding: Spacing.two,
    width: '100%',
  },
  input: {
    flex: 1,
    maxHeight: 100,
    minWidth: 0,
  },
  sendButton: {
    borderRadius: Radius.md,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  disabled: {
    opacity: 0.5,
  },
});
