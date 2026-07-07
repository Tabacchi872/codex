import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from './card';
import { ThemedText } from './themed-text';

import { useTheme } from '@/hooks/use-theme';
import { useThemeStore, type ThemeMode } from '@/store/theme-store';

const OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: 'light', label: 'Chiaro' },
  { mode: 'dark', label: 'Scuro' },
  { mode: 'system', label: 'Sistema' },
];

// Preferenza tema: persistenza locale demo (AsyncStorage su questo dispositivo/
// browser), non un profilo utente sincronizzato.
export function ThemeSettings() {
  const theme = useTheme();
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);

  return (
    <Card padded={false}>
      {OPTIONS.map((option, index) => {
        const active = option.mode === mode;
        return (
          <View key={option.mode}>
            <Pressable onPress={() => setMode(option.mode)} style={styles.row}>
              <ThemedText type="default" themeColor={active ? 'primary' : 'text'} style={active && styles.activeLabel}>
                {option.label}
              </ThemedText>
              <View style={[styles.radio, { borderColor: theme.primary }]}>
                {active && <View style={[styles.radioDot, { backgroundColor: theme.primary }]} />}
              </View>
            </Pressable>
            {index < OPTIONS.length - 1 && <View style={[styles.divider, { backgroundColor: theme.border }]} />}
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  activeLabel: {
    fontWeight: '700',
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#C90018',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#C90018',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
    backgroundColor: 'rgba(120,124,130,0.25)',
  },
});
