import { useRouter } from 'expo-router';
import { Calendar, ChartColumn, Megaphone, Package, Settings, Ticket, TrendingUp, Trophy, User } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppCard, AppHeader, AppListRow, AppScreen } from '@/components/ui';
import { useMyCoach } from '@/hooks/use-my-coach';
import { logClientNavPress } from '@/lib/client-navigation';
import { useAppTheme } from '@/theme';

type MenuItem = {
  key: string;
  icon: typeof User;
  title: string;
  href: '/cliente-profilo' | '/progressi' | '/metriche' | '/storico-carichi' | '/bacheca' | '/prenotazioni' | '/pacchetti-cliente';
  // Route riservate a un cliente con coach assegnato (vedi
  // SELF_GUIDED_COACH_ONLY_ROUTES in auth-gate.tsx): un cliente self_guided
  // che le apre viene comunque rimbalzato in Home da AuthGate, ma mostrarle
  // qui sarebbe comunque una voce di menu morta — nascoste sotto.
  hiddenForSelfGuided?: boolean;
};

// Menu "Altro": raccoglie le schermate cliente che non hanno una tab dedicata.
// Profilo e Impostazioni puntano entrambe a cliente-profilo.tsx: non sono voci
// senza funzione, ma destinazioni condivise. Metriche, Progressi e Storico carichi
// sono schermate distinte: Storico carichi legge le serie salvate durante gli
// allenamenti. "Pacchetti" (2026-07-12) e' distinta da "Abbonamento": quest'ultima
// resta l'abbonamento sessioni assegnato dal coach, mentre "Pacchetti" sono i
// pacchetti del superadmin acquistabili direttamente.
const MENU_ITEMS: MenuItem[] = [
  { key: 'profilo', icon: User, title: 'Profilo', href: '/cliente-profilo' },
  { key: 'impostazioni', icon: Settings, title: 'Impostazioni', href: '/cliente-profilo' },
  { key: 'storico-carichi', icon: TrendingUp, title: 'Storico carichi', href: '/storico-carichi' },
  { key: 'metriche', icon: ChartColumn, title: 'Metriche', href: '/metriche' },
  { key: 'progressi', icon: Trophy, title: 'Progressi', href: '/progressi' },
  { key: 'abbonamento', icon: Ticket, title: 'Abbonamento', href: '/cliente-profilo' },
  { key: 'pacchetti', icon: Package, title: 'Pacchetti', href: '/pacchetti-cliente' },
  { key: 'bacheca', icon: Megaphone, title: 'Bacheca', href: '/bacheca', hiddenForSelfGuided: true },
  { key: 'prenotazioni', icon: Calendar, title: 'Prenotazioni', href: '/prenotazioni', hiddenForSelfGuided: true },
];

export default function AltroScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const myCoach = useMyCoach();
  // Fail-closed, stesso pattern di cliente-home.tsx (isCoachGuided): il
  // clientMode reale (mai un coachId dedotto) parte da null finche'
  // useMyCoach() non risolve — le voci coach-only restano nascoste finche'
  // 'coach_guided' non e' confermato, mai mostrate durante il caricamento
  // ne' per un cliente self_guided gia' risolto.
  const isCoachGuided = myCoach.clientMode === 'coach_guided';
  const menuItems = MENU_ITEMS.filter((item) => !item.hiddenForSelfGuided || isCoachGuided);

  function navigate(source: string, target: MenuItem['href']) {
    logClientNavPress(source, target);
    router.push(target);
  }

  return (
    <AppScreen>
      <AppHeader title="Altro" />
      <AppCard style={styles.listCard}>
        {menuItems.map((item, index) => {
          const Icon = item.icon;
          return (
            <View key={item.key}>
              {index > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
              <AppListRow
                icon={<Icon size={19} color={colors.moss} />}
                iconBackground={colors.mossSoft}
                title={item.title}
                onPress={() => navigate(`altro-${item.key}`, item.href)}
              />
            </View>
          );
        })}
      </AppCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  listCard: {
    paddingVertical: 4,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: -12,
  },
});
