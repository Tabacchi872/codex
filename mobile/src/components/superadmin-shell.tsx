import { router, usePathname, type Href } from 'expo-router';
import type React from 'react';
import { Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenBackground } from './screen-background';
import { ThemedText } from './themed-text';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/store/auth-store';
import { getUnreadSuperadminSupportCount, useSuperadminStore } from '@/store/superadmin-store';

const NAV_ITEMS = [
  { href: '/superadmin' as Href, label: 'Dashboard', icon: '⌂', activePrefix: '/superadmin' },
  { href: '/superadmin/coaches' as Href, label: 'Coach', icon: '◎', activePrefix: '/superadmin/coaches' },
  { href: '/superadmin/plans' as Href, label: 'Piani', icon: '▦', activePrefix: '/superadmin/plans' },
  { href: '/superadmin/payment-events' as Href, label: 'Pagamenti', icon: '€', activePrefix: '/superadmin/payment-events' },
  { href: '/superadmin/support' as Href, label: 'Supporto', icon: '?', activePrefix: '/superadmin/support' },
] as const satisfies readonly { href: Href; label: string; icon: string; activePrefix?: string }[];

const SUPERADMIN_TAB_BAR_HEIGHT = 72;

type SuperadminShellProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
  contentStyle?: ViewStyle;
};

export function SuperadminShell({ title, description, children, contentStyle }: SuperadminShellProps) {
  const pathname = usePathname();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const logout = useAuthStore((s) => s.logout);
  const unreadNotifications = useSuperadminStore((s) => s.notifications.filter((notification) => !notification.read).length);
  const unreadCoachSupport = useSuperadminStore(
    (s) => getUnreadSuperadminSupportCount(s.coaches, s.coachSupportMessages)
  );

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.four,
            paddingBottom: insets.bottom + SUPERADMIN_TAB_BAR_HEIGHT + Spacing.four,
          },
          contentStyle,
        ]}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <ThemedText type="smallBold" style={{ color: theme.primary }}>
              Area Superadmin
            </ThemedText>
            <ThemedText type="title" style={styles.title}>
              {title}
            </ThemedText>
            {description ? (
              <ThemedText type="small" themeColor="textSecondary">
                {description}
              </ThemedText>
            ) : null}
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => router.push('/superadmin/notifications' as Href)}
              hitSlop={8}
              accessibilityLabel="Notifiche"
              style={StyleSheet.flatten([styles.notificationButton, { borderColor: theme.border, backgroundColor: theme.backgroundElement }])}>
              <ThemedText type="default" style={[styles.notificationIcon, { color: theme.primary }]}>
                🔔
              </ThemedText>
              {unreadNotifications > 0 ? (
                <View style={[styles.notificationBadge, { backgroundColor: theme.primary }]}>
                  <ThemedText type="smallBold" style={styles.badgeText}>
                    {unreadNotifications > 99 ? '99+' : String(unreadNotifications)}
                  </ThemedText>
                </View>
              ) : null}
            </Pressable>
            <Pressable onPress={logout} hitSlop={8} style={[styles.logoutButton, { borderColor: theme.border }]}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Esci
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {children}
      </ScrollView>
      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: theme.backgroundElement,
            borderTopColor: theme.border,
            paddingBottom: insets.bottom + Spacing.one,
          },
        ]}>
        {NAV_ITEMS.map((item) => {
          const href = item.href.toString();
          const activePrefix = 'activePrefix' in item ? item.activePrefix : href;
          const active = href === '/superadmin'
            ? pathname === '/superadmin'
            : pathname === activePrefix || pathname.startsWith(`${activePrefix}/`);
          const isSupport = href === '/superadmin/support';
          return (
            <Pressable
              key={href}
              onPress={() => router.push(item.href)}
              hitSlop={4}
              style={styles.tabItem}>
              <View style={[styles.activeIndicator, active && { backgroundColor: theme.primary }]} />
              <View style={styles.tabIconWrap}>
                <ThemedText style={[styles.tabIcon, { color: active ? theme.primary : theme.textSecondary }]}>
                  {item.icon}
                </ThemedText>
                {isSupport && unreadCoachSupport > 0 ? (
                  <View style={[styles.supportBadge, { backgroundColor: theme.primary }]}>
                    <ThemedText type="smallBold" style={styles.badgeText}>
                      {unreadCoachSupport > 99 ? '99+' : String(unreadCoachSupport)}
                    </ThemedText>
                  </View>
                ) : null}
              </View>
              <ThemedText
                type="smallBold"
                numberOfLines={1}
                style={[styles.tabLabel, { color: active ? theme.primary : theme.textSecondary }]}>
                {item.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    maxWidth: '100%',
    width: '100%',
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
    gap: Spacing.one,
    minWidth: 0,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 36,
  },
  logoutButton: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
  },
  notificationButton: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 42,
    justifyContent: 'center',
    position: 'relative',
    width: 42,
  },
  notificationIcon: {
    fontSize: 18,
    lineHeight: 22,
  },
  notificationBadge: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    justifyContent: 'center',
    minWidth: 18,
    paddingHorizontal: Spacing.one,
    position: 'absolute',
    right: -2,
    top: -4,
  },
  bottomBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    elevation: 20,
    flexDirection: 'row',
    height: SUPERADMIN_TAB_BAR_HEIGHT,
    left: 0,
    paddingHorizontal: Spacing.one,
    paddingTop: Spacing.two,
    position: 'absolute',
    right: 0,
    zIndex: 20,
  },
  tabItem: {
    alignItems: 'center',
    flex: 1,
    gap: 3,
    justifyContent: 'flex-start',
    minHeight: 44,
    minWidth: 0,
    paddingHorizontal: 1,
  },
  activeIndicator: {
    backgroundColor: 'transparent',
    borderRadius: 2,
    height: 3,
    width: 20,
  },
  tabIconWrap: {
    position: 'relative',
  },
  tabIcon: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 21,
    textAlign: 'center',
  },
  tabLabel: {
    fontSize: 10,
    lineHeight: 13,
    maxWidth: '100%',
    textAlign: 'center',
  },
  supportBadge: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    justifyContent: 'center',
    minWidth: 17,
    paddingHorizontal: 4,
    position: 'absolute',
    right: -12,
    top: -7,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    lineHeight: 13,
  },
});
