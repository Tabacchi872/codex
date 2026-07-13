import { ChevronRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';

type AppListRowProps = {
  icon?: ReactNode;
  iconBackground?: string;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
};

// Riga di lista standard (ListRow nel mockup): icona in chip colorata,
// titolo+sottotitolo, elemento finale (chevron di default, o un badge/bottone
// passato in `trailing`). Usata dentro AppCard per liste di sezione (Home
// cliente "Oggi", Nutrizione, Altro, Impostazioni...).
export function AppListRow({ icon, iconBackground, title, subtitle, trailing, onPress, showChevron = true }: AppListRowProps) {
  const { colors } = useAppTheme();

  const row = (
    <View style={styles.row}>
      {icon ? (
        <View style={[styles.iconWrap, { backgroundColor: iconBackground ?? colors.surfaceSubtle }]}>{icon}</View>
      ) : null}
      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: colors.ink }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.inkSoft }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ?? (showChevron && onPress ? <ChevronRight size={18} color={colors.inkFaint} /> : null)}
    </View>
  );

  if (!onPress) return row;

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} hitSlop={2}>
      {row}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing[3],
    paddingVertical: AppSpacing[3],
    minHeight: 44,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: AppRadius.md - 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: AppFontSize.sm,
    marginTop: 1,
  },
});
