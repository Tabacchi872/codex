import { Tabs, TabList, TabTrigger, TabSlot, TabTriggerSlotProps, TabListProps } from 'expo-router/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { WebTabBarHeight } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const TAB_LABELS: Record<string, string> = {
  index: 'Dashboard',
  clienti: 'Clienti',
  esercizi: 'Esercizi',
  schede: 'Schede',
  appuntamenti: 'Agenda',
  impostazioni: 'Impostazioni',
};

// Stesso stile del lato cliente (client-tabs.web.tsx): glifo Unicode, non una
// libreria icone, per restare coerenti con la scelta già fatta lì.
const TAB_ICONS: Record<string, string> = {
  index: '📊',
  clienti: '👥',
  esercizi: '🏋️',
  schede: '📋',
  appuntamenti: '📅',
  impostazioni: '⚙️',
};

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={styles.slot} />
      <TabList asChild>
        <TabBar>
          <TabTrigger name="index" href="/" asChild>
            <TabButton name="index" />
          </TabTrigger>
          <TabTrigger name="clienti" href="/clienti" asChild>
            <TabButton name="clienti" />
          </TabTrigger>
          <TabTrigger name="esercizi" href="/esercizi" asChild>
            <TabButton name="esercizi" />
          </TabTrigger>
          <TabTrigger name="schede" href="/schede" asChild>
            <TabButton name="schede" />
          </TabTrigger>
          <TabTrigger name="appuntamenti" href="/appuntamenti/index" asChild>
            <TabButton name="appuntamenti" />
          </TabTrigger>
          <TabTrigger name="impostazioni" href="/impostazioni" asChild>
            <TabButton name="impostazioni" />
          </TabTrigger>
        </TabBar>
      </TabList>
    </Tabs>
  );
}

// name non arriva sempre nello slot props di expo-router/ui: lo passiamo esplicitamente
// per poter mostrare l'etichetta corretta e distinguere lo stato attivo.
function TabButton({ name, isFocused, ...props }: TabTriggerSlotProps & { name: string }) {
  const theme = useTheme();

  return (
    <Pressable {...props} style={styles.tabItem}>
      <View style={[styles.activeIndicator, isFocused && { backgroundColor: theme.primary }]} />
      <Text style={[styles.tabIcon, { opacity: isFocused ? 1 : 0.6 }]}>{TAB_ICONS[name] ?? '•'}</Text>
      <Text
        numberOfLines={1}
        style={[
          styles.tabLabel,
          { color: isFocused ? theme.primary : theme.textSecondary },
          isFocused && styles.tabLabelActive,
        ]}>
        {TAB_LABELS[name] ?? name}
      </Text>
    </Pressable>
  );
}

function TabBar(props: TabListProps) {
  const theme = useTheme();

  return (
    <View
      {...props}
      style={[styles.tabBar, { backgroundColor: theme.backgroundElement, borderTopColor: theme.border }]}
    />
  );
}

const styles = StyleSheet.create({
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
