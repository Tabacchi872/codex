import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppCard, AppEmptyState, AppHeader, AppScreen, AppSectionTitle, AppTextField } from '@/components/ui';
import {
  deleteDiaryEntry,
  getActiveNutritionPlan,
  getDiaryEntriesForDate,
  logDiaryEntry,
  saveGeneratedNutritionPlan,
  swapNutritionPlanMeal,
  type ActiveNutritionPlan,
} from '@/lib/client-nutrition-service';
import {
  generateMealPlan,
  getFoodByBarcode,
  getRecipeDetail,
  searchFoods,
  searchRecipes,
} from '@/lib/nutrition-service';
import { EMPTY_DIARY_ENTRIES, useNutritionStore } from '@/store/nutrition-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import type {
  MacroSplit,
  MealPlanDiet,
  MealPlanMeal,
  MealType,
  NutritionDiaryEntry,
  NutritionPlanMealRecord,
  RecipeCuisine,
  RecipeDiet,
  YmoveFood,
  YmoveRecipe,
} from '@/types/nutrition';

// FitCoach Nutrizione Fase 1 (YMove foods/recipes/mealplans, 2026-08-04).
// Sostituisce lo stub precedente (piano assegnato manualmente dal coach, mai
// avuto una UI coach reale) — vedi nota storica in types/nutrition.ts per il
// possibile sviluppo futuro (override del coach su un singolo pasto).
// Nessun accesso coach in questa fase: schermata solo cliente.

type Tab = 'oggi' | 'piano' | 'diario' | 'ricette';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const MEAL_TYPE_LABEL: Record<MealType, string> = {
  breakfast: 'Colazione',
  lunch: 'Pranzo',
  dinner: 'Cena',
  snack: 'Spuntino',
};

const MEALPLAN_DIET_OPTIONS: { value: MealPlanDiet; label: string }[] = [
  { value: 'balanced', label: 'Bilanciata' },
  { value: 'high_protein', label: 'Iperproteica' },
  { value: 'low_carb', label: 'Low carb' },
  { value: 'keto', label: 'Keto' },
  { value: 'vegan', label: 'Vegana' },
  { value: 'vegetarian', label: 'Vegetariana' },
  { value: 'mediterranean', label: 'Mediterranea' },
  { value: 'paleo', label: 'Paleo' },
];

const MACRO_SPLIT_OPTIONS: { value: MacroSplit; label: string }[] = [
  { value: 'balanced', label: 'Bilanciato' },
  { value: 'high_protein', label: 'Iperproteico' },
  { value: 'low_carb', label: 'Low carb' },
  { value: 'high_fat', label: 'Alto grassi' },
];

const RECIPE_DIET_OPTIONS: { value: RecipeDiet; label: string }[] = MEALPLAN_DIET_OPTIONS.filter(
  (o): o is { value: RecipeDiet; label: string } => o.value !== 'balanced',
);

const CUISINE_OPTIONS: { value: RecipeCuisine; label: string }[] = [
  { value: 'american', label: 'Americana' },
  { value: 'mediterranean', label: 'Mediterranea' },
  { value: 'asian', label: 'Asiatica' },
  { value: 'mexican', label: 'Messicana' },
  { value: 'italian', label: 'Italiana' },
  { value: 'indian', label: 'Indiana' },
  { value: 'japanese', label: 'Giapponese' },
];

export default function NutrizioneScreen() {
  const { colors } = useAppTheme();
  const [tab, setTab] = useState<Tab>('oggi');
  const activePlan = useNutritionStore((s) => s.activePlan);
  const activePlanLoaded = useNutritionStore((s) => s.activePlanLoaded);
  const setActivePlan = useNutritionStore((s) => s.setActivePlan);
  const [planLoadError, setPlanLoadError] = useState<string | null>(null);
  const [planLoadRetryKey, setPlanLoadRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPlanLoadError(null);
    getActiveNutritionPlan()
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setActivePlan(result.data);
          return;
        }
        // BUG (2026-08-04): senza questo ramo, un fallimento del
        // caricamento iniziale del piano lasciava activePlanLoaded per
        // sempre false (setActivePlan e' l'unico posto che lo imposta a
        // true) - la tab Piano restava bloccata su uno spinner, senza
        // errore ne' possibilita' di riprovare. Qui si sblocca comunque il
        // caricamento (activePlan=null, come "nessun piano") e si mostra
        // l'errore reale.
        setActivePlan(null);
        setPlanLoadError(result.message);
      })
      .catch(() => {
        if (cancelled) return;
        setActivePlan(null);
        setPlanLoadError('Errore imprevisto nel caricare il piano nutrizionale.');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planLoadRetryKey]);

  return (
    <AppScreen>
      <AppHeader title="Nutrizione" />

      <View style={styles.tabRow}>
        <TabButton label="Oggi" active={tab === 'oggi'} onPress={() => setTab('oggi')} />
        <TabButton label="Piano" active={tab === 'piano'} onPress={() => setTab('piano')} />
        <TabButton label="Diario" active={tab === 'diario'} onPress={() => setTab('diario')} />
        <TabButton label="Ricette" active={tab === 'ricette'} onPress={() => setTab('ricette')} />
      </View>

      {tab === 'oggi' ? <OggiTab activePlan={activePlan} /> : null}
      {tab === 'piano' ? (
        !activePlanLoaded ? (
          <ActivityIndicator style={styles.loading} />
        ) : (
          <>
            {planLoadError ? (
              <AppCard style={styles.stack}>
                <Text style={{ color: colors.rust, fontSize: AppFontSize.sm }}>{planLoadError}</Text>
                <AppButton label="Riprova" size="sm" onPress={() => setPlanLoadRetryKey((k) => k + 1)} />
              </AppCard>
            ) : null}
            <PianoTab activePlan={activePlan} onPlanChanged={setActivePlan} />
          </>
        )
      ) : null}
      {tab === 'diario' ? <DiarioTab /> : null}
      {tab === 'ricette' ? <RicetteTab /> : null}
    </AppScreen>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={[styles.tabButton, { backgroundColor: active ? colors.moss : 'transparent', borderColor: colors.moss }]}>
      <Text style={[styles.tabButtonLabel, { color: active ? colors.onMoss : colors.moss }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <AppSectionTitle>{title.toUpperCase()}</AppSectionTitle>
      {children}
    </View>
  );
}

function MacroStat({ label, value, unit }: { label: string; value: number; unit?: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.macroStat}>
      <Text style={[styles.macroValue, { color: colors.ink }]}>
        {Math.round(value)}
        {unit ?? ''}
      </Text>
      <Text style={[styles.macroLabel, { color: colors.inkSoft }]}>{label}</Text>
    </View>
  );
}

// ============================= TAB OGGI =============================

function OggiTab({ activePlan }: { activePlan: ActiveNutritionPlan | null }) {
  const { colors } = useAppTheme();
  const today = useMemo(() => todayIso(), []);
  const entries = useNutritionStore((s) => s.diaryByDate[today] ?? EMPTY_DIARY_ENTRIES);
  const setDiaryForDate = useNutritionStore((s) => s.setDiaryForDate);
  const addDiaryEntry = useNutritionStore((s) => s.addDiaryEntry);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAddFood, setShowAddFood] = useState(false);
  const [showBarcode, setShowBarcode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    getDiaryEntriesForDate(today)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setDiaryForDate(today, result.data);
        } else {
          setLoadError(result.message);
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError('Errore imprevisto nel caricare i pasti di oggi.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  const totals = entries.reduce(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      protein: acc.protein + e.protein,
      carbs: acc.carbs + e.carbs,
      fat: acc.fat + e.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  const targetCalories = activePlan?.plan.averageDailyTotals.calories ?? activePlan?.plan.calories ?? null;

  return (
    <>
      <Section title="Oggi">
        <AppCard style={styles.macrosRow}>
          <MacroStat label={targetCalories ? `Kcal / ${Math.round(targetCalories)}` : 'Kcal'} value={totals.calories} />
          <MacroStat label="Proteine" value={totals.protein} unit="g" />
          <MacroStat label="Carboidrati" value={totals.carbs} unit="g" />
          <MacroStat label="Grassi" value={totals.fat} unit="g" />
        </AppCard>
      </Section>

      <View style={styles.rowGap}>
        <AppButton label="Aggiungi alimento" onPress={() => setShowAddFood(true)} size="sm" />
        <AppButton label="Scanner barcode" variant="outline" onPress={() => setShowBarcode(true)} size="sm" />
      </View>

      <Section title="Pasti di oggi">
        {loadError ? <Text style={{ color: colors.rust, fontSize: AppFontSize.sm }}>{loadError}</Text> : null}
        {loading ? (
          <ActivityIndicator />
        ) : entries.length === 0 ? (
          <AppCard>
            <AppEmptyState title="Nessun alimento registrato" subtitle="Aggiungi un alimento o scansiona un barcode per iniziare." />
          </AppCard>
        ) : (
          <View style={styles.stack}>
            {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((mealType) => {
              const mealEntries = entries.filter((e) => e.mealType === mealType);
              if (mealEntries.length === 0) return null;
              return (
                <AppCard key={mealType} style={styles.mealCard}>
                  <Text style={[styles.mealName, { color: colors.ink }]}>{MEAL_TYPE_LABEL[mealType]}</Text>
                  {mealEntries.map((e) => (
                    <Text key={e.id} style={[styles.listItem, { color: colors.inkSoft }]}>
                      · {e.name} — {Math.round(e.calories)} kcal
                      {e.quantityGrams ? ` (${e.quantityGrams} g)` : ''}
                    </Text>
                  ))}
                </AppCard>
              );
            })}
          </View>
        )}
      </Section>

      {showAddFood ? (
        <AddFoodModal
          onClose={() => setShowAddFood(false)}
          onLogged={(entry) => {
            addDiaryEntry(today, entry);
            setShowAddFood(false);
          }}
          entryDate={today}
        />
      ) : null}
      {showBarcode ? (
        <BarcodeModal
          onClose={() => setShowBarcode(false)}
          onLogged={(entry) => {
            addDiaryEntry(today, entry);
            setShowBarcode(false);
          }}
          entryDate={today}
        />
      ) : null}
    </>
  );
}

// Quantita' in grammi: scala calorie/protein/carbs/fat da servingSize del
// food (macro per serving, salvo uso di per=100g nella ricerca — vedi
// nota in types/nutrition.ts). Default = servingSize del food (fattore 1).
function LogFoodQuantityStep({
  food,
  mealType,
  entryDate,
  onDone,
  onCancel,
}: {
  food: YmoveFood;
  mealType: MealType;
  entryDate: string;
  onDone: (entry: NutritionDiaryEntry) => void;
  onCancel: () => void;
}) {
  const { colors } = useAppTheme();
  const [grams, setGrams] = useState(String(food.servingSize || 100));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gramsNum = Number(grams) || 0;
  const factor = food.servingSize > 0 ? gramsNum / food.servingSize : 0;
  const scaled = {
    calories: food.calories * factor,
    protein: food.protein * factor,
    carbs: food.carbs * factor,
    fat: food.fat * factor,
  };

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await logDiaryEntry({
      entryDate,
      mealType,
      source: 'food',
      ymoveFoodId: food.id,
      name: food.shortName,
      quantityGrams: gramsNum,
      calories: scaled.calories,
      protein: scaled.protein,
      carbs: scaled.carbs,
      fat: scaled.fat,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onDone(result.data);
  }

  return (
    <View style={styles.stack}>
      <Text style={[styles.mealName, { color: colors.ink }]}>{food.shortName}</Text>
      <AppTextField label="Quantita' (grammi)" keyboardType="numeric" value={grams} onChangeText={setGrams} />
      <View style={styles.macrosRow}>
        <MacroStat label="Kcal" value={scaled.calories} />
        <MacroStat label="Proteine" value={scaled.protein} unit="g" />
        <MacroStat label="Carb" value={scaled.carbs} unit="g" />
        <MacroStat label="Grassi" value={scaled.fat} unit="g" />
      </View>
      {error ? <Text style={{ color: colors.rust, fontSize: AppFontSize.sm }}>{error}</Text> : null}
      <View style={styles.rowGap}>
        <AppButton label="Aggiungi al diario" onPress={handleSave} loading={saving} size="sm" />
        <AppButton label="Annulla" variant="ghost" onPress={onCancel} size="sm" />
      </View>
    </View>
  );
}

function AddFoodModal({
  onClose,
  onLogged,
  entryDate,
}: {
  onClose: () => void;
  onLogged: (entry: NutritionDiaryEntry) => void;
  entryDate: string;
}) {
  const { colors } = useAppTheme();
  const [query, setQuery] = useState('');
  const [mealType, setMealType] = useState<MealType>('breakfast');
  const [results, setResults] = useState<YmoveFood[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<YmoveFood | null>(null);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    const result = await searchFoods({ query: query.trim(), country: 'IT', page: 1, pageSize: 20 });
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setResults(result.data.items);
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
          {selected ? (
            <LogFoodQuantityStep
              food={selected}
              mealType={mealType}
              entryDate={entryDate}
              onDone={onLogged}
              onCancel={() => setSelected(null)}
            />
          ) : (
            <View style={styles.stack}>
              <Text style={[styles.mealName, { color: colors.ink }]}>Aggiungi alimento</Text>
              <View style={styles.rowGapWrap}>
                {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((mt) => (
                  <ChipButton key={mt} label={MEAL_TYPE_LABEL[mt]} active={mealType === mt} onPress={() => setMealType(mt)} />
                ))}
              </View>
              <AppTextField
                label="Cerca alimento"
                placeholder="es. petto di pollo"
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={handleSearch}
                returnKeyType="search"
              />
              <AppButton label="Cerca" onPress={handleSearch} loading={loading} size="sm" />
              {error ? <Text style={{ color: colors.rust, fontSize: AppFontSize.sm }}>{error}</Text> : null}
              <View style={styles.resultsList}>
                {results.map((f) => (
                  <Pressable key={f.id} onPress={() => setSelected(f)} style={[styles.resultRow, { borderColor: colors.border }]}>
                    <Text style={[styles.listItem, { color: colors.ink, fontWeight: '700' }]}>{f.shortName}</Text>
                    <Text style={[styles.listItem, { color: colors.inkSoft }]}>
                      {Math.round(f.calories)} kcal · {f.servingDescription ?? `${f.servingSize} g`}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <AppButton label="Chiudi" variant="ghost" onPress={onClose} size="sm" />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function BarcodeModal({
  onClose,
  onLogged,
  entryDate,
}: {
  onClose: () => void;
  onLogged: (entry: NutritionDiaryEntry) => void;
  entryDate: string;
}) {
  const { colors } = useAppTheme();
  const [upc, setUpc] = useState('');
  const [mealType, setMealType] = useState<MealType>('breakfast');
  const [food, setFood] = useState<YmoveFood | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // NOTA: input manuale del codice, non scanner fotocamera reale — vedi
  // spiegazione nel report finale (nessuna dipendenza camera esistente nel
  // progetto, non verificabile in questo ambiente). Il lookup passa comunque
  // sempre dal backend, mai un valore finto.
  async function handleLookup() {
    if (!upc.trim()) return;
    setLoading(true);
    setError(null);
    setFood(null);
    const result = await getFoodByBarcode(upc.trim(), 'IT');
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setFood(result.data);
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
          {food ? (
            <LogFoodQuantityStep food={food} mealType={mealType} entryDate={entryDate} onDone={onLogged} onCancel={() => setFood(null)} />
          ) : (
            <View style={styles.stack}>
              <Text style={[styles.mealName, { color: colors.ink }]}>Cerca per barcode</Text>
              <Text style={[styles.listItem, { color: colors.inkSoft }]}>
                Inserisci il codice a barre (UPC/EAN) — es. dal retro della confezione.
              </Text>
              <View style={styles.rowGapWrap}>
                {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((mt) => (
                  <ChipButton key={mt} label={MEAL_TYPE_LABEL[mt]} active={mealType === mt} onPress={() => setMealType(mt)} />
                ))}
              </View>
              <AppTextField label="Codice a barre" keyboardType="numeric" value={upc} onChangeText={setUpc} onSubmitEditing={handleLookup} />
              <AppButton label="Cerca" onPress={handleLookup} loading={loading} size="sm" />
              {error ? <Text style={{ color: colors.rust, fontSize: AppFontSize.sm }}>{error}</Text> : null}
              <AppButton label="Chiudi" variant="ghost" onPress={onClose} size="sm" />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ============================= TAB PIANO =============================

function PianoTab({
  activePlan,
  onPlanChanged,
}: {
  activePlan: ActiveNutritionPlan | null;
  onPlanChanged: (plan: ActiveNutritionPlan | null) => void;
}) {
  const { colors } = useAppTheme();
  const [selectedDay, setSelectedDay] = useState(1);
  const [showGenerator, setShowGenerator] = useState(!activePlan);

  useEffect(() => {
    setSelectedDay(1);
    setShowGenerator(!activePlan);
  }, [activePlan?.plan.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function refreshPlan() {
    const result = await getActiveNutritionPlan();
    if (result.ok) onPlanChanged(result.data);
  }

  if (showGenerator || !activePlan) {
    return <PlanGeneratorForm onGenerated={refreshPlan} />;
  }

  const day = activePlan.days.find((d) => d.dayIndex === selectedDay) ?? activePlan.days[0];

  return (
    <>
      <Section title="Il tuo piano">
        <AppCard style={styles.stack}>
          <Text style={[styles.listItem, { color: colors.inkSoft }]}>
            {activePlan.plan.calories} kcal/giorno · {activePlan.plan.mealsPerDay} pasti · {activePlan.plan.daysCount} giorni
          </Text>
          <AppButton label="Genera un nuovo piano" variant="outline" size="sm" onPress={() => setShowGenerator(true)} />
        </AppCard>
      </Section>

      {activePlan.days.length > 1 ? (
        <View style={styles.rowGapWrap}>
          {activePlan.days.map((d) => (
            <ChipButton key={d.id} label={`Giorno ${d.dayIndex}`} active={d.dayIndex === selectedDay} onPress={() => setSelectedDay(d.dayIndex)} />
          ))}
        </View>
      ) : null}

      {day ? (
        <>
          <Section title={`Totali giorno ${day.dayIndex}`}>
            <AppCard style={styles.macrosRow}>
              <MacroStat label="Kcal" value={day.totals.calories} />
              <MacroStat label="Proteine" value={day.totals.protein} unit="g" />
              <MacroStat label="Carboidrati" value={day.totals.carbs} unit="g" />
              <MacroStat label="Grassi" value={day.totals.fat} unit="g" />
            </AppCard>
          </Section>

          <Section title="Pasti">
            <View style={styles.stack}>
              {day.meals.map((meal) => (
                <PlanMealCard key={meal.id} meal={meal} planDiet={activePlan.plan.diet} onSwapped={refreshPlan} />
              ))}
            </View>
          </Section>
        </>
      ) : null}
    </>
  );
}

function PlanGeneratorForm({ onGenerated }: { onGenerated: () => void }) {
  const { colors } = useAppTheme();
  const [calories, setCalories] = useState('2000');
  const [diet, setDiet] = useState<MealPlanDiet>('balanced');
  const [meals, setMeals] = useState(3);
  const [days, setDays] = useState(1);
  const [macroSplit, setMacroSplit] = useState<MacroSplit>('balanced');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    const caloriesNum = Number(calories);
    if (!Number.isFinite(caloriesNum) || caloriesNum <= 0) {
      setError('Inserisci un target calorico valido.');
      return;
    }
    setLoading(true);
    setError(null);
    const genResult = await generateMealPlan({ calories: caloriesNum, diet, meals, days, macroSplit });
    if (!genResult.ok) {
      setLoading(false);
      setError(genResult.message);
      return;
    }
    const saveResult = await saveGeneratedNutritionPlan(genResult.data);
    setLoading(false);
    if (!saveResult.ok) {
      setError(saveResult.message);
      return;
    }
    onGenerated();
  }

  return (
    <Section title="Genera il tuo piano">
      <AppCard style={styles.stack}>
        <AppTextField label="Target calorie giornaliere" keyboardType="numeric" value={calories} onChangeText={setCalories} />

        <Text style={[styles.macroLabel, { color: colors.inkSoft }]}>Diet</Text>
        <View style={styles.rowGapWrap}>
          {MEALPLAN_DIET_OPTIONS.map((o) => (
            <ChipButton key={o.value} label={o.label} active={diet === o.value} onPress={() => setDiet(o.value)} />
          ))}
        </View>

        <Text style={[styles.macroLabel, { color: colors.inkSoft }]}>Distribuzione macro</Text>
        <View style={styles.rowGapWrap}>
          {MACRO_SPLIT_OPTIONS.map((o) => (
            <ChipButton key={o.value} label={o.label} active={macroSplit === o.value} onPress={() => setMacroSplit(o.value)} />
          ))}
        </View>

        <Text style={[styles.macroLabel, { color: colors.inkSoft }]}>Pasti al giorno (3-6)</Text>
        <View style={styles.rowGapWrap}>
          {[3, 4, 5, 6].map((n) => (
            <ChipButton key={n} label={String(n)} active={meals === n} onPress={() => setMeals(n)} />
          ))}
        </View>

        <Text style={[styles.macroLabel, { color: colors.inkSoft }]}>Giorni (1-7)</Text>
        <View style={styles.rowGapWrap}>
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <ChipButton key={n} label={String(n)} active={days === n} onPress={() => setDays(n)} />
          ))}
        </View>

        {error ? <Text style={{ color: colors.rust, fontSize: AppFontSize.sm }}>{error}</Text> : null}
        <AppButton label="Genera piano" onPress={handleGenerate} loading={loading} fullWidth />
      </AppCard>
    </Section>
  );
}

function PlanMealCard({
  meal,
  planDiet,
  onSwapped,
}: {
  meal: NutritionPlanMealRecord;
  planDiet: string;
  onSwapped: () => void;
}) {
  const { colors } = useAppTheme();
  const [expanded, setExpanded] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);

  // Segue esattamente la guida YMove per il cambio pasto: stesso mealType +
  // diet (mai 'balanced' su /recipes/search, verificato non essere un enum
  // valido li'), maxCalories/minProtein vicino al pasto attuale, esclude la
  // ricetta corrente, sceglie l'alternativa con calorie piu' vicine, poi
  // recupera il dettaglio completo prima di sostituire — MAI rigenera il piano.
  async function handleSwap() {
    setSwapping(true);
    setSwapError(null);
    const searchResult = await searchRecipes({
      mealType: meal.mealType,
      diet: planDiet === 'balanced' ? undefined : (planDiet as RecipeDiet),
      maxCalories: meal.calories + 150,
      minProtein: Math.max(0, meal.protein - 15),
      pageSize: 20,
    });
    if (!searchResult.ok) {
      setSwapping(false);
      setSwapError(searchResult.message);
      return;
    }
    const alternatives = searchResult.data.items.filter((r) => r.id !== meal.recipeId);
    if (alternatives.length === 0) {
      setSwapping(false);
      setSwapError('Nessuna alternativa trovata per questo pasto.');
      return;
    }
    const closest = alternatives.reduce((best, r) =>
      Math.abs(r.calories - meal.calories) < Math.abs(best.calories - meal.calories) ? r : best,
    );
    const detailResult = await getRecipeDetail(closest.id);
    if (!detailResult.ok) {
      setSwapping(false);
      setSwapError(detailResult.message);
      return;
    }
    const recipe = detailResult.data;
    const newMeal: MealPlanMeal = {
      type: meal.mealType,
      name: recipe.title,
      recipeId: recipe.id,
      recipeSlug: recipe.id,
      imageUrl: null,
      portionMultiplier: 1,
      calories: recipe.calories,
      protein: recipe.protein,
      carbs: recipe.carbs,
      fat: recipe.fat,
      recipe: {
        id: recipe.id,
        title: recipe.title,
        slug: recipe.id,
        description: recipe.description,
        mealType: recipe.mealType,
        cuisineType: recipe.cuisine,
        difficulty: null,
        prepTimeMin: recipe.prepTimeMinutes,
        cookTimeMin: recipe.cookTimeMinutes,
        servings: recipe.servings,
        dietTags: recipe.diet,
        instructions: recipe.instructions,
        imageUrl: null,
      },
      foods: recipe.ingredients.map((i) => ({ name: i.name, portion: i.amount, calories: i.calories, protein: i.protein, carbs: 0, fat: 0 })),
    };
    const swapResult = await swapNutritionPlanMeal(meal.id, newMeal);
    setSwapping(false);
    if (!swapResult.ok) {
      setSwapError(swapResult.message);
      return;
    }
    onSwapped();
  }

  return (
    <AppCard style={styles.stack}>
      <Pressable onPress={() => setExpanded((v) => !v)}>
        <Text style={[styles.mealName, { color: colors.ink }]}>
          {MEAL_TYPE_LABEL[meal.mealType]} · {meal.name}
        </Text>
        <Text style={[styles.listItem, { color: colors.inkSoft }]}>
          {Math.round(meal.calories)} kcal · P {Math.round(meal.protein)}g · C {Math.round(meal.carbs)}g · G {Math.round(meal.fat)}g
        </Text>
      </Pressable>

      {expanded ? (
        <View style={styles.stack}>
          {meal.recipe.instructions.length > 0 ? (
            <View>
              <Text style={[styles.macroLabel, { color: colors.inkSoft }]}>Istruzioni</Text>
              {meal.recipe.instructions.map((step, i) => (
                <Text key={i} style={[styles.listItem, { color: colors.ink }]}>
                  {i + 1}. {step}
                </Text>
              ))}
            </View>
          ) : null}
          {meal.foods.length > 0 ? (
            <View>
              <Text style={[styles.macroLabel, { color: colors.inkSoft }]}>Ingredienti</Text>
              {meal.foods.map((f, i) => (
                <Text key={i} style={[styles.listItem, { color: colors.inkSoft }]}>
                  · {f.name} ({f.portion})
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {swapError ? <Text style={{ color: colors.rust, fontSize: AppFontSize.sm }}>{swapError}</Text> : null}
      <AppButton label="Cambia pasto" variant="outline" size="sm" onPress={handleSwap} loading={swapping} />
    </AppCard>
  );
}

// ============================= TAB DIARIO =============================

function DiarioTab() {
  const { colors } = useAppTheme();
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const entries = useNutritionStore((s) => s.diaryByDate[selectedDate] ?? EMPTY_DIARY_ENTRIES);
  const setDiaryForDate = useNutritionStore((s) => s.setDiaryForDate);
  const removeDiaryEntry = useNutritionStore((s) => s.removeDiaryEntry);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    getDiaryEntriesForDate(selectedDate)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setDiaryForDate(selectedDate, result.data);
        } else {
          setLoadError(result.message);
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError('Errore imprevisto nel caricare il diario.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  function shiftDate(days: number) {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().slice(0, 10));
  }

  async function handleDelete(entryId: string) {
    setDeleteError(null);
    const result = await deleteDiaryEntry(entryId);
    if (result.ok) {
      removeDiaryEntry(selectedDate, entryId);
    } else {
      setDeleteError(result.message);
    }
  }

  // Ricalcolato SEMPRE dalle righe del diario effettivamente salvate, mai da
  // un totale memorizzato a parte.
  const totals = entries.reduce(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      protein: acc.protein + e.protein,
      carbs: acc.carbs + e.carbs,
      fat: acc.fat + e.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  return (
    <>
      <View style={styles.rowGap}>
        <AppButton label="◀" size="sm" variant="outline" onPress={() => shiftDate(-1)} />
        <Text style={[styles.mealName, { color: colors.ink, alignSelf: 'center' }]}>{selectedDate}</Text>
        <AppButton label="▶" size="sm" variant="outline" onPress={() => shiftDate(1)} />
      </View>

      <Section title="Totali">
        <AppCard style={styles.macrosRow}>
          <MacroStat label="Kcal" value={totals.calories} />
          <MacroStat label="Proteine" value={totals.protein} unit="g" />
          <MacroStat label="Carboidrati" value={totals.carbs} unit="g" />
          <MacroStat label="Grassi" value={totals.fat} unit="g" />
        </AppCard>
      </Section>

      <Section title="Voci registrate">
        {loadError ? <Text style={{ color: colors.rust, fontSize: AppFontSize.sm }}>{loadError}</Text> : null}
        {deleteError ? <Text style={{ color: colors.rust, fontSize: AppFontSize.sm }}>{deleteError}</Text> : null}
        {loading ? (
          <ActivityIndicator />
        ) : entries.length === 0 ? (
          <AppCard>
            <AppEmptyState title="Nessuna voce per questo giorno" />
          </AppCard>
        ) : (
          <View style={styles.stack}>
            {entries.map((e) => (
              <AppCard key={e.id} style={styles.rowSpaceBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.listItem, { color: colors.ink, fontWeight: '700' }]}>
                    {MEAL_TYPE_LABEL[e.mealType]} · {e.name}
                  </Text>
                  <Text style={[styles.listItem, { color: colors.inkSoft }]}>
                    {Math.round(e.calories)} kcal
                    {e.quantityGrams ? ` · ${e.quantityGrams} g` : ''}
                    {e.quantityPortions ? ` · ${e.quantityPortions} porzioni` : ''}
                  </Text>
                </View>
                <AppButton label="Rimuovi" variant="ghost" size="sm" onPress={() => handleDelete(e.id)} />
              </AppCard>
            ))}
          </View>
        )}
      </Section>
    </>
  );
}

// ============================= TAB RICETTE =============================

function RicetteTab() {
  const { colors } = useAppTheme();
  const [query, setQuery] = useState('');
  const [diet, setDiet] = useState<RecipeDiet | null>(null);
  const [cuisine, setCuisine] = useState<RecipeCuisine | null>(null);
  const [mealType, setMealType] = useState<MealType | null>(null);
  const [results, setResults] = useState<YmoveRecipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function handleSearch() {
    setLoading(true);
    setError(null);
    const result = await searchRecipes({
      query: query.trim() || undefined,
      diet: diet ?? undefined,
      cuisine: cuisine ?? undefined,
      mealType: mealType ?? undefined,
      pageSize: 20,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setResults(result.data.items);
  }

  return (
    <>
      <Section title="Cerca ricette">
        <AppCard style={styles.stack}>
          <AppTextField label="Cerca" placeholder="es. insalata di pollo" value={query} onChangeText={setQuery} onSubmitEditing={handleSearch} />
          <Text style={[styles.macroLabel, { color: colors.inkSoft }]}>Diet</Text>
          <View style={styles.rowGapWrap}>
            {RECIPE_DIET_OPTIONS.map((o) => (
              <ChipButton key={o.value} label={o.label} active={diet === o.value} onPress={() => setDiet(diet === o.value ? null : o.value)} />
            ))}
          </View>
          <Text style={[styles.macroLabel, { color: colors.inkSoft }]}>Cucina</Text>
          <View style={styles.rowGapWrap}>
            {CUISINE_OPTIONS.map((o) => (
              <ChipButton key={o.value} label={o.label} active={cuisine === o.value} onPress={() => setCuisine(cuisine === o.value ? null : o.value)} />
            ))}
          </View>
          <Text style={[styles.macroLabel, { color: colors.inkSoft }]}>Pasto</Text>
          <View style={styles.rowGapWrap}>
            {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((mt) => (
              <ChipButton key={mt} label={MEAL_TYPE_LABEL[mt]} active={mealType === mt} onPress={() => setMealType(mealType === mt ? null : mt)} />
            ))}
          </View>
          {error ? <Text style={{ color: colors.rust, fontSize: AppFontSize.sm }}>{error}</Text> : null}
          <AppButton label="Cerca" onPress={handleSearch} loading={loading} fullWidth />
        </AppCard>
      </Section>

      <Section title="Risultati">
        {results.length === 0 ? (
          <AppCard>
            <AppEmptyState title="Nessun risultato" subtitle="Prova a cercare o cambiare i filtri." />
          </AppCard>
        ) : (
          <View style={styles.stack}>
            {results.map((r) => (
              <AppCard key={r.id} style={styles.stack}>
                <Pressable onPress={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                  <Text style={[styles.mealName, { color: colors.ink }]}>{r.title}</Text>
                  <Text style={[styles.listItem, { color: colors.inkSoft }]}>
                    {Math.round(r.calories)} kcal · P {Math.round(r.protein)}g · {r.prepTimeMinutes + r.cookTimeMinutes} min
                  </Text>
                </Pressable>
                {expandedId === r.id ? (
                  <View style={styles.stack}>
                    {r.instructions.map((step, i) => (
                      <Text key={i} style={[styles.listItem, { color: colors.ink }]}>
                        {i + 1}. {step}
                      </Text>
                    ))}
                    {r.ingredients.map((ing, i) => (
                      <Text key={i} style={[styles.listItem, { color: colors.inkSoft }]}>
                        · {ing.name} ({ing.amount})
                      </Text>
                    ))}
                  </View>
                ) : null}
              </AppCard>
            ))}
          </View>
        )}
      </Section>
    </>
  );
}

function ChipButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, { backgroundColor: active ? colors.moss : colors.surfaceSubtle, borderColor: colors.border }]}>
      <Text style={[styles.chipLabel, { color: active ? colors.onMoss : colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loading: {
    marginTop: AppSpacing[4],
  },
  section: {
    gap: AppSpacing[2],
  },
  tabRow: {
    flexDirection: 'row',
    gap: AppSpacing[2],
  },
  tabButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: AppRadius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonLabel: {
    fontSize: AppFontSize.xs,
    fontWeight: '700',
  },
  stack: {
    gap: AppSpacing[3],
  },
  rowGap: {
    flexDirection: 'row',
    gap: AppSpacing[2],
  },
  rowGapWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  rowSpaceBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: AppSpacing[2],
  },
  mealCard: {
    gap: 4,
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
    flexBasis: 80,
    flexGrow: 1,
    gap: 2,
  },
  macroValue: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  macroLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: AppRadius.md,
    paddingHorizontal: AppSpacing[3],
    paddingVertical: AppSpacing[1] + 2,
  },
  chipLabel: {
    fontSize: AppFontSize.xs,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: AppRadius.lg,
    borderTopRightRadius: AppRadius.lg,
    padding: AppSpacing[5],
    maxHeight: '85%',
  },
  resultsList: {
    gap: AppSpacing[2],
  },
  resultRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: AppRadius.md,
    padding: AppSpacing[3],
    gap: 2,
  },
});
