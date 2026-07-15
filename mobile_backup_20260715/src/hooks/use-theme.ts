/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { useEffectiveColorScheme } from './use-effective-color-scheme';

import { Colors } from '@/constants/theme';

export function useTheme() {
  const scheme = useEffectiveColorScheme();
  return Colors[scheme];
}
