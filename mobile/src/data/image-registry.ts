// Registro esplicito delle thumbnail locali degli esercizi. Metro richiede
// require() statici, quindi non si puo' risolvere un path per stringa a
// runtime: ogni immagine reale aggiunta in mobile/assets/images/exercises/ va
// registrata qui. ExerciseThumbnail mostra un placeholder grafico coerente
// col gruppo muscolare finche' un esercizio non ha una voce qui.
//
// Le voci per gli esercizi locali (src/data/exercise-library.ts) sono
// generate automaticamente da scripts/sync-exercise-images.cjs — non
// aggiungerle/rimuoverle a mano, rilancia lo script dopo aver aggiunto o
// tolto un file in assets/images/exercises/. Voci di altra origine (es.
// esercizi YMove/custom, se e quando implementate) restano gestite altrove e
// non vengono toccate da questo script.
export const IMAGE_REGISTRY: Record<string, number> = {};

export function resolveImageSource(imageFile: string): number | null {
  return IMAGE_REGISTRY[imageFile] ?? null;
}
