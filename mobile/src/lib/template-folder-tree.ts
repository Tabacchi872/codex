import type { TemplateFolder } from '@/types/template-library';

export type FlatFolderNode = { folder: TemplateFolder; depth: number };

// Appiattisce l'albero cartelle (parentFolderId) in una lista ordinata
// depth-first, ordinata alfabeticamente ad ogni livello — usata dal
// selettore "Sposta in altra cartella" e da qualunque UI che deve mostrare
// l'intera gerarchia senza navigarla un livello alla volta. Cartelle il cui
// parent non esiste piu' (dato incoerente, non dovrebbe accadere con "on
// delete cascade") vengono trattate come di primo livello, mai perse.
export function flattenFolderTree(folders: TemplateFolder[]): FlatFolderNode[] {
  const byParent = new Map<string | null, TemplateFolder[]>();
  const knownIds = new Set(folders.map((f) => f.id));
  for (const folder of folders) {
    const parentKey = folder.parentFolderId && knownIds.has(folder.parentFolderId) ? folder.parentFolderId : null;
    const list = byParent.get(parentKey) ?? [];
    list.push(folder);
    byParent.set(parentKey, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  const result: FlatFolderNode[] = [];
  function visit(parentKey: string | null, depth: number) {
    for (const folder of byParent.get(parentKey) ?? []) {
      result.push({ folder, depth });
      visit(folder.id, depth + 1);
    }
  }
  visit(null, 0);
  return result;
}

// Un discendente (o se stessa) non puo' mai diventare destinazione di
// spostamento per una cartella — eviterebbe un ciclo parentFolderId. Non
// serve per i modelli (che non hanno figli), solo se in futuro si
// aggiungesse "sposta cartella".
export function isFolderOrDescendant(folders: TemplateFolder[], rootId: string, candidateId: string): boolean {
  if (rootId === candidateId) return true;
  const children = folders.filter((f) => f.parentFolderId === rootId);
  return children.some((child) => isFolderOrDescendant(folders, child.id, candidateId));
}
