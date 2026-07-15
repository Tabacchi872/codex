import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthGate } from '@/components/auth-gate';
import { WebPhoneFrame } from '@/components/web-phone-frame';
import { useEffectiveColorScheme } from '@/hooks/use-effective-color-scheme';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useEffectiveColorScheme();
  return (
    <WebPhoneFrame>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <AuthGate />
      </ThemeProvider>
    </WebPhoneFrame>
  );
}
