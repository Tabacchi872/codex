// Design system "FitCoach" (2026-07-10): palette ricavata da
// docs/fitcoach-mockup.jsx (riferimento grafico fornito dall'utente, mai
// copiato 1:1 — solo i token colore/spacing/tipografia). Ruoli semantici:
//   moss   -> brand/positivo (identità coaching, metriche positive)
//   coral  -> azione/CTA (l'UNICO colore per "cose su cui tappi per agire")
//   amber  -> warning/in prova
//   rust   -> errore/bloccato/scaduto (hue distinta da coral: "fai questo"
//             non deve mai leggersi come "qualcosa è andato storto")
// La variante dark non è nel mockup (solo chiaro): è stata derivata qui
// mantenendo gli stessi ruoli semantici e lo stesso contrasto relativo, per
// restare compatibile con il toggle tema chiaro/scuro/sistema già esistente
// (useEffectiveColorScheme, store/theme-store.ts) — vedi docs/DECISIONS.md.
//
// Sistema parallelo a constants/theme.ts (Colors.light/dark): quest'ultimo
// resta invariato e continua ad alimentare i componenti non ancora migrati
// (Card, ThemedText, ThemedView, Pill, StatusDot, ecc.). I nomi dei token qui
// sotto sono deliberatamente diversi (background/surface/ink invece di
// background/backgroundElement/text) per evitare ambiguità tra i due sistemi
// durante la migrazione graduale.
export const AppColors = {
  light: {
    background: '#F7F8F9', // cream
    surface: '#FFFFFF', // card
    surfaceSubtle: '#EEF0F1', // sand — fill neutro (icon chip, superserie, skeleton)
    border: '#E4E7E9', // line

    ink: '#14171A',
    inkSoft: '#63696F',
    inkFaint: '#9BA0A5',

    moss: '#0FAE73',
    mossSoft: '#D9F4E8',
    onMoss: '#FFFFFF',

    coral: '#FF5630',
    coralSoft: '#FFE1D6',
    onCoral: '#2A0E05',

    amber: '#E3922A',
    amberSoft: '#FCEACB',
    onAmber: '#2A1B02',

    rust: '#E1416B',
    rustSoft: '#FCDEE6',
    onRust: '#FFFFFF',
  },
  dark: {
    background: '#121415',
    surface: '#1C1F21',
    surfaceSubtle: '#23272A',
    border: '#2B3033',

    ink: '#F3F5F6',
    inkSoft: '#9DA3A8',
    inkFaint: '#6B7176',

    moss: '#2ED191',
    mossSoft: '#123829',
    onMoss: '#04140D',

    coral: '#FF6B47',
    coralSoft: '#442119',
    onCoral: '#2A0E05',

    amber: '#F0A93E',
    amberSoft: '#3B2A0F',
    onAmber: '#2A1B02',

    rust: '#F0567F',
    rustSoft: '#3E1622',
    onRust: '#FFFFFF',
  },
} as const;

export type AppColorScheme = keyof typeof AppColors;
export type AppColorToken = keyof typeof AppColors.light;
