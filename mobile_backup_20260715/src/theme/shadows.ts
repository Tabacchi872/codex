import { Platform } from 'react-native';

import type { AppColorScheme } from './colors';

// Ombra card: "0 1px 2px rgba(20,24,15,.03), 0 6px 16px -10px rgba(20,24,15,.10)"
// nel mockup (solo web/CSS). React Native non supporta ombre multiple: qui se
// ne approssima una sola, più leggera in dark mode (dove il contrasto lo dà
// soprattutto il bordo, non l'ombra — uno sfondo scuro rende le ombre nere
// quasi invisibili).
export function getCardShadow(scheme: AppColorScheme): object {
  return Platform.select({
    web: {
      boxShadow:
        scheme === 'dark'
          ? '0 1px 2px rgba(0,0,0,0.25), 0 6px 16px -10px rgba(0,0,0,0.35)'
          : '0 1px 2px rgba(20,23,26,0.04), 0 6px 16px -10px rgba(20,23,26,0.12)',
    },
    default: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: scheme === 'dark' ? 0.3 : 0.08,
      shadowRadius: 8,
      elevation: 2,
    },
  }) as object;
}

// Ombra "accesa" colore-coral per elementi galleggianti (FAB, CTA in evidenza),
// come "0 8px 20px -6px rgba(255,86,48,0.5)" nel mockup.
export function getAccentShadow(color: string): object {
  return Platform.select({
    web: { boxShadow: `0 8px 20px -6px ${hexToRgba(color, 0.45)}` },
    default: {
      shadowColor: color,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35,
      shadowRadius: 10,
      elevation: 4,
    },
  }) as object;
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '');
  const bigint = parseInt(normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
