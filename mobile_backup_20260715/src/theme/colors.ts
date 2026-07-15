// FitCoach Pro design tokens. The palette is intentionally compact and role
// based: moss is brand/progress, coral is the action accent, amber warns, rust
// marks blocking/error states. Light and dark share the same semantic names so
// the existing light/dark/system preference keeps working.
export const AppColors = {
  light: {
    background: '#F3F6F2',
    surface: '#FFFFFF',
    surfaceSubtle: '#EAF1E7',
    border: '#DCE5DA',

    ink: '#07110B',
    inkSoft: '#536052',
    inkFaint: '#879187',

    moss: '#67D42D',
    mossSoft: '#DFF6D4',
    onMoss: '#07110B',

    coral: '#FF6248',
    coralSoft: '#FFE1DB',
    onCoral: '#2A0E08',

    amber: '#E3922A',
    amberSoft: '#FCEACB',
    onAmber: '#2A1B02',

    rust: '#E1416B',
    rustSoft: '#FCDEE6',
    onRust: '#FFFFFF',
  },
  dark: {
    background: '#05090D',
    surface: '#10171F',
    surfaceSubtle: '#18232D',
    border: '#22303A',

    ink: '#F4F7EF',
    inkSoft: '#A9B6AA',
    inkFaint: '#6E7B74',

    moss: '#80EA2D',
    mossSoft: '#1D3D18',
    onMoss: '#07110B',

    coral: '#FF6248',
    coralSoft: '#3F211D',
    onCoral: '#2A0E08',

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
