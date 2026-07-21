import { useLocalSearchParams } from 'expo-router';

import { ProfessionalLibraryScreen } from '@/components/professional-library-screen';

// Una sottocategoria di "Allenamenti professionali" (Dimagrimento, Massa
// muscolare, ...): goal e' il valore grezzo di workout_templates.goal, mai
// un id di cartella reale. Vedi components/professional-library-screen.tsx.
export default function SchedeProfessionaliCategoriaScreen() {
  const { goal } = useLocalSearchParams<{ goal: string }>();
  return <ProfessionalLibraryScreen goal={goal ?? null} />;
}
