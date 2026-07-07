// Piano nutrizionale assegnato dal coach a un cliente. Nessuna UI coach per
// crearlo esiste ancora (fuori scope di questo intervento, lato cliente): finché
// non viene aggiunta, lo store parte vuoto e la schermata cliente mostra
// onestamente "Nessun piano nutrizionale assegnato", non un piano finto.

export type MacroTargets = {
  calories?: number;
  proteinGrams?: number;
  carbsGrams?: number;
  fatGrams?: number;
};

export type MealItem = {
  id: string;
  name: string;
  time?: string;
  foods: string[];
};

export type SupplementItem = {
  id: string;
  name: string;
  dosage: string;
  timing?: string;
};

export type NutritionPlan = {
  id: string;
  clientId: string;
  title: string;
  meals: MealItem[];
  macros?: MacroTargets;
  tips: string[];
  supplements: SupplementItem[];
  shoppingList: string[];
  updatedAt: string;
};
