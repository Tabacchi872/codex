/**
 * Legacy-compatible semantic tokens.
 *
 * A number of older screens still consume `useTheme()`/`Colors`, while the
 * redesigned screens consume `useAppTheme()`/`AppColors`.  Keeping two
 * unrelated palettes was the main reason workout and exercise screens looked
 * like a different app (red accent, grey cards and oversized typography).
 * These tokens now mirror the FitCoach Pro design system while preserving the
 * old property names until every screen has migrated.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#111820',
    background: '#F5F7F9',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E7F8DB',
    textSecondary: '#68727C',
    border: '#DFE5E8',
    primary: '#63D90C',
    onPrimary: '#07110B',
    softRed: '#E7F8DB',
    dangerSoft: '#FFE1E5',
    statusActive: '#3EBE66',
    statusWarning: '#D88900',
    statusExpired: '#D93652',
    disabled: '#9AA3AB',
  },
  dark: {
    text: '#F7F9FA',
    background: '#05090D',
    backgroundElement: '#0D141B',
    backgroundSelected: '#1B3519',
    textSecondary: '#9AA4AE',
    border: '#24313A',
    primary: '#7BEA18',
    onPrimary: '#07110B',
    softRed: '#1B3519',
    dangerSoft: '#3B1820',
    statusActive: '#7BEA18',
    statusWarning: '#F4A300',
    statusExpired: '#FF607A',
    disabled: '#66717A',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'sans-serif',
    serif: 'serif',
    rounded: 'sans-serif',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

// 4/8 based scale retained for existing screens, with narrower mobile gutters.
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 20,
  five: 28,
  six: 48,
} as const;

export const Radius = {
  sm: 12,
  md: 20,
  lg: 24,
  pill: 999,
} as const;

export const CardShadow = Platform.select({
  web: { boxShadow: '0 1px 2px rgba(0,0,0,0.18), 0 10px 24px -18px rgba(0,0,0,0.55)' },
  default: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 2,
  },
}) as object;

export const WebTabBarHeight = 64;
export const BottomTabInset = Platform.select({ ios: 50, android: 80, web: WebTabBarHeight }) ?? 0;
export const MaxContentWidth = 800;
