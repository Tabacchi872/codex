import { supabase, supabaseConfig } from './supabase';

import type {
  MealPlanDayTotals,
  MealPlanMeal,
  MealPlanMealFood,
  MealPlanMealRecipe,
  MealType,
  NutritionDiaryEntry,
  NutritionDiaryEntrySource,
  NutritionPlanDayRecord,
  NutritionPlanMealRecord,
  NutritionPlanRecord,
  YmoveMealPlan,
} from '@/types/nutrition';

// FitCoach Nutrizione Fase 1 (2026-08-04): persistenza Supabase del piano
// generato (client_nutrition_plans/plan_days/plan_meals) e del diario
// (client_nutrition_diary_entries). Scritture di piano/pasto passano sempre
// dalle RPC SECURITY DEFINER (save_nutrition_plan/swap_nutrition_plan_meal —
// vedi supabase/migrations/20260821090000_nutrition_phase1_schema.sql), mai
// un insert/update diretto sulle tabelle plan/day/meal da questo file. Il
// diario invece e' CRUD diretto sotto RLS owner-only (stesso pattern di
// client_excluded_exercises).

type ServiceResult<T> = { ok: true; data: T } | { ok: false; message: string };

const GENERIC_ERROR = 'Operazione non riuscita. Riprova.';

async function getAuthenticatedClientId(): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    if (__DEV__) console.warn('CLIENT_NUTRITION_SESSION_ERROR', error.message);
    return null;
  }
  return data.session?.user.id ?? null;
}

export type ActiveNutritionPlan = {
  plan: NutritionPlanRecord;
  days: (NutritionPlanDayRecord & { meals: NutritionPlanMealRecord[] })[];
};

function mapMealRow(row: {
  id: string;
  plan_day_id: string;
  meal_order: number;
  meal_type: string;
  recipe_id: string;
  recipe_slug: string;
  name: string;
  image_url: string | null;
  portion_multiplier: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  recipe_snapshot: unknown;
  foods_snapshot: unknown;
  swapped_at: string | null;
}): NutritionPlanMealRecord {
  return {
    id: row.id,
    planDayId: row.plan_day_id,
    mealOrder: row.meal_order,
    mealType: row.meal_type as MealType,
    recipeId: row.recipe_id,
    recipeSlug: row.recipe_slug,
    name: row.name,
    imageUrl: row.image_url,
    portionMultiplier: row.portion_multiplier,
    calories: row.calories,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    recipe: (row.recipe_snapshot ?? {}) as MealPlanMealRecipe,
    foods: (row.foods_snapshot ?? []) as MealPlanMealFood[],
    swappedAt: row.swapped_at,
  };
}

// Nessun piano attivo = null, mai un errore: e' lo stato reale finche' il
// cliente non ne genera uno (stesso principio di "onestamente vuoto" gia'
// applicato altrove in questo store).
export async function getActiveNutritionPlan(): Promise<ServiceResult<ActiveNutritionPlan | null>> {
  if (!supabaseConfig.isConfigured || !supabase) return { ok: true, data: null };
  const clientId = await getAuthenticatedClientId();
  if (!clientId) return { ok: false, message: GENERIC_ERROR };

  const { data: planRow, error: planError } = await supabase
    .from('client_nutrition_plans')
    .select('id,client_id,status,calories,diet,meals_per_day,days_count,macro_split,average_daily_totals,generated_at')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .maybeSingle();

  if (planError) {
    if (__DEV__) console.warn('NUTRITION_PLAN_FETCH_ERROR', planError.message);
    return { ok: false, message: GENERIC_ERROR };
  }
  if (!planRow) return { ok: true, data: null };

  const { data: dayRows, error: dayError } = await supabase
    .from('client_nutrition_plan_days')
    .select('id,plan_id,day_index,totals')
    .eq('plan_id', planRow.id)
    .order('day_index', { ascending: true });

  if (dayError) {
    if (__DEV__) console.warn('NUTRITION_PLAN_DAYS_FETCH_ERROR', dayError.message);
    return { ok: false, message: GENERIC_ERROR };
  }

  const dayIds = (dayRows ?? []).map((d) => d.id);
  const { data: mealRows, error: mealError } = dayIds.length
    ? await supabase
        .from('client_nutrition_plan_meals')
        .select(
          'id,plan_day_id,meal_order,meal_type,recipe_id,recipe_slug,name,image_url,portion_multiplier,calories,protein,carbs,fat,recipe_snapshot,foods_snapshot,swapped_at',
        )
        .in('plan_day_id', dayIds)
        .order('meal_order', { ascending: true })
    : { data: [], error: null };

  if (mealError) {
    if (__DEV__) console.warn('NUTRITION_PLAN_MEALS_FETCH_ERROR', mealError.message);
    return { ok: false, message: GENERIC_ERROR };
  }

  const days = (dayRows ?? []).map((d) => ({
    id: d.id,
    planId: d.plan_id,
    dayIndex: d.day_index,
    totals: d.totals as MealPlanDayTotals,
    meals: (mealRows ?? []).filter((m) => m.plan_day_id === d.id).map(mapMealRow),
  }));

  return {
    ok: true,
    data: {
      plan: {
        id: planRow.id,
        clientId: planRow.client_id,
        status: planRow.status,
        calories: planRow.calories,
        diet: planRow.diet,
        mealsPerDay: planRow.meals_per_day,
        daysCount: planRow.days_count,
        macroSplit: planRow.macro_split,
        averageDailyTotals: planRow.average_daily_totals as MealPlanDayTotals,
        generatedAt: planRow.generated_at,
      },
      days,
    },
  };
}

// Salva un piano appena generato da /mealplans/generate. mealPlan.days e'
// SEMPRE la fonte usata (mai .meals/.totals, alias di solo giorno 1) — vedi
// nota in types/nutrition.ts e verifica OpenAPI in docs/WORKLOG.md.
export async function saveGeneratedNutritionPlan(mealPlan: YmoveMealPlan): Promise<ServiceResult<string>> {
  if (!supabaseConfig.isConfigured || !supabase) return { ok: false, message: GENERIC_ERROR };

  const { data, error } = await supabase.rpc('save_nutrition_plan', {
    p_calories: mealPlan.calories,
    p_diet: mealPlan.diet,
    p_meals_per_day: mealPlan.mealsPerDay,
    p_days_count: mealPlan.daysCount,
    p_macro_split: mealPlan.macroSplit,
    p_average_daily_totals: mealPlan.averageDailyTotals,
    p_days: mealPlan.days,
  });

  if (error) {
    if (__DEV__) console.warn('NUTRITION_PLAN_SAVE_ERROR', error.message);
    return { ok: false, message: GENERIC_ERROR };
  }
  return { ok: true, data: data as string };
}

// Sostituisce un pasto gia' generato con un'alternativa (vedi
// swap_nutrition_plan_meal): ricalcola i totali del solo giorno interessato,
// mai rigenera l'intero piano.
export async function swapNutritionPlanMeal(
  mealId: string,
  newMeal: MealPlanMeal,
): Promise<ServiceResult<MealPlanDayTotals>> {
  if (!supabaseConfig.isConfigured || !supabase) return { ok: false, message: GENERIC_ERROR };

  const { data, error } = await supabase.rpc('swap_nutrition_plan_meal', {
    p_meal_id: mealId,
    p_new_meal: newMeal,
  });

  if (error) {
    if (__DEV__) console.warn('NUTRITION_PLAN_SWAP_ERROR', error.message);
    return { ok: false, message: GENERIC_ERROR };
  }
  return { ok: true, data: data as MealPlanDayTotals };
}

export type LogDiaryEntryPayload = {
  entryDate: string;
  mealType: MealType;
  source: NutritionDiaryEntrySource;
  ymoveFoodId?: string | null;
  ymoveRecipeId?: string | null;
  name: string;
  quantityGrams?: number | null;
  quantityPortions?: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

function mapDiaryRow(row: {
  id: string;
  client_id: string;
  entry_date: string;
  meal_type: string;
  source: string;
  ymove_food_id: string | null;
  ymove_recipe_id: string | null;
  name: string;
  quantity_grams: number | null;
  quantity_portions: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}): NutritionDiaryEntry {
  return {
    id: row.id,
    clientId: row.client_id,
    entryDate: row.entry_date,
    mealType: row.meal_type as MealType,
    source: row.source as NutritionDiaryEntrySource,
    ymoveFoodId: row.ymove_food_id,
    ymoveRecipeId: row.ymove_recipe_id,
    name: row.name,
    quantityGrams: row.quantity_grams,
    quantityPortions: row.quantity_portions,
    calories: row.calories,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
  };
}

// entryDate in formato 'YYYY-MM-DD' (colonna date, non timestamptz).
export async function getDiaryEntriesForDate(entryDate: string): Promise<ServiceResult<NutritionDiaryEntry[]>> {
  if (!supabaseConfig.isConfigured || !supabase) return { ok: true, data: [] };
  const clientId = await getAuthenticatedClientId();
  if (!clientId) return { ok: false, message: GENERIC_ERROR };

  const { data, error } = await supabase
    .from('client_nutrition_diary_entries')
    .select('id,client_id,entry_date,meal_type,source,ymove_food_id,ymove_recipe_id,name,quantity_grams,quantity_portions,calories,protein,carbs,fat')
    .eq('client_id', clientId)
    .eq('entry_date', entryDate)
    .order('created_at', { ascending: true });

  if (error) {
    if (__DEV__) console.warn('NUTRITION_DIARY_FETCH_ERROR', error.message);
    return { ok: false, message: GENERIC_ERROR };
  }
  return { ok: true, data: (data ?? []).map(mapDiaryRow) };
}

export async function logDiaryEntry(payload: LogDiaryEntryPayload): Promise<ServiceResult<NutritionDiaryEntry>> {
  if (!supabaseConfig.isConfigured || !supabase) return { ok: false, message: GENERIC_ERROR };
  const clientId = await getAuthenticatedClientId();
  if (!clientId) return { ok: false, message: GENERIC_ERROR };

  const { data, error } = await supabase
    .from('client_nutrition_diary_entries')
    .insert({
      client_id: clientId,
      entry_date: payload.entryDate,
      meal_type: payload.mealType,
      source: payload.source,
      ymove_food_id: payload.ymoveFoodId ?? null,
      ymove_recipe_id: payload.ymoveRecipeId ?? null,
      name: payload.name,
      quantity_grams: payload.quantityGrams ?? null,
      quantity_portions: payload.quantityPortions ?? null,
      calories: payload.calories,
      protein: payload.protein,
      carbs: payload.carbs,
      fat: payload.fat,
    })
    .select('id,client_id,entry_date,meal_type,source,ymove_food_id,ymove_recipe_id,name,quantity_grams,quantity_portions,calories,protein,carbs,fat')
    .single();

  if (error) {
    if (__DEV__) console.warn('NUTRITION_DIARY_INSERT_ERROR', error.message);
    return { ok: false, message: GENERIC_ERROR };
  }
  return { ok: true, data: mapDiaryRow(data) };
}

export async function deleteDiaryEntry(entryId: string): Promise<ServiceResult<null>> {
  if (!supabaseConfig.isConfigured || !supabase) return { ok: false, message: GENERIC_ERROR };
  const clientId = await getAuthenticatedClientId();
  if (!clientId) return { ok: false, message: GENERIC_ERROR };

  // RLS gia' limita a client_id = auth.uid(): il filtro esplicito qui e'
  // difensivo, non l'unica barriera.
  const { error } = await supabase.from('client_nutrition_diary_entries').delete().eq('id', entryId).eq('client_id', clientId);

  if (error) {
    if (__DEV__) console.warn('NUTRITION_DIARY_DELETE_ERROR', error.message);
    return { ok: false, message: GENERIC_ERROR };
  }
  return { ok: true, data: null };
}
