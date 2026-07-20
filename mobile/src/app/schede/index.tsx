import { TemplateLibraryScreen } from '@/components/template-library-screen';

// Tab globale "Schede" della bottom bar coach: libreria dei MODELLI del
// coach (cartelle/sottocartelle -> schede modello), radice dell'albero
// (folderId=null = anche la cartella virtuale "Senza categoria"). Non deve
// MAI mostrare clientId, peso reale, completamento workout o storico carichi
// — quelle cose vivono solo in Clienti -> [id] -> Schede (schede reali
// assegnate, invariato). Vedi components/template-library-screen.tsx.
export default function SchedeLibreriaScreen() {
  return <TemplateLibraryScreen folderId={null} />;
}
