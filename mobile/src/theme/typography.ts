import { Platform } from 'react-native';

// Scala tipografica ricavata da docs/fitcoach-mockup.jsx (`const T = {...}`).
// Il mockup usa due famiglie caricate da Google Fonts (Space Grotesk per i
// titoli, Inter per il corpo testo): nessuna delle due è mai stata bundlata
// in questo progetto (nessun asset font, nessun useFonts in app/_layout.tsx)
// e aggiungerla è fuori scope per questo intervento (solo stile, no nuove
// dipendenze/refactor largo). "AppFontFamily.display" usa quindi il font di
// sistema con peso maggiore + letter-spacing negativo per avvicinarsi
// all'effetto "display" del mockup, non il font esatto — vedi TODO_NEXT.md.
export const AppFontSize = {
  xs: 11,
  sm: 12.5,
  base: 14.5,
  md: 16,
  lg: 19,
  xl: 24,
  hero: 36,
} as const;

export const AppFontFamily = Platform.select({
  ios: { display: 'System', body: 'System' },
  android: { display: 'sans-serif-medium', body: 'sans-serif' },
  default: { display: undefined, body: undefined },
}) as { display: string | undefined; body: string | undefined };

export const AppTextStyle = {
  eyebrow: {
    fontSize: AppFontSize.xs,
    fontWeight: '700' as const,
    letterSpacing: 0.6,
  },
  hero: {
    fontFamily: AppFontFamily.display,
    fontSize: AppFontSize.hero,
    fontWeight: '800' as const,
    letterSpacing: -1.2,
    lineHeight: AppFontSize.hero * 1.05,
  },
  title: {
    fontFamily: AppFontFamily.display,
    fontSize: AppFontSize.xl,
    fontWeight: '700' as const,
    letterSpacing: -0.5,
    lineHeight: AppFontSize.xl * 1.15,
  },
  sectionLabel: {
    fontSize: AppFontSize.xs,
    fontWeight: '700' as const,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
  cardTitle: {
    fontFamily: AppFontFamily.display,
    fontSize: 17,
    fontWeight: '700' as const,
  },
  body: {
    fontSize: AppFontSize.base,
    fontWeight: '500' as const,
  },
  bodyBold: {
    fontSize: AppFontSize.base,
    fontWeight: '700' as const,
  },
  caption: {
    fontSize: AppFontSize.sm,
    fontWeight: '600' as const,
  },
  metricValue: {
    fontFamily: AppFontFamily.display,
    fontSize: 19,
    fontWeight: '800' as const,
    letterSpacing: -0.4,
  },
} as const;
