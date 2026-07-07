import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { Colors } from '@/constants/theme';
import { useEffectiveColorScheme } from '@/hooks/use-effective-color-scheme';

// Tab bar lato cliente: 5 voci (Home/Workout/Nutrizione/Chat/Altro). Le altre
// schermate cliente (Profilo, Prenotazioni, Bacheca, Questionario, Progressi...)
// restano raggiungibili da dentro Altro/Home, non come tab dirette — 5 è il
// numero massimo ragionevole per una tab bar mobile leggibile.
export default function ClientTabs() {
  const scheme = useEffectiveColorScheme();
  const colors = Colors[scheme];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      tintColor={colors.primary}
      labelStyle={{ selected: { color: colors.primary }, default: { color: colors.textSecondary } }}>
      <NativeTabs.Trigger name="cliente-home">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="workout">
        <NativeTabs.Trigger.Label>Workout</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'dumbbell', selected: 'dumbbell.fill' }} md="fitness_center" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="nutrizione">
        <NativeTabs.Trigger.Label>Nutrizione</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="fork.knife" md="restaurant" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="chat">
        <NativeTabs.Trigger.Label>Chat</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'bubble.left.and.bubble.right', selected: 'bubble.left.and.bubble.right.fill' }} md="chat" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="altro">
        <NativeTabs.Trigger.Label>Altro</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="line.3.horizontal" md="menu" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
