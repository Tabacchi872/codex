import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function SuperadminLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.backgroundElement },
        headerTintColor: theme.primary,
        headerTitleStyle: { color: theme.text },
        headerShadowVisible: false,
      }}>
      <Stack.Screen name="index" options={{ title: 'Superadmin' }} />
      <Stack.Screen name="coaches" options={{ title: 'Coach registrati' }} />
      <Stack.Screen name="plans" options={{ title: 'Piani coach' }} />
      <Stack.Screen name="payment-events" options={{ title: 'Eventi pagamento' }} />
    </Stack>
  );
}
