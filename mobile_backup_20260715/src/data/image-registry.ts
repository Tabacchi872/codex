// Registro esplicito delle thumbnail locali degli esercizi, stesso motivo del
// video-registry.ts: Metro richiede require() statici, non si può risolvere un
// path per stringa a runtime. Vuoto di default: nessuna foto reale è stata ancora
// caricata. ExerciseThumbnail mostra un placeholder grafico finché resta vuoto.
export const IMAGE_REGISTRY: Record<string, number> = {};

export function resolveImageSource(imageFile: string): number | null {
  return IMAGE_REGISTRY[imageFile] ?? null;
}
