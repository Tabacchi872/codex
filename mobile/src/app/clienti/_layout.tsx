import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function ClientiLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.backgroundElement },
        headerTintColor: theme.primary,
        headerTitleStyle: { color: theme.text },
        headerShadowVisible: false,
      }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: 'Dettaglio cliente' }} />
      <Stack.Screen name="new" options={{ title: 'Nuovo cliente' }} />
      <Stack.Screen name="abbonamento-nuovo" options={{ title: 'Nuovo abbonamento' }} />
      <Stack.Screen name="abbonamento-modifica" options={{ title: 'Aggiorna abbonamento' }} />
    </Stack>
  );
}
