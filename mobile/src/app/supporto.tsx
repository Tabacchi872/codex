import { Redirect } from 'expo-router';
import { Send } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CoachInviteCodeCard } from '@/components/coach-invite-code-card';
import { AppCard, AppIconButton, AppTextField, BackHeader } from '@/components/ui';
import { BottomTabInset } from '@/constants/theme';
import { useAuthStore } from '@/store/auth-store';
import { useSuperadminStore } from '@/store/superadmin-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import type { CoachSupportMessage } from '@/types/superadmin';

export default function CoachSupportScreen() {
  const currentRole = useAuthStore((s) => s.currentRole);
  const currentCoachId = useAuthStore((s) => s.currentCoachId);
  const currentUserEmail = useAuthStore((s) => s.currentUserEmail);
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const coaches = useSuperadminStore((s) => s.coaches);
  const messages = useSuperadminStore((s) => s.coachSupportMessages);
  const sendSupportMessageAsCoach = useSuperadminStore((s) => s.sendSupportMessageAsCoach);
  const markCoachSupportReadByCoach = useSuperadminStore((s) => s.markCoachSupportReadByCoach);
  const [draft, setDraft] = useState('');

  const coach = coaches.find((item) => item.id === currentCoachId) ?? coaches.find((item) => item.email === currentUserEmail) ?? coaches[0];
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
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: Platform.OS === 'web' ? AppSpacing[5] : insets.top + AppSpacing[3], paddingBottom: AppSpacing[3] },
          ]}>
          <View style={styles.header}>
            <BackHeader title="Supporto" fallbackHref="/impostazioni" />
            <Text style={[styles.subtitle, { color: colors.inkSoft }]}>
              Chat interna con il superadmin per assistenza e comunicazioni amministrative.
            </Text>
          </View>

          <CoachInviteCodeCard title="Codice coach" copyLabel="Copia" />

          <AppCard style={styles.messagesCard}>
            {conversationMessages.length === 0 ? (
              <Text style={[styles.smallText, { color: colors.inkSoft }]}>Nessun messaggio ancora. Scrivi al superadmin qui sotto.</Text>
            ) : (
              conversationMessages.map((message) => <MessageBubble key={message.id} message={message} />)
            )}
          </AppCard>
        </ScrollView>

        <View
          style={[
            styles.inputRow,
            {
              borderTopColor: colors.border,
              backgroundColor: colors.surface,
              paddingBottom: insets.bottom + (Platform.OS === 'web' ? BottomTabInset + AppSpacing[2] : AppSpacing[2]),
            },
          ]}>
          <View style={styles.inputWrap}>
            <AppTextField placeholder="Scrivi al superadmin..." value={draft} onChangeText={setDraft} multiline style={styles.input} />
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

function MessageBubble({ message }: { message: CoachSupportMessage }) {
  const { colors } = useAppTheme();
  const isMine = message.sender === 'coach';
  return (
    <View style={[styles.bubbleRow, isMine ? styles.bubbleRight : styles.bubbleLeft]}>
      <View
        style={[
          styles.bubble,
          isMine ? { backgroundColor: colors.coral, borderColor: colors.coral } : { backgroundColor: colors.surfaceSubtle, borderColor: colors.border },
        ]}>
        <Text style={[styles.bubbleText, { color: isMine ? colors.onCoral : colors.ink }]}>{message.text}</Text>
      </View>
      <Text style={[styles.timeText, { color: colors.inkFaint }]}>{formatTime(message.createdAt)}</Text>
    </View>
  );
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    gap: AppSpacing[3],
    paddingHorizontal: AppSpacing[5],
  },
  header: {
    gap: 4,
  },
  subtitle: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
  },
  messagesCard: {
    gap: AppSpacing[2],
    minHeight: 320,
  },
  smallText: {
    fontSize: AppFontSize.sm,
  },
  bubbleRow: {
    maxWidth: '84%',
    gap: 2,
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
    paddingHorizontal: AppSpacing[3],
    paddingVertical: AppSpacing[2],
  },
  bubbleText: {
    fontSize: AppFontSize.sm,
  },
  timeText: {
    fontSize: 11,
  },
  inputRow: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: AppSpacing[2],
    paddingHorizontal: AppSpacing[5],
    paddingTop: AppSpacing[2],
  },
  inputWrap: {
    flex: 1,
  },
  input: {
    maxHeight: 100,
  },
});
