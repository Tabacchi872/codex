import type { ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { PlaceholderBanner } from '@/components/placeholder-banner';
import { ScreenBackground } from '@/components/screen-background';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuthStore } from '@/store/auth-store';
import { useNutritionStore } from '@/store/nutrition-store';

// Nessuna UI coach per assegnare piani nutrizionali esiste ancora (fuori scope
// di questo intervento, lato cliente): lo store parte vuoto di proposito, quindi
// gli stati vuoti qui sotto sono lo stato REALE, non un placeholder finto.
export default function NutrizioneScreen() {
  const insets = useSafeAreaInsets();
  const currentClientId = useAuthStore((s) => s.currentClientId);
  const plans = useNutritionStore((s) => s.plans);
  const hasHydrated = useNutritionStore((s) => s.hasHydrated);

  const plan = plans.find((p) => p.clientId === currentClientId) ?? null;

  if (!hasHydrated) {
    return (
      <ScreenBackground>
        <View style={styles.loading}>
          <ThemedText type="default" themeColor="textSecondary">
            Caricamento…
          </ThemedText>
        </View>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Platform.OS === 'web' ? Spacing.five : insets.top + Spacing.three, paddingBottom: Spacing.six },
        ]}>
        <ThemedText type="title" style={styles.title}>
          Nutrizione
        </ThemedText>

        <Section title="Piano alimentare">
          {plan ? (
            <ThemedText type="default" style={styles.planTitle}>
              {plan.title}
            </ThemedText>
          ) : (
            <PlaceholderBanner text="Nessun piano nutrizionale assegnato dal tuo coach." />
          )}
        </Section>

        {plan && plan.meals.length > 0 && (
          <Section title="Pasti">
            {plan.meals.map((meal) => (
              <Card key={meal.id} style={styles.mealCard}>
                <ThemedText type="smallBold">
                  {meal.name}
                  {meal.time ? ` · ${meal.time}` : ''}
                </ThemedText>
                {meal.foods.map((food, index) => (
                  <ThemedText key={index} type="small" themeColor="textSecondary">
                    · {food}
                  </ThemedText>
                ))}
              </Card>
            ))}
          </Section>
        )}

        <Section title="Macronutrienti">
          {plan?.macros ? (
            <Card style={styles.macrosRow}>
              <MacroStat label="Kcal" value={plan.macros.calories} />
              <MacroStat label="Proteine" value={plan.macros.proteinGrams} unit="g" />
              <MacroStat label="Carboidrati" value={plan.macros.carbsGrams} unit="g" />
              <MacroStat label="Grassi" value={plan.macros.fatGrams} unit="g" />
            </Card>
          ) : (
            <PlaceholderBanner text="Nessun target di macronutrienti impostato." />
          )}
        </Section>

        <Section title="Consigli nutrizionali">
          {plan && plan.tips.length > 0 ? (
            <Card style={styles.listCard}>
              {plan.tips.map((tip, index) => (
                <ThemedText key={index} type="small" themeColor="textSecondary">
                  · {tip}
                </ThemedText>
              ))}
            </Card>
          ) : (
            <PlaceholderBanner text="Nessun consiglio disponibile al momento." />
          )}
        </Section>

        <Section title="Integrazioni">
          {plan && plan.supplements.length > 0 ? (
            <Card style={styles.listCard}>
              {plan.supplements.map((s) => (
                <ThemedText key={s.id} type="small" themeColor="textSecondary">
                  · {s.name} — {s.dosage}
                  {s.timing ? ` (${s.timing})` : ''}
                </ThemedText>
              ))}
            </Card>
          ) : (
            <PlaceholderBanner text="Nessuna integrazione consigliata al momento." />
          )}
        </Section>

        <Section title="Lista della spesa">
          {plan && plan.shoppingList.length > 0 ? (
            <Card style={styles.listCard}>
              {plan.shoppingList.map((item, index) => (
                <ThemedText key={index} type="small" themeColor="textSecondary">
                  · {item}
                </ThemedText>
              ))}
            </Card>
          ) : (
            <PlaceholderBanner text="Nessuna lista della spesa disponibile al momento." />
          )}
        </Section>
      </ScrollView>
    </ScreenBackground>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" style={styles.sectionLabel}>
        {title.toUpperCase()}
      </ThemedText>
      {children}
    </View>
  );
}

function MacroStat({ label, value, unit }: { label: string; value: number | undefined; unit?: string }) {
  return (
    <View style={styles.macroStat}>
      <ThemedText type="smallBold">{value !== undefined ? `${value}${unit ?? ''}` : '—'}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
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
  section: {
    gap: Spacing.two,
  },
  sectionLabel: {
    letterSpacing: 0.4,
  },
  planTitle: {
    fontWeight: '700',
  },
  mealCard: {
    gap: 2,
  },
  macrosRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  macroStat: {
    alignItems: 'center',
    gap: 2,
  },
  listCard: {
    gap: 4,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
