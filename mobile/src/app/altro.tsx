import { useRouter } from 'expo-router';
import { Calendar, ChartColumn, Megaphone, Package, Settings, Ticket, TrendingUp, Trophy, User } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppCard, AppHeader, AppListRow, AppScreen } from '@/components/ui';
import { useAppTheme } from '@/theme';

type MenuItem = {
  key: string;
  icon: typeof User;
  title: string;
  href: '/cliente-profilo' | '/progressi' | '/bacheca' | '/prenotazioni' | '/pacchetti-cliente';
};

// Menu "Altro": raccoglie le schermate cliente che non hanno una tab dedicata.
// Profilo e Impostazioni puntano entrambe a cliente-profilo.tsx (le impostazioni
// di tema vivono già lì): non è una voce "senza funzione", solo una destinazione
// condivisa. Storico pesi/Metriche/Progressi puntano tutte a progressi.tsx per lo
// stesso motivo (vedi commento in quel file). "Pacchetti" (2026-07-12) è distinta
// da "Abbonamento": quest'ultima resta l'abbonamento sessioni assegnato dal
// proprio coach (cliente-profilo.tsx), "Pacchetti" sono i pacchetti del
// superadmin acquistabili direttamente (pacchetti-cliente.tsx).
const MENU_ITEMS: MenuItem[] = [
  { key: 'profilo', icon: User, title: 'Profilo', href: '/cliente-profilo' },
  { key: 'impostazioni', icon: Settings, title: 'Impostazioni', href: '/cliente-profilo' },
  { key: 'storico-pesi', icon: TrendingUp, title: 'Storico pesi', href: '/progressi' },
  { key: 'metriche', icon: ChartColumn, title: 'Metriche', href: '/progressi' },
  { key: 'progressi', icon: Trophy, title: 'Progressi', href: '/progressi' },
  { key: 'abbonamento', icon: Ticket, title: 'Abbonamento', href: '/cliente-profilo' },
  { key: 'pacchetti', icon: Package, title: 'Pacchetti', href: '/pacchetti-cliente' },
  { key: 'bacheca', icon: Megaphone, title: 'Bacheca', href: '/bacheca' },
  { key: 'prenotazioni', icon: Calendar, title: 'Prenotazioni', href: '/prenotazioni' },
];

export default function AltroScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();

  return (
    <AppScreen>
      <AppHeader title="Altro" />
      <AppCard style={styles.listCard}>
        {MENU_ITEMS.map((item, index) => {
          const Icon = item.icon;
          return (
            <View key={item.key}>
              {index > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
              <AppListRow
                icon={<Icon size={19} color={colors.moss} />}
                iconBackground={colors.mossSoft}
                title={item.title}
                onPress={() => router.push(item.href)}
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
