import { StyleSheet } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';

// Guardia di contenuto (non un redirect di navigazione): se un account cliente
// finisse su una schermata riservata al coach (es. digitando l'URL nella
// preview web), mostra questo messaggio invece del contenuto reale. Demo
// locale: non è un controllo di sicurezza, è una barriera onesta lato UI.
export function CoachOnlyNotice() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="default" themeColor="textSecondary" style={styles.text}>
        Sezione riservata al coach.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  text: {
    textAlign: 'center',
  },
});
