import { StyleSheet, Text, View } from 'react-native';

import { AppSpacing, useAppTheme } from '@/theme';

// Guardia di contenuto (non un redirect di navigazione): se un account cliente
// finisse su una schermata riservata al coach (es. digitando l'URL nella
// preview web), mostra questo messaggio invece del contenuto reale. Demo
// locale: non è un controllo di sicurezza, è una barriera onesta lato UI.
export function CoachOnlyNotice() {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.text, { color: colors.inkSoft }]}>Sezione riservata al coach.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: AppSpacing[4],
  },
  text: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});
