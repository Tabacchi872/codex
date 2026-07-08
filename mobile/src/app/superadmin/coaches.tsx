import { ScrollView, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Spacing } from '@/constants/theme';

const coachColumns = [
  'coach registrati',
  'piano attivo',
  'status pagamento',
  'clienti usati',
  'limite clienti',
  'scadenza abbonamento',
  'blocca/sblocca',
  'cambio piano manuale',
];

export default function SuperadminCoachesConcept() {
  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="subtitle" style={styles.title}>
          Coach registrati
        </ThemedText>
        <Card style={styles.card}>
          <ThemedText type="smallBold">Tabella coach</ThemedText>
          <View style={styles.list}>
            {coachColumns.map((item) => (
              <ThemedText key={item} type="small" themeColor="textSecondary">
                - {item}
              </ThemedText>
            ))}
          </View>
        </Card>
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
  },
  card: {
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.one,
  },
});
