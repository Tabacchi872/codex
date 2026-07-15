import { StyleSheet, View, type ViewProps } from 'react-native';

import { CardShadow, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Legacy visual card aligned with the new FitCoach Pro design system.  It is
// deliberately non-interactive; clickable areas must be explicit Pressables so
// the web build never produces a nested <button>.
export function Card({ style, padded = true, ...props }: ViewProps & { padded?: boolean }) {
  const theme = useTheme();

  return (
    <View
      {...props}
      style={[
        styles.card,
        padded && styles.padded,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        CardShadow,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  padded: {
    padding: Spacing.three,
    gap: 6,
  },
});
