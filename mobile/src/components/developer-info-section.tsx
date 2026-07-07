import { StyleSheet, View } from 'react-native';

import { Card } from './card';
import { ThemedText } from './themed-text';

import { APP_COPYRIGHT, APP_NAME, APP_OWNER, APP_VERSION, APP_YEAR } from '@/constants/app-info';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Sezione "Sviluppatore": visibile sia lato coach sia lato cliente (vedi
// impostazioni.tsx e cliente-profilo.tsx), stesso componente per non
// duplicare testo/layout nei due punti.
export function DeveloperInfoSection() {
  const theme = useTheme();

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <ThemedText style={[styles.icon, { color: theme.primary }]}>ⓘ</ThemedText>
        <ThemedText type="smallBold">Sviluppatore</ThemedText>
      </View>

      <InfoRow label="Sviluppato da" value={APP_OWNER} />
      <InfoRow label="App" value={APP_NAME} />
      <InfoRow label="Versione" value={APP_VERSION} />
      <InfoRow label="Anno" value={String(APP_YEAR)} />

      <View style={[styles.divider, { backgroundColor: theme.border }]} />

      <ThemedText type="small" themeColor="textSecondary">
        Grazie a tutti i coach e clienti che contribuiranno al miglioramento dell'app.
      </ThemedText>

      <ThemedText type="small" themeColor="textSecondary" style={styles.copyright}>
        {APP_COPYRIGHT}
      </ThemedText>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="small" style={styles.rowValue}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  icon: {
    fontSize: 18,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rowValue: {
    fontWeight: '600',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 2,
  },
  copyright: {
    marginTop: Spacing.one,
  },
});
