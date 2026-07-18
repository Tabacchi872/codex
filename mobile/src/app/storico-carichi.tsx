import { ClientLoadHistory } from '@/components/client-load-history';
import { AppScreen, BackHeader } from '@/components/ui';
import { useAuthStore } from '@/store/auth-store';

export default function StoricoCarichiScreen() {
  const currentClientId = useAuthStore((s) => s.currentClientId);

  return (
    <AppScreen>
      <BackHeader title="Storico carichi" fallbackHref="/altro" />
      <ClientLoadHistory clientId={currentClientId} readOnly />
    </AppScreen>
  );
}
