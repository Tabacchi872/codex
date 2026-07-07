import { useAudioPlayer } from 'expo-audio';
import { Platform, Pressable, StyleSheet, Switch, View } from 'react-native';

import { Card } from './card';
import { ThemedText } from './themed-text';

import { Radius, Spacing } from '@/constants/theme';
import { SOUND_LABELS, SOUND_REGISTRY } from '@/data/sound-registry';
import { useTheme } from '@/hooks/use-theme';
import { useTrainingStore } from '@/store/training-store';
import type { SelectedSound } from '@/types/training';

const SOUND_OPTIONS: SelectedSound[] = ['beep', 'double-beep', 'chime', 'sirena'];
const VOLUME_STEP = 0.1;

export function SoundSettings() {
  const theme = useTheme();
  const settings = useTrainingStore((s) => s.soundSettings);
  const updateSoundSettings = useTrainingStore((s) => s.updateSoundSettings);
  const previewPlayer = useAudioPlayer(SOUND_REGISTRY[settings.selectedSound]);

  function playPreview(sound: SelectedSound) {
    previewPlayer.replace(SOUND_REGISTRY[sound]);
    previewPlayer.volume = settings.restSoundVolume;
    previewPlayer.seekTo(0);
    previewPlayer.play();
  }

  return (
    <View style={styles.container}>
      <Card padded={false}>
        <ToggleRow
          label="Suoni di recupero"
          value={settings.restSoundEnabled}
          onChange={(v) => updateSoundSettings({ restSoundEnabled: v })}
        />
        <Divider />
        <ToggleRow
          label="Suono countdown (ultimi 3s)"
          value={settings.countdownSoundEnabled}
          onChange={(v) => updateSoundSettings({ countdownSoundEnabled: v })}
          disabled={!settings.restSoundEnabled}
        />
        <Divider />
        <ToggleRow
          label="Suono a fine recupero"
          value={settings.finishSoundEnabled}
          onChange={(v) => updateSoundSettings({ finishSoundEnabled: v })}
          disabled={!settings.restSoundEnabled}
        />
        <Divider />
        <ToggleRow
          label="Vibrazione"
          value={settings.vibrationEnabled}
          onChange={(v) => updateSoundSettings({ vibrationEnabled: v })}
        />
      </Card>

      <SectionLabel>Volume</SectionLabel>
      <Card style={styles.volumeRow}>
        <StepperButton
          label="−"
          onPress={() => updateSoundSettings({ restSoundVolume: Math.max(0, +(settings.restSoundVolume - VOLUME_STEP).toFixed(2)) })}
          disabled={!settings.restSoundEnabled || settings.restSoundVolume <= 0}
        />
        <ThemedText type="default" style={styles.volumeValue}>
          {Math.round(settings.restSoundVolume * 100)}%
        </ThemedText>
        <StepperButton
          label="+"
          onPress={() => updateSoundSettings({ restSoundVolume: Math.min(1, +(settings.restSoundVolume + VOLUME_STEP).toFixed(2)) })}
          disabled={!settings.restSoundEnabled || settings.restSoundVolume >= 1}
        />
      </Card>

      <SectionLabel>Suono selezionato</SectionLabel>
      <Card padded={false}>
        {SOUND_OPTIONS.map((sound, index) => (
          <View key={sound}>
            <Pressable onPress={() => updateSoundSettings({ selectedSound: sound })} style={styles.soundOptionRow}>
              <View style={styles.radio}>
                {settings.selectedSound === sound && <View style={[styles.radioDot, { backgroundColor: theme.primary }]} />}
              </View>
              <ThemedText type="default" style={styles.soundOptionLabel}>
                {SOUND_LABELS[sound]}
              </ThemedText>
              <Pressable onPress={() => playPreview(sound)} hitSlop={8}>
                <ThemedText type="linkPrimary" style={{ color: theme.primary }}>
                  Prova
                </ThemedText>
              </Pressable>
            </Pressable>
            {index < SOUND_OPTIONS.length - 1 && <Divider />}
          </View>
        ))}
      </Card>

      {Platform.OS === 'web' && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.webNote}>
          Nella preview web la vibrazione non è disponibile (limite del browser): sarà attiva su iPhone/Android
          reali. Il suono invece funziona anche qui.
        </ThemedText>
      )}
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
      {children.toUpperCase()}
    </ThemedText>
  );
}

function Divider() {
  const theme = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.border }]} />;
}

function ToggleRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={styles.toggleRow}>
      <ThemedText type="default" themeColor={disabled ? 'disabled' : 'text'} style={styles.toggleLabel}>
        {label}
      </ThemedText>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: theme.primary }}
      />
    </View>
  );
}

function StepperButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const theme = useTheme();

  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => pressed && !disabled && styles.pressed}>
      <View
        style={[
          styles.stepperButton,
          { backgroundColor: theme.backgroundSelected },
          disabled && styles.stepperDisabled,
        ]}>
        <ThemedText type="smallBold" themeColor={disabled ? 'disabled' : 'text'}>
          {label}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  sectionLabel: {
    marginBottom: -Spacing.one,
    letterSpacing: 0.4,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  toggleLabel: {
    flex: 1,
    marginRight: Spacing.two,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.three,
  },
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
  },
  volumeValue: {
    minWidth: 48,
    textAlign: 'center',
    fontWeight: '600',
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperDisabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
  soundOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#9BA0A6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: Radius.pill,
  },
  soundOptionLabel: {
    flex: 1,
  },
  webNote: {
    lineHeight: 18,
  },
});
