import type { PropsWithChildren } from 'react';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

// Formati simulabili nella preview: non solo iPhone. 360 = Android compatto,
// 390 = iPhone standard, 430 = telefono grande (Android/iPhone Pro Max).
const SIZE_PRESETS = {
  S: { width: 360, label: '360' },
  M: { width: 390, label: '390' },
  L: { width: 430, label: '430' },
} as const;
type PresetKey = keyof typeof SIZE_PRESETS;

const FRAME_HEIGHT = 820;
const OUTER_PADDING = 24;
const CHROME_HEIGHT = 56; // etichetta + selettore formato, riservato sopra la cornice

// Solo su web: inquadra la preview in un mockup leggero stile smartphone (non solo
// iPhone). Su iPhone/Android reali (Expo Go) questo componente ritorna semplicemente
// i children senza alcuna cornice: Platform.OS !== 'web'.
export function WebPhoneFrame({ children }: PropsWithChildren) {
  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }

  return <PhoneMockup>{children}</PhoneMockup>;
}

function PhoneMockup({ children }: PropsWithChildren) {
  const { width, height } = useWindowDimensions();
  const [preset, setPreset] = useState<PresetKey>('M');

  const targetWidth = SIZE_PRESETS[preset].width;
  const frameWidth = Math.min(targetWidth, width - OUTER_PADDING * 2);
  const frameHeight = Math.min(FRAME_HEIGHT, height - OUTER_PADDING * 2 - CHROME_HEIGHT);

  return (
    <View style={styles.stage}>
      <View style={styles.chrome}>
        <Text style={styles.label}>Anteprima PC · {SIZE_PRESETS[preset].label}px</Text>
        <View style={styles.presetRow}>
          {(Object.keys(SIZE_PRESETS) as PresetKey[]).map((key) => (
            <Pressable key={key} onPress={() => setPreset(key)} hitSlop={6}>
              <View style={[styles.presetDot, preset === key && styles.presetDotActive]}>
                <Text style={[styles.presetDotLabel, preset === key && styles.presetDotLabelActive]}>{key}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={[styles.frame, { width: frameWidth, height: frameHeight }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    minHeight: 560,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E3E5E9',
    paddingVertical: OUTER_PADDING,
  },
  chrome: {
    height: CHROME_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  label: {
    fontSize: 12,
    color: '#6B7076',
  },
  presetRow: {
    flexDirection: 'row',
    gap: 6,
  },
  presetDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D3D6DA',
  },
  presetDotActive: {
    backgroundColor: '#0E7A5B',
    borderColor: '#0E7A5B',
  },
  presetDotLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7076',
  },
  presetDotLabelActive: {
    color: '#FFFFFF',
  },
  frame: {
    overflow: 'hidden',
    borderRadius: 32,
    borderWidth: 6,
    borderColor: '#1B1D20',
    backgroundColor: '#000000',
    boxShadow: '0 16px 40px rgba(15, 17, 20, 0.25)',
  },
});
