import { Info } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { AppCard } from './ui';

import { APP_COPYRIGHT, APP_NAME, APP_OWNER, APP_VERSION, APP_YEAR } from '@/constants/app-info';
import { AppFontSize, AppSpacing, useAppTheme } from '@/theme';

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
});
