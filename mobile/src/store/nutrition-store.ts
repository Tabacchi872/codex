import { create } from 'zustand';

import type { ActiveNutritionPlan } from '@/lib/client-nutrition-service';
import type { NutritionDiaryEntry } from '@/types/nutrition';

// FitCoach Nutrizione Fase 1 (2026-08-04): a differenza della versione
// precedente di questo store (piano nutrizionale assegnato dal coach, mai
// avuto una UI coach reale — vedi nota storica in types/nutrition.ts), questo
// stato NON e' piu' persistito in AsyncStorage: il piano e il diario sono
// dati di proprieta' del server (Supabase), non locali al device. Lo store
// tiene solo una cache in-memory per evitare ricaricamenti tra un cambio tab
// e l'altro nella stessa sessione app; ogni schermata che ne ha bisogno
// chiama refreshActivePlan()/refreshDiaryForDate() al focus.

type NutritionState = {
  activePlan: ActiveNutritionPlan | null;
  activePlanLoaded: boolean;
  diaryByDate: Record<string, NutritionDiaryEntry[]>;
  setActivePlan: (plan: ActiveNutritionPlan | null) => void;
  setDiaryForDate: (date: string, entries: NutritionDiaryEntry[]) => void;
  addDiaryEntry: (date: string, entry: NutritionDiaryEntry) => void;
  removeDiaryEntry: (date: string, entryId: string) => void;
  reset: () => void;
};

const initialState = {
  activePlan: null,
  activePlanLoaded: false,
  diaryByDate: {},
};

// Riferimento stabile per il default di un giorno senza voci nel diario.
// BUG (2026-08-04): i selettori dei consumer usavano `s.diaryByDate[data] ?? []`
// inline — l'operatore ?? crea un nuovo array letterale a ogni esecuzione del
// selettore, quindi useSyncExternalStore lo vede sempre "cambiato" (confronto
// per riferimento) e ri-renderizza all'infinito. Usare SEMPRE questa costante
// come fallback nei selettori (mai `?? []` inline) quando il valore selezionato
// può essere un array assente in una struttura keyed come diaryByDate.
export const EMPTY_DIARY_ENTRIES: NutritionDiaryEntry[] = [];

export const useNutritionStore = create<NutritionState>()((set) => ({
  ...initialState,
  setActivePlan: (plan) => set({ activePlan: plan, activePlanLoaded: true }),
  setDiaryForDate: (date, entries) =>
    set((state) => ({ diaryByDate: { ...state.diaryByDate, [date]: entries } })),
  addDiaryEntry: (date, entry) =>
    set((state) => ({
      diaryByDate: { ...state.diaryByDate, [date]: [...(state.diaryByDate[date] ?? []), entry] },
    })),
  removeDiaryEntry: (date, entryId) =>
    set((state) => ({
      diaryByDate: {
        ...state.diaryByDate,
        [date]: (state.diaryByDate[date] ?? []).filter((e) => e.id !== entryId),
      },
    })),
  // Chiamato al logout (stesso principio di azzeramento degli altri store
  // account-specifici, vedi BUG-049/060): un piano/diario non deve mai
  // restare visibile per un account diverso sullo stesso device.
  reset: () => set({ ...initialState, diaryByDate: {} }),
}));
