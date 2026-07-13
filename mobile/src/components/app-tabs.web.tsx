import { Slot, usePathname, useRouter, type Href } from 'expo-router';
import { Calendar, ClipboardList, House, MessageCircle, Users, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useChatStore } from '@/store/chat-store';
import { AppRadius, AppSpacing, useAppTheme } from '@/theme';

const TABS: { path: Href; label: string; icon: LucideIcon }[] = [
  { path: '/', label: 'Home', icon: House },
  { path: '/clienti', label: 'Clienti', icon: Users },
  { path: '/schede', label: 'Schede', icon: ClipboardList },
  { path: '/appuntamenti', label: 'Agenda', icon: Calendar },
  { path: '/chat', label: 'Messaggi', icon: MessageCircle },
];

// File .web.tsx: Metro lo usa al posto di app-tabs.tsx SOLO sul bundle web (le
// NativeTabs di expo-router non hanno un rendering web soddisfacente). Migrato
// al nuovo design system (2026-07-11): stesso linguaggio della tab bar del
// mockup (pillola coralSoft dietro l'icona attiva, icone lucide-react-native
// reali al posto delle emoji), badge messaggi non letti invariato.
export default function AppTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const { colors } = useAppTheme();
  const unreadMessagesCount = useChatStore(
    (s) => s.messages.filter((message) => message.sender === 'client' && !message.readByCoachAt).length
  );

  return (
    <View style={styles.container}>
      <View style={styles.slot}>
        <Slot screenOptions={{ headerShown: false }} />
      </View>
      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        {TABS.map((tab) => {
          const pathStr = tab.path.toString();
          const isActive = pathname === pathStr || (pathStr !== '/' && pathname.startsWith(`${pathStr}/`));
          const Icon = tab.icon;
          return (
            <Pressable key={pathStr} onPress={() => router.push(tab.path)} hitSlop={4} style={styles.tabItem}>
              <View style={[styles.iconPill, isActive && { backgroundColor: colors.coralSoft }]}>
                <Icon size={19} color={isActive ? colors.coral : colors.inkFaint} strokeWidth={2} />
                {tab.path === '/chat' && unreadMessagesCount > 0 ? (
                  <View style={[styles.badge, { backgroundColor: colors.coral }]}>
                    <Text style={styles.badgeText}>{unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}</Text>
                  </View>
                ) : null}
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
  badge: {
    alignItems: 'center',
    borderRadius: AppRadius.pill,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    position: 'absolute',
    right: -8,
    top: -6,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
  },
  tabLabel: {
    fontSize: 10,
    lineHeight: 13,
    maxWidth: '100%',
    textAlign: 'center',
  },
});
