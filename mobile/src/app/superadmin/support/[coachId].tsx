import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Send } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppCard, AppIconButton, AppTextField } from '@/components/ui';
import { SuperadminShell } from '@/components/superadmin-shell';
import { useSuperadminStore } from '@/store/superadmin-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import type { CoachSupportMessage } from '@/types/superadmin';

export default function SuperadminCoachSupportDetail() {
  const { colors } = useAppTheme();
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
        <AppCard style={styles.card}>
          <Text style={[styles.notFoundTitle, { color: colors.ink }]}>Coach non trovato</Text>
          <Pressable onPress={() => router.push('/superadmin/support' as Href)} hitSlop={8}>
            <Text style={[styles.backLink, { color: colors.moss }]}>Torna al supporto</Text>
          </Pressable>
        </AppCard>
      </SuperadminShell>
    );
  }

  const sendDisabled = !draft.trim();

  return (
    <SuperadminShell title={coach.name} description={coach.email} contentStyle={styles.shellContent}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <Pressable onPress={() => router.push('/superadmin/support' as Href)} hitSlop={8} style={styles.backButton}>
          <Text style={[styles.backLink, { color: colors.inkSoft }]}>Indietro</Text>
        </Pressable>

        <AppCard style={styles.messagesCard}>
          {conversationMessages.length === 0 ? (
            <Text style={[styles.smallText, { color: colors.inkSoft }]}>Nessun messaggio in questa conversazione.</Text>
          ) : (
            conversationMessages.map((message) => <MessageBubble key={message.id} message={message} />)
          )}
        </AppCard>

        <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={styles.inputWrap}>
            <AppTextField placeholder={`Rispondi a ${coach.name}`} value={draft} onChangeText={setDraft} multiline style={styles.input} />
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
    </SuperadminShell>
  );
}

function MessageBubble({ message }: { message: CoachSupportMessage }) {
  const { colors } = useAppTheme();
  const isMine = message.sender === 'superadmin';
  return (
    <View style={[styles.bubbleRow, isMine ? styles.bubbleRight : styles.bubbleLeft]}>
      <View
        style={[
          styles.bubble,
          isMine ? { backgroundColor: colors.coral, borderColor: colors.coral } : { backgroundColor: colors.surfaceSubtle, borderColor: colors.border },
        ]}>
        <Text style={[styles.messageText, { color: isMine ? colors.onCoral : colors.ink }]}>{message.text}</Text>
      </View>
      <Text style={[styles.timeText, { color: colors.inkFaint }]}>{formatTime(message.createdAt)}</Text>
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
    gap: AppSpacing[2],
    maxWidth: '100%',
    width: '100%',
  },
  card: {
    gap: AppSpacing[2],
    maxWidth: '100%',
    width: '100%',
  },
  notFoundTitle: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  backLink: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    paddingVertical: AppSpacing[1],
  },
  messagesCard: {
    gap: AppSpacing[2],
    maxWidth: '100%',
    overflow: 'hidden',
    width: '100%',
  },
  smallText: {
    fontSize: AppFontSize.sm,
  },
  bubbleRow: {
    maxWidth: '84%',
    gap: 2,
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
    borderRadius: AppRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '100%',
    minWidth: 0,
    paddingHorizontal: AppSpacing[3],
    paddingVertical: AppSpacing[2],
  },
  messageText: {
    fontSize: AppFontSize.sm,
    flexShrink: 1,
    minWidth: 0,
  },
  timeText: {
    fontSize: 11,
  },
  inputRow: {
    alignItems: 'center',
    borderRadius: AppRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: AppSpacing[2],
    maxWidth: '100%',
    padding: AppSpacing[2],
    width: '100%',
  },
  inputWrap: {
    flex: 1,
    minWidth: 0,
  },
  input: {
    maxHeight: 100,
  },
});
