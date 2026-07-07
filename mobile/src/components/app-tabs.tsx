import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { Colors } from '@/constants/theme';
import { useEffectiveColorScheme } from '@/hooks/use-effective-color-scheme';
import { useChatStore } from '@/store/chat-store';

export default function AppTabs() {
  const scheme = useEffectiveColorScheme();
  const colors = Colors[scheme];
  const unreadMessagesCount = useChatStore(
    (s) => s.messages.filter((message) => message.sender === 'client' && !message.readByCoachAt).length
  );

  return (
    <NativeTabs
      backgroundColor={colors.background}
      badgeBackgroundColor={colors.primary}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Dashboard</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'gauge', selected: 'gauge.with.needle.fill' }} md="dashboard" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="clienti">
        <NativeTabs.Trigger.Label>Clienti</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.2', selected: 'person.2.fill' }} md="people" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="esercizi">
        <NativeTabs.Trigger.Label>Esercizi</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="figure.strengthtraining.traditional" md="fitness_center" />
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

      <NativeTabs.Trigger name="impostazioni">
        <NativeTabs.Trigger.Label>Impostazioni</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gearshape" md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
