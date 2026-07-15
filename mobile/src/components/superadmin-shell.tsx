import { router, usePathname, type Href } from 'expo-router';
import { Bell, Euro, House, LifeBuoy, Package, Ticket, Users, type LucideIcon } from 'lucide-react-native';
import type React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton, AppIconButton, FitCoachLogo } from '@/components/ui';
import { signOut } from '@/lib/auth-service';
import { logSuperadminNavPress } from '@/lib/superadmin-navigation';
import { useAuthStore } from '@/store/auth-store';
import { getUnreadSuperadminSupportCount, useSuperadminStore } from '@/store/superadmin-store';
import { AppColors, AppFontSize, AppRadius, AppSpacing, AppTextStyle, useAppTheme } from '@/theme';

const NAV_ITEMS = [
  { href: '/superadmin' as Href, label: 'Dashboard', icon: House, activePrefix: '/superadmin' },
  { href: '/superadmin/coaches' as Href, label: 'Coach', icon: Users, activePrefix: '/superadmin/coaches' },
  { href: '/superadmin/plans' as Href, label: 'Piani', icon: Ticket, activePrefix: '/superadmin/plans' },
  { href: '/superadmin/pacchetti' as Href, label: 'Pacchetti', icon: Package, activePrefix: '/superadmin/pacchetti' },
  { href: '/superadmin/payment-events' as Href, label: 'Pagamenti', icon: Euro, activePrefix: '/superadmin/payment-events' },
  { href: '/superadmin/support' as Href, label: 'Supporto', icon: LifeBuoy, activePrefix: '/superadmin/support' },
] as const satisfies readonly { href: Href; label: string; icon: LucideIcon; activePrefix?: string }[];

// Altezza del SOLO contenuto della bottom bar (pillola 26 + gap 4 + label 13
// + paddingTop 8 + paddingBottom base 4 ≈ 55, arrotondata con margine): l'
// altezza totale della bar e' SEMPRE contenuto + insets.bottom, mai un valore
// fisso — su Android la barra di navigazione di sistema (gesture o 3 pulsanti,
// inset 24-48px) veniva prima SOTTRATTA dai 74px fissi, schiacciando icone e
// label e facendo finire i form sotto la bar.
const SUPERADMIN_TAB_BAR_CONTENT_HEIGHT = 58;

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
  const tabColors = AppColors.dark;
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

  function navigate(source: string, target: Href) {
    logSuperadminNavPress(source, target.toString());
    router.push(target);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + AppSpacing[4],
            paddingBottom: insets.bottom + SUPERADMIN_TAB_BAR_CONTENT_HEIGHT + AppSpacing[4],
          },
          contentStyle,
        ]}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <FitCoachLogo size="sm" />
            <Text style={[AppTextStyle.eyebrow, { color: colors.moss }]}>AREA SUPERADMIN</Text>
            <Text style={[AppTextStyle.title, styles.title, { color: colors.ink }]}>{title}</Text>
            {description ? <Text style={[styles.description, { color: colors.inkSoft }]}>{description}</Text> : null}
          </View>
          <View style={styles.headerActions}>
            <View>
              <AppIconButton
                icon={<Bell size={18} color={colors.ink} />}
                onPress={() => navigate('superadmin-header-notifiche', '/superadmin/notifications' as Href)}
                accessibilityLabel="Notifiche"
                size={42}
              />
              {unreadNotifications > 0 ? (
                <View style={[styles.notificationBadge, { backgroundColor: colors.coral }]} pointerEvents="none">
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
            backgroundColor: tabColors.surface,
            borderColor: tabColors.border,
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
          const Icon = item.icon;
          return (
            <Pressable key={href} onPress={() => navigate(`superadmin-tab-${item.label.toLowerCase()}`, item.href)} hitSlop={4} style={styles.tabItem}>
              <View style={[styles.tabIconPill, active && { backgroundColor: tabColors.mossSoft, borderColor: tabColors.moss }]}>
                <Icon size={23} color={active ? tabColors.moss : tabColors.inkFaint} strokeWidth={2.25} />
                {isSupport && unreadCoachSupport > 0 ? (
                  <View style={[styles.supportBadge, { backgroundColor: colors.coral }]} pointerEvents="none">
                    <Text style={styles.badgeText}>{unreadCoachSupport > 99 ? '99+' : String(unreadCoachSupport)}</Text>
                  </View>
                ) : null}
              </View>
              <Text
                numberOfLines={1}
                style={[styles.tabLabel, { color: active ? tabColors.moss : tabColors.inkFaint, fontWeight: active ? '700' : '500' }]}>
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
    borderRadius: 28,
    borderWidth: 1,
    bottom: 0,
    flexDirection: 'row',
    left: AppSpacing[4],
    paddingHorizontal: AppSpacing[1],
    paddingTop: AppSpacing[2],
    position: 'absolute',
    right: AppSpacing[4],
    overflow: 'hidden',
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
