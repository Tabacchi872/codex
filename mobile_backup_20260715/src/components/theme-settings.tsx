import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppCard } from './ui';

import { useThemeStore, type ThemeMode } from '@/store/theme-store';
import { AppFontSize, useAppTheme } from '@/theme';

const OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: 'light', label: 'Chiaro' },
  { mode: 'dark', label: 'Scuro' },
  { mode: 'system', label: 'Sistema' },
];

// Preferenza tema: persistenza locale demo (AsyncStorage su questo dispositivo/
// browser), non un profilo utente sincronizzato.
export function ThemeSettings() {
  const { colors } = useAppTheme();
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);

  return (
    <AppCard padded={false}>
      {OPTIONS.map((option, index) => {
        const active = option.mode === mode;
        return (
          <View key={option.mode}>
            <Pressable onPress={() => setMode(option.mode)} style={styles.row}>
              <Text style={[styles.label, { color: colors.ink, fontWeight: active ? '700' : '500' }]}>{option.label}</Text>
              <View style={[styles.radio, { borderColor: colors.moss }]}>
                {active ? <View style={[styles.radioDot, { backgroundColor: colors.moss }]} /> : null}
              </View>
            </Pressable>
            {index < OPTIONS.length - 1 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
          </View>
        );
      })}
    </AppCard>
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
  label: {
    fontSize: AppFontSize.md,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
});
