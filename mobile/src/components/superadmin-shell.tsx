import { router, usePathname, type Href } from 'expo-router';
import type React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton, AppIconButton } from '@/components/ui';
import { signOut } from '@/lib/auth-service';
import { useAuthStore } from '@/store/auth-store';
import { getUnreadSuperadminSupportCount, useSuperadminStore } from '@/store/superadmin-store';
import { AppFontSize, AppRadius, AppSpacing, AppTextStyle, useAppTheme } from '@/theme';

const NAV_ITEMS = [
  { href: '/superadmin' as Href, label: 'Dashboard', icon: '⌂', activePrefix: '/superadmin' },
  { href: '/superadmin/coaches' as Href, label: 'Coach', icon: '◎', activePrefix: '/superadmin/coaches' },
  { href: '/superadmin/plans' as Href, label: 'Piani', icon: '▦', activePrefix: '/superadmin/plans' },
  { href: '/superadmin/payment-events' as Href, label: 'Pagamenti', icon: '€', activePrefix: '/superadmin/payment-events' },
  { href: '/superadmin/support' as Href, label: 'Supporto', icon: '?', activePrefix: '/superadmin/support' },
] as const satisfies readonly { href: Href; label: string; icon: string; activePrefix?: string }[];

const SUPERADMIN_TAB_BAR_HEIGHT = 74;

type SuperadminShellProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
  contentStyle?: ViewStyle;
};

// Shell superadmin migrata al nuovo design system: stesso sfondo/spacing/
// header/badge del resto dell'app, bottom bar custom (non è una NativeTabs:
// il superadmin non usa Tabs di expo-router, vedi app/superadmin/_layout.tsx
// che è uno Stack) con pillola coralSoft dietro la voce attiva, come la tab
// bar del mockup — qui è raggiungibile perché la tab bar è JS/React Native,
// non nativa OS (a differenza di app-tabs.tsx/client-tabs.tsx).
export function SuperadminShell({ title, description, children, contentStyle }: SuperadminShellProps) {
  const pathname = usePathname();
  const { colors, cardShadow } = useAppTheme();
  const insets = useSafeAreaInsets();
  const logout = useAuthStore((s) => s.logout);
  const unreadNotifications = useSuperadminStore((s) => s.notifications.filter((notification) => !notification.read).length);
  const unreadCoachSupport = useSuperadminStore(
    (s) => getUnreadSuperadminSupportCount(s.coaches, s.coachSupportMessages)
  );

  async function handleLogout() {
    await signOut();
    logout();
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + AppSpacing[4],
            paddingBottom: insets.bottom + SUPERADMIN_TAB_BAR_HEIGHT + AppSpacing[4],
          },
          contentStyle,
        ]}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={[AppTextStyle.eyebrow, { color: colors.moss }]}>AREA SUPERADMIN</Text>
            <Text style={[AppTextStyle.title, styles.title, { color: colors.ink }]}>{title}</Text>
            {description ? <Text style={[styles.description, { color: colors.inkSoft }]}>{description}</Text> : null}
          </View>
          <View style={styles.headerActions}>
            <View>
              <AppIconButton
                icon={<Text style={{ fontSize: 17 }}>🔔</Text>}
                onPress={() => router.push('/superadmin/notifications' as Href)}
                accessibilityLabel="Notifiche"
                size={42}
              />
              {unreadNotifications > 0 ? (
                <View style={[styles.notificationBadge, { backgroundColor: colors.coral }]}>
                  <Text style={styles.badgeText}>{unreadNotifications > 99 ? '99+' : String(unreadNotifications)}</Text>
                </View>
              ) : null}
            </View>
            <AppButton label="Esci" onPress={handleLogout} variant="outline" size="sm" />
          </View>
        </View>

        {children}
      </ScrollView>
      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingBottom: insets.bottom + AppSpacing[1],
          },
          cardShadow,
        ]}>
        {NAV_ITEMS.map((item) => {
          const href = item.href.toString();
          const activePrefix = 'activePrefix' in item ? item.activePrefix : href;
          const active = href === '/superadmin'
            ? pathname === '/superadmin'
            : pathname === activePrefix || pathname.startsWith(`${activePrefix}/`);
          const isSupport = href === '/superadmin/support';
          return (
            <Pressable key={href} onPress={() => router.push(item.href)} hitSlop={4} style={styles.tabItem}>
              <View style={[styles.tabIconPill, active && { backgroundColor: colors.coralSoft }]}>
                <Text style={[styles.tabIcon, { color: active ? colors.coral : colors.inkFaint }]}>{item.icon}</Text>
                {isSupport && unreadCoachSupport > 0 ? (
                  <View style={[styles.supportBadge, { backgroundColor: colors.coral }]}>
                    <Text style={styles.badgeText}>{unreadCoachSupport > 99 ? '99+' : String(unreadCoachSupport)}</Text>
                  </View>
                ) : null}
              </View>
              <Text
                numberOfLines={1}
                style={[styles.tabLabel, { color: active ? colors.ink : colors.inkFaint, fontWeight: active ? '700' : '500' }]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: AppSpacing[5],
    gap: AppSpacing[4],
    maxWidth: '100%',
    width: '100%',
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: AppSpacing[2],
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  title: {
    fontSize: 26,
  },
  description: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
    marginTop: 2,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[2],
  },
  notificationBadge: {
    alignItems: 'center',
    borderRadius: AppRadius.pill,
    justifyContent: 'center',
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    position: 'absolute',
    right: -2,
    top: -4,
  },
  bottomBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    flexDirection: 'row',
    height: SUPERADMIN_TAB_BAR_HEIGHT,
    left: 0,
    paddingHorizontal: AppSpacing[1],
    paddingTop: AppSpacing[2],
    position: 'absolute',
    right: 0,
    zIndex: 20,
  },
  tabItem: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
    justifyContent: 'flex-start',
    minHeight: 44,
    minWidth: 0,
    paddingHorizontal: 1,
  },
  tabIconPill: {
    width: 40,
    height: 26,
    borderRadius: AppRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIcon: {
    fontSize: 16,
    fontWeight: '700',
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
    borderRadius: AppRadius.pill,
    justifyContent: 'center',
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
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
});
