import { ProfessionalLibraryScreen } from '@/components/professional-library-screen';

// Radice della cartella VIRTUALE "Allenamenti professionali" (vedi
// components/professional-library-screen.tsx per il dettaglio: nessuna riga
// in template_folders, nessun coach_id, non rinominabile/eliminabile/
// spostabile). Mostra le 7 sottocategorie (goal-based); ricerca/filtri qui
// operano solo sui modelli di sistema.
export default function SchedeProfessionaliScreen() {
  return <ProfessionalLibraryScreen goal={null} />;
}
