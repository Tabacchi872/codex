import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useEffectiveColorScheme } from '@/hooks/use-effective-color-scheme';
import { AppColors } from '@/theme';

// Tab bar lato cliente: 5 voci (Home/Workout/Nutrizione/Chat/Altro). Le altre
// schermate cliente (Profilo, Prenotazioni, Bacheca, Questionario, Progressi...)
// restano raggiungibili da dentro Altro/Home, non come tab dirette — 5 è il
// numero massimo ragionevole per una tab bar mobile leggibile.
// Stessi ruoli colore della tab bar coach (app-tabs.tsx): NativeTabs è una
// tab bar nativa OS, non replica la pillola/blur custom del mockup — vedi
// docs/DECISIONS.md.
export default function ClientTabs() {
  const scheme = useEffectiveColorScheme();
  const colors = AppColors[scheme];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.coralSoft}
      tintColor={colors.coral}
      labelStyle={{ selected: { color: colors.ink }, default: { color: colors.inkFaint } }}>
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
