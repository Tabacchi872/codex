// FitCoach Nutrizione Fase 1 (YMove foods/recipes/mealplans, 2026-08-04).
// Tipi verificati byte-per-byte contro l'OpenAPI reale di
// https://exercise-api.ymove.app/api/v2/openapi.json — nessun campo/enum
// inventato o assunto dal prompt originale.
//
// Nota per il futuro (fuori scope in questa fase, non implementata): il
// vecchio concetto "piano nutrizionale assegnato manualmente dal coach" (mai
// avuto una UI coach reale) non viene reintrodotto qui. Un possibile sviluppo
// futuro e' un override del coach su un singolo pasto gia' generato dal
// motore automatico (stessa forma di NutritionPlanMealRecord sotto, con un
// campo aggiuntivo tipo overriddenByCoachId) — non implementato ora,
// deliberatamente.

export type FoodSource = 'usda' | 'openfoodfacts';
export type FoodPer = '100g' | '100ml';

// shortName per le liste, displayName per il dettaglio (mai "name" come
// etichetta principale in UI — quello e' il nome grezzo del database sorgente).
export type YmoveFood = {
  id: string;
  fdcId: number | null;
  name: string;
  shortName: string;
  displayName: string;
  brand: string | null;
  category: string | null;
  servingSize: number;
  servingDescription: string | null;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number | null;
  sugar: number | null;
  sodium: number | null;
  cholesterol: number | null;
  saturatedFat: number | null;
  barcode: string | null;
  imageUrl: string | null;
  source: string;
  country: string | null;
};

export type RecipeDiet = 'high_protein' | 'low_carb' | 'keto' | 'vegan' | 'vegetarian' | 'mediterranean' | 'paleo';
// 'balanced' e' valido SOLO qui (generazione piano), MAI su /recipes/search.
export type MealPlanDiet = 'balanced' | RecipeDiet;
export type RecipeCuisine = 'american' | 'mediterranean' | 'asian' | 'mexican' | 'italian' | 'indian' | 'japanese';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type MacroSplit = 'balanced' | 'high_protein' | 'low_carb' | 'high_fat';

export type YmoveRecipeIngredient = {
  name: string;
  amount: string;
  calories: number;
  protein: number;
};

export type YmoveRecipe = {
  id: string;
  title: string;
  description: string;
  cuisine: string;
  diet: string[];
  mealType: string;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  servings: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  ingredients: YmoveRecipeIngredient[];
  instructions: string[];
};

export type YmoveDietType = { diet: string; count: number };
export type YmoveMealType = { mealType: string; count: number };

export type YmovePagination = { page: number; pageSize: number; total: number; totalPages: number };

// Ricetta gia' "annidata" dentro un pasto del piano (recipe + foods sono
// snapshot completi, gia' scalati per portionMultiplier): mostra ricetta,
// istruzioni e ingredienti senza una seconda chiamata a /recipes/{id}.
export type MealPlanMealRecipe = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  mealType: string;
  cuisineType: string | null;
  difficulty: string | null;
  prepTimeMin: number;
  cookTimeMin: number;
  servings: number;
  dietTags: string[];
  instructions: string[];
  imageUrl: string | null;
};

export type MealPlanMealFood = {
  name: string;
  portion: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type MealPlanMeal = {
  type: string;
  name: string;
  recipeId: string;
  recipeSlug: string;
  imageUrl: string | null;
  portionMultiplier: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  recipe: MealPlanMealRecipe;
  foods: MealPlanMealFood[];
};

export type MealPlanDayTotals = { calories: number; protein: number; carbs: number; fat: number };

export type MealPlanDay = {
  dayIndex: number;
  totals: MealPlanDayTotals;
  meals: MealPlanMeal[];
};

// data.days[] e' SEMPRE la fonte primaria, anche per daysCount=1. data.meals/
// data.totals sono alias di SOLO days[0] (backward-compatible) — confermato
// testualmente nello schema OpenAPI reale, mai usati qui per piani multi-day.
export type YmoveMealPlan = {
  calories: number;
  diet: string;
  macroSplit: string;
  mealsPerDay: number;
  daysCount: number;
  averageDailyTotals: MealPlanDayTotals;
  days: MealPlanDay[];
  totals: MealPlanDayTotals;
  meals: MealPlanMeal[];
};

// --- Persistenza locale/Supabase (client_nutrition_* — vedi migration
// 20260821090000_nutrition_phase1_schema.sql) ---

export type NutritionPlanRecord = {
  id: string;
  clientId: string;
  status: 'active' | 'archived';
  calories: number;
  diet: string;
  mealsPerDay: number;
  daysCount: number;
  macroSplit: string;
  averageDailyTotals: MealPlanDayTotals;
  generatedAt: string;
};

export type NutritionPlanDayRecord = {
  id: string;
  planId: string;
  dayIndex: number;
  totals: MealPlanDayTotals;
};

export type NutritionPlanMealRecord = {
  id: string;
  planDayId: string;
  mealOrder: number;
  mealType: MealType;
  recipeId: string;
  recipeSlug: string;
  name: string;
  imageUrl: string | null;
  portionMultiplier: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  recipe: MealPlanMealRecipe;
  foods: MealPlanMealFood[];
  swappedAt: string | null;
};

export type NutritionDiaryEntrySource = 'food' | 'recipe';

export type NutritionDiaryEntry = {
  id: string;
  clientId: string;
  entryDate: string;
  mealType: MealType;
  source: NutritionDiaryEntrySource;
  ymoveFoodId: string | null;
  ymoveRecipeId: string | null;
  name: string;
  quantityGrams: number | null;
  quantityPortions: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};
