import { StyleSheet } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function PlaceholderBanner({ text }: { text: string }) {
  const theme = useTheme();

  return (
    <ThemedView style={[styles.banner, { borderColor: theme.border }]}>
      <ThemedText type="small" themeColor="textSecondary">
        {text}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
});
