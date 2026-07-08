import { Link, usePathname, type Href } from 'expo-router';
import type React from 'react';
import { Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenBackground } from './screen-background';
import { ThemedText } from './themed-text';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/store/auth-store';
import { useSuperadminStore } from '@/store/superadmin-store';

const NAV_ITEMS = [
  { href: '/superadmin', label: 'Dashboard' },
  { href: '/superadmin/coaches', label: 'Coach' },
  { href: '/superadmin/plans', label: 'Piani' },
  { href: '/superadmin/payment-events', label: 'Pagamenti' },
  { href: '/superadmin/support/index', label: 'Supporto' },
  { href: '/superadmin/notifications', label: 'Notifiche' },
] as const satisfies readonly { href: Href; label: string }[];

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
    (s) => s.coachSupportMessages.filter((message) => message.sender === 'coach' && !message.readBySuperadminAt).length
  );

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.four, paddingBottom: insets.bottom + Spacing.four },
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
          <Pressable onPress={logout} style={[styles.logoutButton, { borderColor: theme.border }]}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Esci
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.nav}>
          {NAV_ITEMS.map((item) => {
            const supportActive = item.href === '/superadmin/support/index' && pathname.startsWith('/superadmin/support');
            const active = supportActive || pathname === item.href || (item.href !== '/superadmin' && pathname.startsWith(`${item.href}/`));
            return (
              <Link key={item.href.toString()} href={item.href} asChild>
                <Pressable
                  style={StyleSheet.flatten([
                    styles.navItem,
                    { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.softRed : theme.backgroundElement },
                  ])}>
                  <ThemedText type="smallBold" style={{ color: active ? theme.primary : theme.textSecondary }}>
                    {item.label}
                  </ThemedText>
                  {item.href === '/superadmin/support/index' && unreadCoachSupport > 0 ? (
                    <View style={[styles.navBadge, { backgroundColor: theme.primary }]}>
                      <ThemedText type="smallBold" style={{ color: theme.onPrimary, fontSize: 11, lineHeight: 14 }}>
                        {unreadCoachSupport > 99 ? '99+' : unreadCoachSupport}
                      </ThemedText>
                    </View>
                  ) : null}
                  {item.href === '/superadmin/notifications' && unreadNotifications > 0 ? (
                    <View style={[styles.navBadge, { backgroundColor: theme.primary }]}>
                      <ThemedText type="smallBold" style={{ color: theme.onPrimary, fontSize: 11, lineHeight: 14 }}>
                        {unreadNotifications > 99 ? '99+' : unreadNotifications}
                      </ThemedText>
                    </View>
                  ) : null}
                </Pressable>
              </Link>
            );
          })}
        </View>

        {children}
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
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
  nav: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  navItem: {
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  navBadge: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    justifyContent: 'center',
    minWidth: 20,
    paddingHorizontal: Spacing.one,
    paddingVertical: 2,
  },
});
