import { router, useLocalSearchParams } from 'expo-router';
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
        .filter((message) => message.coachId === coachId)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [coachId, messages],
  );

  useEffect(() => {
    if (coachId) markCoachSupportReadBySuperadmin(coachId);
  }, [coachId, markCoachSupportReadBySuperadmin]);

  function handleSend() {
    const text = draft.trim();
    if (!coachId || !text) return;
    sendSupportMessageAsSuperadmin(coachId, text);
    setDraft('');
  }

  if (!coach || !coachId) {
    return (
      <SuperadminShell title="Chat coach" description="Conversazione non trovata.">
        <Card style={styles.card}>
          <ThemedText type="smallBold">Coach non trovato</ThemedText>
          <Pressable onPress={() => router.push('/superadmin/support/index')}>
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
    <SuperadminShell title={coach.name} description={coach.email}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <Pressable onPress={() => router.push('/superadmin/support/index')} style={styles.backButton}>
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
          <Pressable onPress={handleSend} disabled={sendDisabled}>
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
  keyboard: {
    gap: Spacing.two,
  },
  card: {
    gap: Spacing.two,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.one,
  },
  messagesCard: {
    gap: Spacing.two,
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
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.two,
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
