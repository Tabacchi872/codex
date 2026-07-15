import { useRouter, type Href } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';

type BackHeaderProps = {
  title?: string;
  fallbackHref: Href;
  includeTopInset?: boolean;
  onBack?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function BackHeader({ title, fallbackHref, includeTopInset = false, onBack, style }: BackHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();

  function handleBack() {
    if (onBack) {
      onBack();
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.push(fallbackHref);
  }

  return (
    <View style={[styles.root, includeTopInset && { paddingTop: insets.top }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Torna indietro"
        hitSlop={6}
        onPress={handleBack}
        style={({ pressed }) => [styles.button, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.82 : 1 }]}>
        <ArrowLeft size={20} color={colors.ink} strokeWidth={2.4} />
      </Pressable>
      {title ? (
        <Text style={[styles.title, { color: colors.ink }]} numberOfLines={1}>
          {title}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing[3],
    minWidth: 0,
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: AppRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: AppFontSize.lg,
    fontWeight: '800',
  },
});
