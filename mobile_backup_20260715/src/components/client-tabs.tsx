import { Slot, usePathname, useRouter, type Href } from 'expo-router';
import { Apple, Dumbbell, House, Menu, MessageCircle, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { logClientNavPress } from '@/lib/client-navigation';
import { AppRadius, AppSpacing, useAppTheme } from '@/theme';

const TABS: { path: Href; label: string; icon: LucideIcon; source: string }[] = [
  { path: '/cliente-home', label: 'Home', icon: House, source: 'client-tab-home' },
  { path: '/workout', label: 'Workout', icon: Dumbbell, source: 'client-tab-workout' },
  { path: '/nutrizione', label: 'Nutrizione', icon: Apple, source: 'client-tab-nutrizione' },
  { path: '/chat', label: 'Chat', icon: MessageCircle, source: 'client-tab-chat' },
  { path: '/altro', label: 'Altro', icon: Menu, source: 'client-tab-altro' },
];

// Tab bar lato cliente: 5 voci visibili, ma il contenuto usa Slot. Su Android
// NativeTabs registra solo i Trigger dichiarati e lascia fuori le route interne
// aperte da Home/Altro/Workout (/questionario, /bacheca, /schede/[id]...).
export default function ClientTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();

  return (
    <View style={styles.container}>
      <View style={styles.slot}>
        <Slot screenOptions={{ headerShown: false }} />
      </View>
      <View
        style={[
          styles.tabBar,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            paddingBottom: insets.bottom + AppSpacing[2],
          },
        ]}>
        {TABS.map((tab) => {
          const pathStr = tab.path.toString();
          const isActive = pathname === pathStr;
          const Icon = tab.icon;
          return (
            <Pressable
              key={pathStr}
              onPress={() => {
                logClientNavPress(tab.source, pathStr);
                router.push(tab.path);
              }}
              hitSlop={4}
              style={styles.tabItem}>
              <View style={[styles.iconPill, isActive && { backgroundColor: colors.mossSoft, borderColor: colors.moss }]}>
                <Icon size={23} color={isActive ? colors.moss : colors.inkFaint} strokeWidth={2.35} />
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
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 28,
    marginHorizontal: AppSpacing[4],
    marginBottom: AppSpacing[2],
    paddingTop: AppSpacing[1],
    zIndex: 20,
    elevation: 20,
    overflow: 'hidden',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 4,
    minHeight: 50,
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
  tabLabel: {
    fontSize: 11,
    lineHeight: 14,
    maxWidth: '100%',
    textAlign: 'center',
  },
});
