/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// Sistema visivo "product": sfondo grigio molto chiaro, card bianche sollevate,
// UN SOLO accento (rosso profondo, palette fornita dall'utente su riferimento
// visivo di app fitness professionali — vedi docs/DECISIONS.md per la sostituzione
// del precedente accento verde). `statusActive` è volutamente un verde indipendente
// dal primary: ora che il primary è rosso, "stato positivo/attivo" non può più
// coincidere con l'accento del brand senza creare ambiguità con azioni/allerta.
export const Colors = {
  light: {
    text: '#111111',
    background: '#F7F7F8',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#F9E3E7',
    textSecondary: '#707782',
    border: '#ECEEF2',
    primary: '#C90018',
    onPrimary: '#FFFFFF',
    softRed: '#F9E3E7',
    dangerSoft: '#FF6666',
    statusActive: '#15803D',
    statusWarning: '#B45309',
    statusExpired: '#C4291C',
    disabled: '#9BA0A6',
  },
  dark: {
    text: '#F5F5F6',
    background: '#121214',
    backgroundElement: '#1D1D20',
    backgroundSelected: '#3A1620',
    textSecondary: '#9A9FA6',
    border: '#2C2C30',
    primary: '#E43A4E',
    onPrimary: '#FFFFFF',
    softRed: '#3A1620',
    dangerSoft: '#5C1A22',
    statusActive: '#34D399',
    statusWarning: '#FBBF24',
    statusExpired: '#F87171',
    disabled: '#5B6167',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

// Radius unico per le card (16) e per elementi in evidenza (20), come da sistema visivo richiesto.
export const Radius = {
  sm: 10,
  md: 16,
  lg: 20,
  pill: 999,
} as const;

// Ombra leggera per le card (mai decorativa/pesante). `elevation` è l'equivalente Android.
export const CardShadow = Platform.select({
  web: { boxShadow: '0 1px 2px rgba(16, 20, 24, 0.04), 0 4px 12px rgba(16, 20, 24, 0.06)' },
  default: {
    shadowColor: '#0B0D10',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
}) as object;

// Altezza della tab bar fissa nella preview web (vedi app-tabs.web.tsx): serve anche
// come inset per il contenuto scrollabile, così nessuna schermata resta coperta.
export const WebTabBarHeight = 64;

export const BottomTabInset = Platform.select({ ios: 50, android: 80, web: WebTabBarHeight }) ?? 0;
export const MaxContentWidth = 800;
