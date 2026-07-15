import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppCard, AppHeader, AppScreen, AppSectionTitle } from '@/components/ui';
import { useAuthStore } from '@/store/auth-store';
import { useNutritionStore } from '@/store/nutrition-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';

// Nessuna UI coach per assegnare piani nutrizionali esiste ancora (fuori scope
// di questo intervento, lato cliente): lo store parte vuoto di proposito, quindi
// gli stati vuoti qui sotto sono lo stato REALE, non un placeholder finto.
export default function NutrizioneScreen() {
  const { colors } = useAppTheme();
  const currentClientId = useAuthStore((s) => s.currentClientId);
  const plans = useNutritionStore((s) => s.plans);
  const hasHydrated = useNutritionStore((s) => s.hasHydrated);

  const plan = plans.find((p) => p.clientId === currentClientId) ?? null;

  if (!hasHydrated) {
    return (
      <AppScreen scroll={false}>
        <View style={styles.loading}>
          <Text style={{ color: colors.inkSoft }}>Caricamento…</Text>
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <AppHeader title="Nutrizione" />

      <Section title="Piano alimentare">
        {plan ? (
          <AppCard>
            <Text style={[styles.planTitle, { color: colors.ink }]}>{plan.title}</Text>
          </AppCard>
        ) : (
          <EmptyNote text="Nessun piano nutrizionale assegnato dal tuo coach." />
        )}
      </Section>

      {plan && plan.meals.length > 0 ? (
        <Section title="Pasti">
          <View style={styles.stack}>
            {plan.meals.map((meal) => (
              <AppCard key={meal.id} style={styles.mealCard}>
                <Text style={[styles.mealName, { color: colors.ink }]}>
                  {meal.name}
                  {meal.time ? ` · ${meal.time}` : ''}
                </Text>
                {meal.foods.map((food, index) => (
                  <Text key={index} style={[styles.listItem, { color: colors.inkSoft }]}>
                    · {food}
                  </Text>
                ))}
              </AppCard>
            ))}
          </View>
        </Section>
      ) : null}

      <Section title="Macronutrienti">
        {plan?.macros ? (
          <AppCard style={styles.macrosRow}>
            <MacroStat label="Kcal" value={plan.macros.calories} />
            <MacroStat label="Proteine" value={plan.macros.proteinGrams} unit="g" />
            <MacroStat label="Carboidrati" value={plan.macros.carbsGrams} unit="g" />
            <MacroStat label="Grassi" value={plan.macros.fatGrams} unit="g" />
          </AppCard>
        ) : (
          <EmptyNote text="Nessun target di macronutrienti impostato." />
        )}
      </Section>

      <Section title="Consigli nutrizionali">
        {plan && plan.tips.length > 0 ? (
          <AppCard style={styles.listCard}>
            {plan.tips.map((tip, index) => (
              <Text key={index} style={[styles.listItem, { color: colors.inkSoft }]}>
                · {tip}
              </Text>
            ))}
          </AppCard>
        ) : (
          <EmptyNote text="Nessun consiglio disponibile al momento." />
        )}
      </Section>

      <Section title="Integrazioni">
        {plan && plan.supplements.length > 0 ? (
          <AppCard style={styles.listCard}>
            {plan.supplements.map((s) => (
              <Text key={s.id} style={[styles.listItem, { color: colors.inkSoft }]}>
                · {s.name} — {s.dosage}
                {s.timing ? ` (${s.timing})` : ''}
              </Text>
            ))}
          </AppCard>
        ) : (
          <EmptyNote text="Nessuna integrazione consigliata al momento." />
        )}
      </Section>

      <Section title="Lista della spesa">
        {plan && plan.shoppingList.length > 0 ? (
          <AppCard style={styles.listCard}>
            {plan.shoppingList.map((item, index) => (
              <Text key={index} style={[styles.listItem, { color: colors.inkSoft }]}>
                · {item}
              </Text>
            ))}
          </AppCard>
        ) : (
          <EmptyNote text="Nessuna lista della spesa disponibile al momento." />
        )}
      </Section>
    </AppScreen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <AppSectionTitle>{title.toUpperCase()}</AppSectionTitle>
      {children}
    </View>
  );
}

// Stato vuoto discreto per sezione (a differenza di AppEmptyState, che è
// pensato per un solo blocco per schermata con icona): qui ci sono 5 sezioni
// indipendenti, un'icona per ciascuna sarebbe ridondante — solo testo su
// sfondo neutro, stesso ruolo di PlaceholderBanner ma con i token del nuovo
// design system.
function EmptyNote({ text }: { text: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.emptyNote, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
      <Text style={[styles.emptyNoteText, { color: colors.inkSoft }]}>{text}</Text>
    </View>
  );
}

function MacroStat({ label, value, unit }: { label: string; value: number | undefined; unit?: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.macroStat}>
      <Text style={[styles.macroValue, { color: colors.ink }]}>{value !== undefined ? `${value}${unit ?? ''}` : '—'}</Text>
      <Text style={[styles.macroLabel, { color: colors.inkSoft }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: AppSpacing[2],
  },
  planTitle: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  stack: {
    gap: AppSpacing[3],
  },
  mealCard: {
    gap: 2,
  },
  mealName: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  listItem: {
    fontSize: AppFontSize.sm,
  },
  macrosRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
    justifyContent: 'space-around',
  },
  macroStat: {
    alignItems: 'center',
    flexBasis: 120,
    flexGrow: 1,
    gap: 2,
  },
  macroValue: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  macroLabel: {
    fontSize: AppFontSize.sm,
  },
  listCard: {
    gap: 4,
  },
  emptyNote: {
    borderRadius: AppRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: AppSpacing[2],
    paddingHorizontal: AppSpacing[3],
  },
  emptyNoteText: {
    fontSize: AppFontSize.sm,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
