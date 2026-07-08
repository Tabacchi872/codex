import { ScrollView, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Spacing } from '@/constants/theme';

const planFields = ['codice piano', 'nome pubblico', 'limite clienti', 'feature abilitate', 'attivo', 'ordinamento'];

export default function SuperadminPlansConcept() {
  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="subtitle" style={styles.title}>
          Piani coach
        </ThemedText>
        <Card style={styles.card}>
          <ThemedText type="smallBold">Gestione piani</ThemedText>
          <View style={styles.list}>
            {planFields.map((field) => (
              <ThemedText key={field} type="small" themeColor="textSecondary">
                - {field}
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
