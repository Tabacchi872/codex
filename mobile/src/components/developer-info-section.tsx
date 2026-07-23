import { Info } from 'lucide-react-native';
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppCard } from './ui';

import {
  APP_COPYRIGHT,
  APP_NAME,
  APP_OWNER,
  APP_VERSION,
  APP_YEAR,
  PRIVACY_POLICY_URL,
  TERMS_OF_SERVICE_URL,
} from '@/constants/app-info';
import { AppFontSize, AppSpacing, useAppTheme } from '@/theme';

function notify(title: string, message: string) {
  if (Platform.OS === 'web') {
    globalThis.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

// Apre un link legale (Privacy/Termini) senza mai lasciare una promise
// rejection non gestita: nessun URL vuoto/malformato, nessun handler di
// deep link disponibile (canOpenURL) e nessun errore di rete durante
// l'apertura devono produrre un tap silenzioso o una schermata rossa —
// l'utente vede sempre un messaggio chiaro. Stesso comportamento su Web
// (globalThis.alert, Linking.openURL apre una nuova scheda), Android e iOS.
export async function openLegalLink(url: string) {
  if (!url || !url.trim()) {
    notify('Link non disponibile', 'Questo link non è ancora stato configurato.');
    return;
  }
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      notify('Impossibile aprire il link', 'Nessuna app in grado di aprire questo indirizzo su questo dispositivo.');
      return;
    }
    await Linking.openURL(url);
  } catch {
    notify('Impossibile aprire il link', 'Controlla la connessione e riprova.');
  }
}

// Sezione "Sviluppatore": visibile sia lato coach sia lato cliente (vedi
// impostazioni.tsx e cliente-profilo.tsx), stesso componente per non
// duplicare testo/layout nei due punti.
export function DeveloperInfoSection() {
  const { colors } = useAppTheme();

  return (
    <AppCard style={styles.card}>
      <View style={styles.header}>
        <Info size={16} color={colors.moss} />
        <Text style={[styles.headerLabel, { color: colors.ink }]}>Sviluppatore</Text>
      </View>

      <InfoRow label="Sviluppato da" value={APP_OWNER} />
      <InfoRow label="App" value={APP_NAME} />
      <InfoRow label="Versione" value={APP_VERSION} />
      <InfoRow label="Anno" value={String(APP_YEAR)} />

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <View style={styles.legalLinks}>
        <Pressable onPress={() => void openLegalLink(PRIVACY_POLICY_URL)} hitSlop={8}>
          <Text style={[styles.smallText, styles.link, { color: colors.moss }]}>Privacy policy</Text>
        </Pressable>
        <Pressable onPress={() => void openLegalLink(TERMS_OF_SERVICE_URL)} hitSlop={8}>
          <Text style={[styles.smallText, styles.link, { color: colors.moss }]}>Termini di servizio</Text>
        </Pressable>
      </View>

      <Text style={[styles.smallText, { color: colors.inkSoft }]}>
        Grazie a tutti i coach e clienti che contribuiranno al miglioramento dell&apos;app.
      </Text>

      <Text style={[styles.smallText, styles.copyright, { color: colors.inkSoft }]}>{APP_COPYRIGHT}</Text>
    </AppCard>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.smallText, { color: colors.inkSoft }]}>{label}</Text>
      <Text style={[styles.smallText, styles.rowValue, { color: colors.ink }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: AppSpacing[2],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerLabel: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  smallText: {
    fontSize: AppFontSize.sm,
  },
  rowValue: {
    fontWeight: '600',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 2,
  },
  copyright: {
    marginTop: AppSpacing[1],
  },
  legalLinks: {
    flexDirection: 'row',
    gap: AppSpacing[3],
  },
  link: {
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
