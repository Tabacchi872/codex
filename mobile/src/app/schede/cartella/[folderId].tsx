import { useLocalSearchParams } from 'expo-router';

import { TemplateLibraryScreen } from '@/components/template-library-screen';

// Un livello di cartella della libreria modelli (vedi schede/index.tsx per
// la radice). Navigare in una sottocartella spinge di nuovo questa stessa
// route con un folderId diverso: profondita' illimitata senza bisogno di
// altre route dedicate. Nessun clientId, mai.
export default function SchedeCartellaScreen() {
  const { folderId } = useLocalSearchParams<{ folderId: string }>();
  return <TemplateLibraryScreen folderId={folderId ?? null} />;
}
