import { Slot, usePathname, useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { WebTabBarHeight } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useChatStore } from '@/store/chat-store';

const TABS = [
  { path: '/', label: 'Home', icon: '⌂' },
  { path: '/clienti', label: 'Clienti', icon: '👥' },
  { path: '/schede', label: 'Schede', icon: '📋' },
  { path: '/appuntamenti', label: 'Agenda', icon: '📅' },
  { path: '/chat', label: 'Messaggi', icon: '💬' },
] as const satisfies readonly { path: Href; label: string; icon: string }[];

export default function AppTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const theme = useTheme();
  const unreadMessagesCount = useChatStore(
    (s) => s.messages.filter((message) => message.sender === 'client' && !message.readByCoachAt).length
  );

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
              <View>
                <Text style={[styles.tabIcon, { opacity: isActive ? 1 : 0.6 }]}>{tab.icon}</Text>
                {tab.path === '/chat' && unreadMessagesCount > 0 && (
                  <View style={[styles.badge, { backgroundColor: theme.primary }]}>
                    <Text style={styles.badgeText}>{unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}</Text>
                  </View>
                )}
              </View>
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
    gap: 5,
    paddingHorizontal: 2,
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
  badge: {
    alignItems: 'center',
    borderRadius: 999,
    minWidth: 17,
    paddingHorizontal: 5,
    paddingVertical: 1,
    position: 'absolute',
    right: -10,
    top: -6,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 14,
  },
  tabLabelActive: {
    fontWeight: '700',
  },
});
