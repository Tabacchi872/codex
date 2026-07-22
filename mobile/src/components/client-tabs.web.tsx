import { Slot, usePathname, useRouter, type Href } from 'expo-router';
import { Apple, Dumbbell, House, Menu, MessageCircle, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { logClientNavPress, visibleClientTabs } from '@/lib/client-navigation';
import { AppRadius, AppSpacing, useAppTheme } from '@/theme';
import type { ClientOnboardingMode } from '@/types/client-onboarding';

const TABS: { path: Href; label: string; icon: LucideIcon; source: string; hiddenForSelfGuided?: boolean }[] = [
  { path: '/cliente-home', label: 'Home', icon: House, source: 'client-tab-home' },
  { path: '/workout', label: 'Workout', icon: Dumbbell, source: 'client-tab-workout' },
  { path: '/nutrizione', label: 'Nutrizione', icon: Apple, source: 'client-tab-nutrizione' },
  // Un cliente self_guided non ha mai un coach assegnato: AuthGate
  // (SELF_GUIDED_COACH_ONLY_ROUTES) rimanda sempre alla Home chi apre /chat
  // in quella modalita' — nascosta qui per non mostrare una tab sempre
  // inutilizzabile (bug reale corretto, vedi visibleClientTabs). Stessa
  // regola di client-tabs.tsx (native), condivisa via lib/client-navigation.ts.
  { path: '/chat', label: 'Chat', icon: MessageCircle, source: 'client-tab-chat', hiddenForSelfGuided: true },
  { path: '/altro', label: 'Altro', icon: Menu, source: 'client-tab-altro' },
];

// BUG CORRETTO (2026-07-05): la versione precedente usava le Tabs "headless" di
// expo-router/ui (<Tabs><TabSlot/><TabList>...). Quel componente registra come
// navigabili SOLO le rotte elencate come <TabTrigger>: qualunque altra rotta
// (Prenotazioni, Bacheca, Questionario, Profilo, Progressi, il dettaglio scheda
// aperto da "Allenamenti"...) restava irraggiungibile finché il cliente era
// dentro quel navigator — da qui "clic su Nutrizione funziona (è un trigger),
// poi non si naviga più" (tutto il resto non lo era). Qui invece si usa `Slot`,
// il primitivo standard di Expo Router: renderizza SEMPRE la rotta reale
// corrente, qualunque essa sia, senza una lista chiusa di schermi ammessi. La
// tab bar sotto è un semplice router.push + confronto con usePathname(): nessun
// meccanismo di navigazione "nascosto" che possa disallinearsi.
//
// File .web.tsx: Metro lo usa al posto di client-tabs.tsx SOLO sul bundle web
// (le NativeTabs di expo-router non hanno un rendering web soddisfacente).
// Migrato al nuovo design system (2026-07-11): stesso linguaggio della tab bar
// del mockup (pillola coralSoft dietro l'icona attiva, icone lucide-react-native
// reali al posto delle emoji, stesso comportamento di navigazione invariato).
// mode arriva da AuthGate (clientOnboarding.mode, il valore autorevole del
// profilo Supabase — mai dedotto da coachId, che puo' essere temporaneamente
// null durante il caricamento o riferirsi a una relazione storica sospesa):
// AuthGate monta questo componente SOLO dopo che clientOnboarding e' gia'
// risolto (loading/checked/error gestiti prima, vedi auth-gate.tsx), quindi
// non esiste un render intermedio con un mode stantio/sbagliato.
export default function ClientTabs({ mode }: { mode: ClientOnboardingMode | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const { colors } = useAppTheme();
  const tabs = visibleClientTabs(TABS, mode);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.slot}>
        <Slot screenOptions={{ headerShown: false }} />
      </View>
      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        {tabs.map((tab) => {
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
                <Icon size={18} color={isActive ? colors.moss : colors.inkFaint} strokeWidth={2.2} />
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
    height: 62,
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
    gap: 2,
    minHeight: 34,
    minWidth: 0,
    paddingHorizontal: 2,
  },
  iconPill: {
    width: 34,
    height: 24,
    borderRadius: AppRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  tabLabel: {
    fontSize: 6,
    lineHeight: 9,
    maxWidth: '100%',
    textAlign: 'center',
  },
});
