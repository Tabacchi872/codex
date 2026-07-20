import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppCard } from './ui';

import { useThemeStore, type ThemeMode } from '@/store/theme-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';

const THEME_OPTIONS: { value: ThemeMode; label: string; description: string }[] = [
  { value: 'light', label: 'Chiaro', description: 'Interfaccia luminosa' },
  { value: 'dark', label: 'Scuro', description: 'Interfaccia dark FitCoach' },
  { value: 'system', label: 'Sistema', description: 'Segue il dispositivo' },
];

export function ThemeSettings() {
  const { colors } = useAppTheme();
  const mode = useThemeStore((state) => state.mode);
  const setMode = useThemeStore((state) => state.setMode);

  return (
    <AppCard style={styles.card}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.ink }]}>Tema</Text>
        <Text style={[styles.description, { color: colors.inkSoft }]}>Scegli come visualizzare l'app.</Text>
      </View>
      <View style={styles.options}>
        {THEME_OPTIONS.map((option) => {
          const active = mode === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => setMode(option.value)}
              accessibilityRole="button"
              accessibilityLabel={`Tema ${option.label}`}
              accessibilityState={{ selected: active }}
              style={[
                styles.option,
                {
                  backgroundColor: active ? colors.mossSoft : colors.surfaceSubtle,
                  borderColor: active ? colors.moss : colors.border,
                },
              ]}>
              <View style={styles.optionCopy}>
                <Text style={[styles.optionLabel, { color: active ? colors.moss : colors.ink }]}>{option.label}</Text>
                <Text style={[styles.optionDescription, { color: colors.inkSoft }]}>{option.description}</Text>
              </View>
              <View style={[styles.radio, { borderColor: active ? colors.moss : colors.border }]}>
                {active ? <View style={[styles.radioDot, { backgroundColor: colors.moss }]} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: AppSpacing[3],
  },
  header: {
    gap: 3,
  },
  title: {
    fontSize: AppFontSize.md,
    fontWeight: '800',
  },
  description: {
    fontSize: AppFontSize.sm,
    fontWeight: '500',
    lineHeight: 18,
  },
  options: {
    gap: AppSpacing[2],
  },
  option: {
    alignItems: 'center',
    borderRadius: AppRadius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: AppSpacing[3],
    minHeight: 58,
    paddingHorizontal: AppSpacing[3],
    paddingVertical: AppSpacing[2],
  },
  optionCopy: {
    flex: 1,
    minWidth: 0,
  },
  optionLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '800',
  },
  optionDescription: {
    fontSize: AppFontSize.xs,
    fontWeight: '600',
    lineHeight: 16,
    marginTop: 2,
  },
  radio: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1.5,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  radioDot: {
    borderRadius: 999,
    height: 10,
    width: 10,
  },
});
