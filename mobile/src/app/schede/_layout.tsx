import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function SchedeLayout() {
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
      <Stack.Screen name="new" options={{ title: 'Nuova scheda' }} />
      <Stack.Screen name="[id]" options={{ title: 'Modifica scheda' }} />
      <Stack.Screen name="modelli" options={{ headerShown: false }} />
    </Stack>
  );
}
