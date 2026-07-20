import { useColorScheme } from './use-color-scheme';

import { useThemeStore } from '@/store/theme-store';

export function useEffectiveColorScheme(): 'light' | 'dark' {
  const mode = useThemeStore((state) => state.mode);
  const systemScheme = useColorScheme();

  if (mode === 'light' || mode === 'dark') return mode;
  return systemScheme === 'dark' ? 'dark' : 'light';
}
