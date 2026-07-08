import { Link, type Href } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Spacing } from '@/constants/theme';

const sections = [
  { href: './coaches', title: 'Coach', description: 'Stato account, piano, clienti usati e scadenza.' },
  { href: './plans', title: 'Piani', description: 'Limiti clienti, feature premium e override manuali.' },
  { href: './payment-events', title: 'Pagamenti', description: 'Storico eventi RevenueCat, store e Stripe.' },
] as const satisfies readonly { href: Href; title: string; description: string }[];

export default function SuperadminDashboardConcept() {
  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <ThemedText type="title" style={styles.title}>
            Superadmin
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Concept tecnico per la dashboard ufficiale. Non collegato alla demo locale.
          </ThemedText>
        </View>

        {sections.map((section) => (
          <Link key={section.href} href={section.href} asChild>
            <Card style={styles.card}>
              <ThemedText type="smallBold">{section.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {section.description}
              </ThemedText>
            </Card>
          </Link>
        ))}
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
  header: {
    gap: Spacing.one,
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
  },
  card: {
    gap: Spacing.one,
  },
});
