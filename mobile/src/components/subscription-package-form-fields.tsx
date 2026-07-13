import { X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppTextField } from '@/components/ui';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';

// Campi di form condivisi tra superadmin/pacchetti/new.tsx e
// superadmin/pacchetti/[id].tsx — vive in components/, non in app/, perche'
// expo-router tratterebbe altrimenti questo file come una rotta.

type SegmentedOption = { value: string; label: string };

export function SegmentedChoice({
  options,
  value,
  onChange,
}: {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.segmentBar, { borderColor: colors.border }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            hitSlop={4}
            style={[styles.segmentButton, selected && { backgroundColor: colors.moss }]}>
            <Text style={[styles.segmentLabel, { color: selected ? colors.onMoss : colors.ink }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function FeaturesEditor({ features, onChange }: { features: string[]; onChange: (features: string[]) => void }) {
  const { colors } = useAppTheme();
  const [draft, setDraft] = useState('');

  function addFeature() {
    const trimmed = draft.trim();
    if (!trimmed || features.includes(trimmed)) {
      setDraft('');
      return;
    }
    onChange([...features, trimmed]);
    setDraft('');
  }

  function removeFeature(feature: string) {
    onChange(features.filter((item) => item !== feature));
  }

  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>Funzionalita&apos; incluse</Text>
      <View style={styles.addRow}>
        <View style={styles.addInput}>
          <AppTextField value={draft} onChangeText={setDraft} placeholder="Es. Piano nutrizionale" onSubmitEditing={addFeature} />
        </View>
        <AppButton label="Aggiungi" onPress={addFeature} variant="outline" size="sm" />
      </View>
      {features.length > 0 ? (
        <View style={styles.chips}>
          {features.map((feature) => (
            <Pressable
              key={feature}
              onPress={() => removeFeature(feature)}
              hitSlop={4}
              style={[styles.chip, { backgroundColor: colors.mossSoft }]}>
              <Text style={[styles.chipLabel, { color: colors.moss }]}>{feature}</Text>
              <X size={12} color={colors.moss} strokeWidth={2.5} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  segmentBar: {
    flexDirection: 'row',
    borderRadius: AppRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
    gap: 3,
  },
  segmentButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    borderRadius: AppRadius.md - 2,
  },
  segmentLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  field: {
    gap: AppSpacing[2],
  },
  fieldLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: AppSpacing[2],
  },
  addInput: {
    flex: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  chip: {
    alignItems: 'center',
    borderRadius: AppRadius.xs,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipLabel: {
    fontSize: AppFontSize.sm - 1,
    fontWeight: '700',
  },
});
