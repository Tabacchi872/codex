import { Check } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { openLegalLink } from '@/components/developer-info-section';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';

type LegalConsentCheckboxProps = {
  checked: boolean;
  label: string;
  linkLabel?: string;
  linkUrl?: string;
  onToggle: (checked: boolean) => void;
};

export function LegalConsentCheckbox({ checked, label, linkLabel, linkUrl, onToggle }: LegalConsentCheckboxProps) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        onPress={() => onToggle(!checked)}
        hitSlop={8}
        style={[
          styles.box,
          {
            backgroundColor: checked ? colors.moss : colors.surface,
            borderColor: checked ? colors.moss : colors.border,
          },
        ]}>
        {checked ? <Check size={15} color={colors.onMoss} /> : null}
      </Pressable>
      <View style={styles.copy}>
        <Text style={[styles.label, { color: colors.inkSoft }]}>{label}</Text>
        {linkLabel && linkUrl ? (
          <Pressable onPress={() => void openLegalLink(linkUrl)} hitSlop={6}>
            <Text style={[styles.link, { color: colors.moss }]}>{linkLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: AppSpacing[2],
  },
  box: {
    alignItems: 'center',
    borderRadius: AppRadius.sm,
    borderWidth: 1.5,
    height: 22,
    justifyContent: 'center',
    marginTop: 1,
    width: 22,
  },
  copy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  label: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
    lineHeight: 19,
  },
  link: {
    fontSize: AppFontSize.sm,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
});
