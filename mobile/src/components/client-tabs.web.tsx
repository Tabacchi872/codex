import { Slot, usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { WebTabBarHeight } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const TABS = [
  { path: '/cliente-home', label: 'Home', icon: '🏠' },
  { path: '/workout', label: 'Workout', icon: '💪' },
  { path: '/nutrizione', label: 'Nutrizione', icon: '🍎' },
  { path: '/chat', label: 'Chat', icon: '💬' },
  { path: '/altro', label: 'Altro', icon: '☰' },
] as const;

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
export default function ClientTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.slot}>
        <Slot screenOptions={{ headerShown: false }} />
      </View>
      <View style={[styles.tabBar, { backgroundColor: theme.backgroundElement, borderTopColor: theme.border }]}>
        {TABS.map((tab) => {
          const isActive = pathname === tab.path;
          return (
            <Pressable key={tab.path} onPress={() => router.push(tab.path)} style={styles.tabItem}>
              <Text style={[styles.tabIcon, { opacity: isActive ? 1 : 0.6 }]}>{tab.icon}</Text>
              <Text
                numberOfLines={1}
                style={[
                  styles.tabLabel,
                  { color: isActive ? theme.primary : theme.textSecondary },
                  isActive && styles.tabLabelActive,
                ]}>
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
    height: WebTabBarHeight,
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: 6,
    paddingTop: 6,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 2,
    paddingHorizontal: 2,
  },
  tabIcon: {
    fontSize: 18,
    lineHeight: 22,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  tabLabelActive: {
    fontWeight: '700',
  },
});
