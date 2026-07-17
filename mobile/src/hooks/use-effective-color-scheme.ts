// Tema temporaneamente bloccato su scuro: useTheme(), useAppTheme(), tab bar e
// ThemeProvider leggono tutti da qui, quindi nessuna area puo' rientrare in
// light mode tramite preferenze salvate o impostazioni di sistema.
export function useEffectiveColorScheme(): 'light' | 'dark' {
  return 'dark';
}
