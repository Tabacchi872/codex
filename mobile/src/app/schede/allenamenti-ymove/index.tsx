import { ProfessionalLibraryScreen } from '@/components/professional-library-screen';

// Radice della cartella VIRTUALE "Allenamenti YMove" (vedi
// components/professional-library-screen.tsx, variant='ymove': nessuna riga
// in template_folders, nessun coach_id, non rinominabile/eliminabile/
// spostabile). Mostra le sottocategorie (goal-based, stesso vocabolario
// della libreria "Allenamenti professionali"); ricerca/filtri qui operano
// solo sui modelli di sistema YMove.
export default function SchedeAllenamentiYmoveScreen() {
  return <ProfessionalLibraryScreen goal={null} variant="ymove" />;
}
