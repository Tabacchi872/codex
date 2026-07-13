import { Slot, usePathname, useRouter, type Href } from 'expo-router';
import { Apple, Dumbbell, House, Menu, MessageCircle, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppRadius, AppSpacing, useAppTheme } from '@/theme';

const TABS: { path: Href; label: string; icon: LucideIcon }[] = [
  { path: '/cliente-home', label: 'Home', icon: House },
  { path: '/workout', label: 'Workout', icon: Dumbbell },
  { path: '/nutrizione', label: 'Nutrizione', icon: Apple },
  { path: '/chat', label: 'Chat', icon: MessageCircle },
  { path: '/altro', label: 'Altro', icon: Menu },
];

// BUG CORRETTO (2026-07-05): la versione precedente usava le Tabs "headless" di
// expo-router/ui (<Tabs><TabSlot/><TabList>...). Quel componente registra come
// navigabili SOLO le rotte elencate come <TabTrigger>: qualunque altra rotta
// (Prenotazioni, Bacheca, Questionario, Profilo, Progressi, il dettaglio scheda
// aperto da "Allenamenti"...) restava irraggiungibile finché il cliente era
// dentro quel navigator — da qui "clic su Nutrizione funziona (è un trigger),
// poi non si naviga più" (tutto il resto non lo era). Qui invece si usa `Slot`,
// il primitivo standard di Expo Router: renderizza SEMPRE la rotta reale
// corrente, qualunque essa sia, senza una lista chiusa di schermi ammessi. La
// tab bar sotto è un semplice router.push + confronto con usePathname(): nessun
// meccanismo di navigazione "nascosto" che possa disallinearsi.
//
// File .web.tsx: Metro lo usa al posto di client-tabs.tsx SOLO sul bundle web
// (le NativeTabs di expo-router non hanno un rendering web soddisfacente).
// Migrato al nuovo design system (2026-07-11): stesso linguaggio della tab bar
// del mockup (pillola coralSoft dietro l'icona attiva, icone lucide-react-native
// reali al posto delle emoji, stesso comportamento di navigazione invariato).
export default function ClientTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const { colors } = useAppTheme();

  return (
    <View style={styles.container}>
      <View style={styles.slot}>
        <Slot screenOptions={{ headerShown: false }} />
      </View>
      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        {TABS.map((tab) => {
          const pathStr = tab.path.toString();
          const isActive = pathname === pathStr;
          const Icon = tab.icon;
          return (
            <Pressable key={pathStr} onPress={() => router.push(tab.path)} hitSlop={4} style={styles.tabItem}>
              <View style={[styles.iconPill, isActive && { backgroundColor: colors.coralSoft }]}>
                <Icon size={19} color={isActive ? colors.coral : colors.inkFaint} strokeWidth={2} />
              </View>
              <Text
                numberOfLines={1}
                style={[styles.tabLabel, { color: isActive ? colors.ink : colors.inkFaint, fontWeight: isActive ? '700' : '500' }]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  slot: {
    flex: 1,
  },
  tabBar: {
    height: 66,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: AppSpacing[1],
    paddingBottom: AppSpacing[2],
    zIndex: 20,
    elevation: 20,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 3,
    minHeight: 44,
    minWidth: 0,
    paddingHorizontal: 2,
  },
  iconPill: {
    width: 40,
    height: 26,
    borderRadius: AppRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 10,
    lineHeight: 13,
    maxWidth: '100%',
    textAlign: 'center',
  },
});
