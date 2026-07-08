import { Stack } from 'expo-router';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function SuperadminLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}>
      <Stack.Screen name="index" options={{ title: 'Superadmin' }} />
      <Stack.Screen name="coaches/index" options={{ title: 'Coach registrati' }} />
      <Stack.Screen name="coaches/new" options={{ title: 'Nuovo coach' }} />
      <Stack.Screen name="coaches/[id]" options={{ title: 'Dettaglio coach' }} />
      <Stack.Screen name="plans/index" options={{ title: 'Piani coach' }} />
      <Stack.Screen name="plans/[id]" options={{ title: 'Dettaglio piano' }} />
      <Stack.Screen name="payment-events" options={{ title: 'Eventi pagamento' }} />
      <Stack.Screen name="support/index" options={{ title: 'Supporto coach' }} />
      <Stack.Screen name="support/[coachId]" options={{ title: 'Chat coach' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifiche' }} />
    </Stack>
  );
}
