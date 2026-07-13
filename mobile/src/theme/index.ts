import { AppColors, type AppColorScheme } from './colors';
import { getCardShadow } from './shadows';

import { useEffectiveColorScheme } from '@/hooks/use-effective-color-scheme';

export { AppColors } from './colors';
export type { AppColorScheme, AppColorToken } from './colors';
export { AppSpacing } from './spacing';
export type { AppSpacingKey } from './spacing';
export { AppFontFamily, AppFontSize, AppTextStyle } from './typography';
export { AppRadius } from './radius';
export type { AppRadiusKey } from './radius';
export { getAccentShadow, getCardShadow } from './shadows';

// Hook unico del nuovo design system: legge lo stesso schema effettivo
// (light/dark/system) già usato da useTheme()/NativeTabs (vedi
// hooks/use-effective-color-scheme.ts), così il toggle in Impostazioni
// cambia anche le schermate migrate a questo sistema. Ritorna sia la
// palette sia lo schema, per comodità (es. scegliere lo shadow giusto).
export function useAppTheme() {
  const scheme = useEffectiveColorScheme();
  return { colors: AppColors[scheme], scheme, cardShadow: getCardShadow(scheme) };
}

export type AppTheme = {
  colors: (typeof AppColors)[AppColorScheme];
  scheme: AppColorScheme;
  cardShadow: object;
};
