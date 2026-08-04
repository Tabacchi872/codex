import { supabase, supabaseConfig } from './supabase';
import type {
  FoodPer,
  FoodSource,
  MacroSplit,
  MealPlanDiet,
  MealType,
  RecipeCuisine,
  RecipeDiet,
  YmoveDietType,
  YmoveFood,
  YmoveMealPlan,
  YmoveMealType,
  YmovePagination,
  YmoveRecipe,
} from '@/types/nutrition';

// FitCoach Nutrizione Fase 1 (2026-08-04): client delle 8 azioni nutrition
// aggiunte alla Edge Function ymove-exercises (supabase/functions/
// ymove-exercises/index.ts). Stessa regola delle azioni esercizi: la chiave
// YMove non esiste mai in questo file/nell'app mobile (niente EXPO_PUBLIC_*),
// vive solo come secret Supabase lato server.

export type NutritionServiceResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

const NOT_CONFIGURED_MESSAGE = 'Supabase non e\' configurato su questo ambiente: impossibile usare le funzioni di nutrizione.';

function notConfigured<T>(): NutritionServiceResult<T> {
  return { ok: false, code: 'not_configured', message: NOT_CONFIGURED_MESSAGE };
}

type EdgeFunctionResponse<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

async function invokeNutrition<T>(payload: Record<string, unknown>): Promise<NutritionServiceResult<T>> {
  if (!supabaseConfig.isConfigured || !supabase) return notConfigured();

  const { data, error } = await supabase.functions.invoke<EdgeFunctionResponse<T>>('ymove-exercises', {
    body: payload,
  });

  if (error) {
    // Stesso pattern di ymove-service.ts: supabase-js non espone sempre il
    // body JSON dell'errore in modo uniforme tra web/native.
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const errorBody = (await context.json()) as { message?: string; code?: string };
        return { ok: false, code: errorBody.code ?? 'ymove_error', message: errorBody.message ?? error.message };
      } catch {
        // corpo non leggibile, ricadi sul messaggio generico sotto
      }
    }
    return { ok: false, code: 'ymove_error', message: error.message };
  }
  if (!data) {
    return { ok: false, code: 'ymove_error', message: 'Risposta vuota dal servizio nutrizione.' };
  }
  if (!data.ok) {
    return { ok: false, code: data.code, message: data.message };
  }
  return { ok: true, data: data.data };
}

export type FoodSearchFilters = {
  query: string;
  source?: FoodSource;
  usdaOnly?: boolean;
  country?: string;
  per?: FoodPer;
  page?: number;
  pageSize?: number;
};

export type FoodSearchResult = { items: YmoveFood[]; pagination: YmovePagination | null };

export async function searchFoods(filters: FoodSearchFilters): Promise<NutritionServiceResult<FoodSearchResult>> {
  const result = await invokeNutrition<{ items: unknown; pagination: unknown }>({ action: 'foods_search', filters });
  if (!result.ok) return result;
  const items = Array.isArray(result.data.items) ? (result.data.items as YmoveFood[]) : [];
  const pagination = (result.data.pagination as YmovePagination | null) ?? null;
  return { ok: true, data: { items, pagination } };
}

export async function getFoodDetail(id: string): Promise<NutritionServiceResult<YmoveFood>> {
  return invokeNutrition<YmoveFood>({ action: 'food_detail', id });
}

export async function getFoodByBarcode(upc: string, country?: string): Promise<NutritionServiceResult<YmoveFood>> {
  return invokeNutrition<YmoveFood>({ action: 'food_barcode', upc, filters: { country } });
}

export type RecipeSearchFilters = {
  query?: string;
  diet?: RecipeDiet;
  cuisine?: RecipeCuisine;
  mealType?: MealType;
  maxCalories?: number;
  minProtein?: number;
  page?: number;
  pageSize?: number;
};

export type RecipeSearchResult = { items: YmoveRecipe[]; pagination: YmovePagination | null };

export async function searchRecipes(filters: RecipeSearchFilters): Promise<NutritionServiceResult<RecipeSearchResult>> {
  const result = await invokeNutrition<{ items: unknown; pagination: unknown }>({ action: 'recipes_search', filters });
  if (!result.ok) return result;
  const items = Array.isArray(result.data.items) ? (result.data.items as YmoveRecipe[]) : [];
  const pagination = (result.data.pagination as YmovePagination | null) ?? null;
  return { ok: true, data: { items, pagination } };
}

export async function getRecipeDetail(idOrSlug: string): Promise<NutritionServiceResult<YmoveRecipe>> {
  return invokeNutrition<YmoveRecipe>({ action: 'recipe_detail', id: idOrSlug });
}

export async function getRecipeDiets(): Promise<NutritionServiceResult<YmoveDietType[]>> {
  const result = await invokeNutrition<unknown>({ action: 'recipes_diets' });
  if (!result.ok) return result;
  return { ok: true, data: Array.isArray(result.data) ? (result.data as YmoveDietType[]) : [] };
}

export async function getRecipeMealTypes(): Promise<NutritionServiceResult<YmoveMealType[]>> {
  const result = await invokeNutrition<unknown>({ action: 'recipes_meal_types' });
  if (!result.ok) return result;
  return { ok: true, data: Array.isArray(result.data) ? (result.data as YmoveMealType[]) : [] };
}

export type MealPlanGenerateFilters = {
  calories: number;
  diet?: MealPlanDiet;
  meals?: number;
  days?: number;
  macroSplit?: MacroSplit;
};

export async function generateMealPlan(filters: MealPlanGenerateFilters): Promise<NutritionServiceResult<YmoveMealPlan>> {
  return invokeNutrition<YmoveMealPlan>({ action: 'mealplan_generate', filters });
}
