import { Slot, usePathname, useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { WebTabBarHeight } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const TABS = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/clienti', label: 'Clienti', icon: '👥' },
  { path: '/esercizi', label: 'Esercizi', icon: '🏋️' },
  { path: '/schede', label: 'Schede', icon: '📋' },
  { path: '/appuntamenti', label: 'Agenda', icon: '📅' },
  { path: '/chat', label: 'Chat', icon: '💬' },
  { path: '/impostazioni', label: 'Impostazioni', icon: '⚙️' },
] as const satisfies readonly { path: Href; label: string; icon: string }[];

export default function AppTabs() {
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
          const isActive = pathname === tab.path || (tab.path !== '/' && pathname.startsWith(`${tab.path}/`));
          return (
            <Pressable key={tab.path.toString()} onPress={() => router.push(tab.path)} style={styles.tabItem}>
              <View style={[styles.activeIndicator, isActive && { backgroundColor: theme.primary }]} />
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
    paddingTop: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
    paddingHorizontal: 4,
  },
  activeIndicator: {
    width: 20,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  tabIcon: {
    fontSize: 17,
    lineHeight: 20,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  tabLabelActive: {
    fontWeight: '700',
  },
});
