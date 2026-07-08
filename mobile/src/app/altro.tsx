import { useRouter } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type MenuItem = {
  key: string;
  icon: string;
  title: string;
  href: '/cliente-profilo' | '/progressi' | '/bacheca' | '/prenotazioni';
};

// Menu "Altro": raccoglie le schermate cliente che non hanno una tab dedicata.
// Profilo e Impostazioni puntano entrambe a cliente-profilo.tsx (le impostazioni
// di tema vivono già lì): non è una voce "senza funzione", solo una destinazione
// condivisa. Storico pesi/Metriche/Progressi puntano tutte a progressi.tsx per lo
// stesso motivo (vedi commento in quel file).
const MENU_ITEMS: MenuItem[] = [
  { key: 'profilo', icon: '👤', title: 'Profilo', href: '/cliente-profilo' },
  { key: 'impostazioni', icon: '⚙️', title: 'Impostazioni', href: '/cliente-profilo' },
  { key: 'storico-pesi', icon: '📈', title: 'Storico pesi', href: '/progressi' },
  { key: 'metriche', icon: '📊', title: 'Metriche', href: '/progressi' },
  { key: 'progressi', icon: '🏆', title: 'Progressi', href: '/progressi' },
  { key: 'abbonamento', icon: '🎟️', title: 'Abbonamento', href: '/cliente-profilo' },
  { key: 'bacheca', icon: '📣', title: 'Bacheca', href: '/bacheca' },
  { key: 'prenotazioni', icon: '📅', title: 'Prenotazioni', href: '/prenotazioni' },
];

export default function AltroScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Platform.OS === 'web' ? Spacing.five : insets.top + Spacing.three,
            paddingBottom: insets.bottom + BottomTabInset + Spacing.four,
          },
        ]}>
        <ThemedText type="title" style={styles.title}>
          Altro
        </ThemedText>

        <Card style={styles.listCard} padded={false}>
          {MENU_ITEMS.map((item, index) => (
            <Pressable key={item.key} onPress={() => router.push(item.href)} hitSlop={4}>
              <View style={[styles.row, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                <ThemedText style={styles.rowIcon}>{item.icon}</ThemedText>
                <ThemedText type="default" style={styles.rowTitle}>
                  {item.title}
                </ThemedText>
                <ThemedText style={[styles.arrow, { color: theme.primary }]}>→</ThemedText>
              </View>
            </Pressable>
          ))}
        </Card>
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
  },
  listCard: {
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  rowIcon: {
    fontSize: 20,
  },
  rowTitle: {
    flex: 1,
    minWidth: 0,
    fontWeight: '600',
  },
  arrow: {
    fontSize: 18,
    fontWeight: '700',
  },
});
