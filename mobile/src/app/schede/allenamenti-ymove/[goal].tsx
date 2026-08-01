import { useLocalSearchParams } from 'expo-router';

import { ProfessionalLibraryScreen } from '@/components/professional-library-screen';

// Una sottocategoria di "Allenamenti YMove" (Dimagrimento, Massa
// muscolare, ...): goal e' il valore grezzo di workout_templates.goal, mai
// un id di cartella reale — stesso vocabolario di schede/professionali/
// [goal].tsx, filtrato qui ai soli modelli con is_ymove=true (variant='ymove').
export default function SchedeAllenamentiYmoveCategoriaScreen() {
  const { goal } = useLocalSearchParams<{ goal: string }>();
  return <ProfessionalLibraryScreen goal={goal ?? null} variant="ymove" />;
}
