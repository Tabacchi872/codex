import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useEffectiveColorScheme } from '@/hooks/use-effective-color-scheme';
import { useChatStore } from '@/store/chat-store';
import { AppColors } from '@/theme';

// Colori della tab bar nativa (expo-router NativeTabs, iOS/Android renderano
// una tab bar di sistema, non un componente React Native custom): non
// replica esattamente la pillola/blur del mockup (fuori portata delle prop
// esposte da NativeTabs), ma applica gli stessi ruoli semantici — sfondo
// cream/dark, pillola coralSoft dietro l'icona attiva, coral per l'icona/
// badge attivi, inkFaint per le voci inattive — vedi docs/DECISIONS.md.
export default function AppTabs() {
  const scheme = useEffectiveColorScheme();
  const colors = AppColors[scheme];
  const unreadMessagesCount = useChatStore(
    (s) => s.messages.filter((message) => message.sender === 'client' && !message.readByCoachAt).length
  );

  return (
    <NativeTabs
      backgroundColor={colors.background}
      tintColor={colors.coral}
      badgeBackgroundColor={colors.coral}
      indicatorColor={colors.coralSoft}
      labelStyle={{ selected: { color: colors.ink }, default: { color: colors.inkFaint } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'gauge', selected: 'gauge.with.needle.fill' }} md="dashboard" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="clienti">
        <NativeTabs.Trigger.Label>Clienti</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.2', selected: 'person.2.fill' }} md="people" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="schede">
        <NativeTabs.Trigger.Label>Schede</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'list.clipboard', selected: 'list.clipboard.fill' }} md="assignment" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="appuntamenti">
        <NativeTabs.Trigger.Label>Agenda</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar" md="event" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="chat">
        <NativeTabs.Trigger.Label>Messaggi</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'bubble.left.and.bubble.right', selected: 'bubble.left.and.bubble.right.fill' }} md="chat" />
        <NativeTabs.Trigger.Badge hidden={unreadMessagesCount === 0}>
          {unreadMessagesCount > 99 ? '99+' : String(unreadMessagesCount)}
        </NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
