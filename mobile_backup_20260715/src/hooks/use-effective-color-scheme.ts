import { useColorScheme as useSystemColorScheme } from './use-color-scheme';

import { useThemeStore } from '@/store/theme-store';

// Combina la preferenza salvata (light/dark/system) con lo schema del sistema
// operativo/browser. Unico punto che decide il tema effettivo: useTheme(), la
// tab bar nativa e il ThemeProvider di React Navigation leggono tutti da qui,
// così l'impostazione in Impostazioni cambia davvero i colori in tutta l'app.
export function useEffectiveColorScheme(): 'light' | 'dark' {
  const systemScheme = useSystemColorScheme();
  const mode = useThemeStore((s) => s.mode);

  if (mode === 'light' || mode === 'dark') {
    return mode;
  }
  return systemScheme === 'dark' ? 'dark' : 'light';
}
