import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppIconButton } from './app-icon-button';

import { AppSpacing, AppTextStyle, useAppTheme } from '@/theme';

type AppHeaderProps = {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  onBack?: () => void;
};

// Header di schermata unico (ScreenHeader nel mockup): eyebrow piccola in
// moss opzionale, titolo display, back opzionale a sinistra, azione libera a
// destra (bottone, notifica, ecc.). Va in cima a un AppScreen, fuori dallo
// scroll se si vuole fisso, o come primo figlio se deve scrollare col resto.
export function AppHeader({ title, eyebrow, action, onBack }: AppHeaderProps) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        {onBack ? (
          <AppIconButton icon={<ChevronLeft size={20} color={colors.ink} strokeWidth={2.4} />} onPress={onBack} accessibilityLabel="Indietro" />
        ) : null}
        <View style={styles.titleBlock}>
          {eyebrow ? <Text style={[AppTextStyle.eyebrow, { color: colors.moss }]}>{eyebrow}</Text> : null}
          <Text style={[AppTextStyle.title, { color: colors.ink }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: AppSpacing[3],
    paddingBottom: AppSpacing[3],
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing[3],
    flex: 1,
    minWidth: 0,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
});
