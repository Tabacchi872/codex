// Registro esplicito dei video locali disponibili. Metro richiede require() statici,
// quindi non si può risolvere un path per stringa a runtime: ogni video reale aggiunto
// in mobile/assets/videos/ va registrato qui con la stessa chiave usata in
// Exercise.videoFile (vedi mobile/assets/videos/README.md).
//
// Attualmente vuoto: nessun file video reale è stato ancora caricato nel progetto.
export const VIDEO_REGISTRY: Record<string, number> = {};

export function resolveVideoSource(videoFile: string): number | null {
  return VIDEO_REGISTRY[videoFile] ?? null;
}
