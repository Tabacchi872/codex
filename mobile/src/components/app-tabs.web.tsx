import { Slot, usePathname, useRouter, type Href } from 'expo-router';
import { Calendar, ClipboardList, House, MessageCircle, Users, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { logCoachNavPress } from '@/lib/coach-navigation';
import { useChatStore } from '@/store/chat-store';
import { AppColors, AppRadius, AppSpacing } from '@/theme';

const TABS: { path: Href; label: string; icon: LucideIcon; source: string }[] = [
  { path: '/', label: 'Home', icon: House, source: 'coach-tab-home' },
  { path: '/clienti', label: 'Clienti', icon: Users, source: 'coach-tab-clienti' },
  { path: '/schede', label: 'Schede', icon: ClipboardList, source: 'coach-tab-schede' },
  { path: '/appuntamenti', label: 'Agenda', icon: Calendar, source: 'coach-tab-appuntamenti' },
  { path: '/chat', label: 'Messaggi', icon: MessageCircle, source: 'coach-tab-chat' },
];

// File .web.tsx: Metro lo usa al posto di app-tabs.tsx SOLO sul bundle web (le
// NativeTabs di expo-router non hanno un rendering web soddisfacente). Migrato
// al nuovo design system (2026-07-11): stesso linguaggio della tab bar del
// mockup (pillola coralSoft dietro l'icona attiva, icone lucide-react-native
// reali al posto delle emoji), badge messaggi non letti invariato.
export default function AppTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const colors = AppColors.dark;
  const unreadMessagesCount = useChatStore(
    (s) => s.messages.filter((message) => message.sender === 'client' && !message.readByCoachAt).length
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.slot}>
        <Slot screenOptions={{ headerShown: false }} />
      </View>
      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        {TABS.map((tab) => {
          const pathStr = tab.path.toString();
          const isActive = pathname === pathStr || (pathStr !== '/' && pathname.startsWith(`${pathStr}/`));
          const Icon = tab.icon;
          return (
            <Pressable
              key={pathStr}
              onPress={() => {
                logCoachNavPress(tab.source, pathStr);
                router.push(tab.path);
              }}
              hitSlop={4}
              style={styles.tabItem}>
              <View style={[styles.iconPill, isActive && { backgroundColor: colors.mossSoft, borderColor: colors.moss }]}>
                <Icon size={24} color={isActive ? colors.moss : colors.inkFaint} strokeWidth={2.35} />
                {tab.path === '/chat' && unreadMessagesCount > 0 ? (
                  <View style={[styles.badge, { backgroundColor: colors.coral }]} pointerEvents="none">
                    <Text style={styles.badgeText}>{unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}</Text>
                  </View>
                ) : null}
              </View>
              <Text
                numberOfLines={1}
                style={[styles.tabLabel, { color: isActive ? colors.moss : colors.inkFaint, fontWeight: isActive ? '700' : '500' }]}>
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
    height: 76,
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
    width: 44,
    height: 30,
    borderRadius: AppRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
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
    fontSize: 11,
    lineHeight: 14,
    maxWidth: '100%',
    textAlign: 'center',
  },
});
