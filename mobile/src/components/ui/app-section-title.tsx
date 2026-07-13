import { StyleSheet, Text } from 'react-native';

import { AppSpacing, AppTextStyle, useAppTheme } from '@/theme';

// Etichetta di sezione maiuscola e faint ("OGGI", "SUGGERITO PER TE" nel
// mockup): separa i blocchi di una schermata senza il peso di un titolo vero.
export function AppSectionTitle({ children }: { children: string }) {
  const { colors } = useAppTheme();

  return <Text style={[styles.label, AppTextStyle.sectionLabel, { color: colors.inkFaint }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  label: {
    marginBottom: AppSpacing[2],
  },
});
