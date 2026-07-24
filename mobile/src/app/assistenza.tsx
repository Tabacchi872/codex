import { useRouter } from 'expo-router';
import { Headphones } from 'lucide-react-native';

import { DeveloperInfoSection } from '@/components/developer-info-section';
import { AppCard, AppListRow, AppScreen, BackHeader } from '@/components/ui';
import { logCoachNavPress } from '@/lib/coach-navigation';
import { useAppTheme } from '@/theme';

// "Assistenza e informazioni" (sezione 8 dell'hub Area coach): raccoglie la
// chat di supporto gia' esistente (/supporto, invariata) e le informazioni
// legali/sviluppatore gia' mostrate da DeveloperInfoSection (componente
// condiviso con cliente-profilo.tsx, non riscritto qui).
export default function AssistenzaScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();

  return (
    <AppScreen>
      <BackHeader title="Assistenza e informazioni" fallbackHref="/area-coach" />

      <AppCard style={{ paddingVertical: 4 }}>
        <AppListRow
          icon={<Headphones size={19} color={colors.moss} />}
          iconBackground={colors.mossSoft}
          title="Assistenza"
          subtitle="Chat con il superadmin per supporto e comunicazioni"
          onPress={() => {
            logCoachNavPress('assistenza-supporto', '/supporto');
            router.push('/supporto');
          }}
        />
      </AppCard>

      <DeveloperInfoSection />
    </AppScreen>
  );
}
