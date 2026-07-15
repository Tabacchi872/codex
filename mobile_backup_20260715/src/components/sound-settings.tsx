import { useAudioPlayer } from 'expo-audio';
import { Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { AppCard } from './ui';

import { SOUND_LABELS, SOUND_REGISTRY } from '@/data/sound-registry';
import { useTrainingStore } from '@/store/training-store';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';
import type { SelectedSound } from '@/types/training';

const SOUND_OPTIONS: SelectedSound[] = ['beep', 'double-beep', 'chime', 'sirena'];
const VOLUME_STEP = 0.1;

export function SoundSettings() {
  const { colors } = useAppTheme();
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
      <AppCard padded={false}>
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
        <ToggleRow label="Vibrazione" value={settings.vibrationEnabled} onChange={(v) => updateSoundSettings({ vibrationEnabled: v })} />
      </AppCard>

      <SectionLabel>Volume</SectionLabel>
      <AppCard style={styles.volumeRow}>
        <StepperButton
          label="−"
          onPress={() => updateSoundSettings({ restSoundVolume: Math.max(0, +(settings.restSoundVolume - VOLUME_STEP).toFixed(2)) })}
          disabled={!settings.restSoundEnabled || settings.restSoundVolume <= 0}
        />
        <Text style={[styles.volumeValue, { color: colors.ink }]}>{Math.round(settings.restSoundVolume * 100)}%</Text>
        <StepperButton
          label="+"
          onPress={() => updateSoundSettings({ restSoundVolume: Math.min(1, +(settings.restSoundVolume + VOLUME_STEP).toFixed(2)) })}
          disabled={!settings.restSoundEnabled || settings.restSoundVolume >= 1}
        />
      </AppCard>

      <SectionLabel>Suono selezionato</SectionLabel>
      <AppCard padded={false}>
        {SOUND_OPTIONS.map((sound, index) => (
          <View key={sound}>
            <Pressable onPress={() => updateSoundSettings({ selectedSound: sound })} style={styles.soundOptionRow}>
              <View style={[styles.radio, { borderColor: colors.moss }]}>
                {settings.selectedSound === sound ? <View style={[styles.radioDot, { backgroundColor: colors.moss }]} /> : null}
              </View>
              <Text style={[styles.soundOptionLabel, { color: colors.ink }]}>{SOUND_LABELS[sound]}</Text>
              <Pressable onPress={() => playPreview(sound)} hitSlop={8}>
                <Text style={[styles.previewLink, { color: colors.moss }]}>Prova</Text>
              </Pressable>
            </Pressable>
            {index < SOUND_OPTIONS.length - 1 ? <Divider /> : null}
          </View>
        ))}
      </AppCard>

      {Platform.OS === 'web' ? (
        <Text style={[styles.webNote, { color: colors.inkSoft }]}>
          Nella preview web la vibrazione non è disponibile (limite del browser): sarà attiva su iPhone/Android reali. Il suono
          invece funziona anche qui.
        </Text>
      ) : null}
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  const { colors } = useAppTheme();
  return <Text style={[styles.sectionLabel, { color: colors.inkFaint }]}>{children.toUpperCase()}</Text>;
}

function Divider() {
  const { colors } = useAppTheme();
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
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
  const { colors } = useAppTheme();

  return (
    <View style={styles.toggleRow}>
      <Text style={[styles.toggleLabel, { color: disabled ? colors.inkFaint : colors.ink }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: colors.moss }} />
    </View>
  );
}

function StepperButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useAppTheme();

  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => pressed && !disabled && styles.pressed}>
      <View style={[styles.stepperButton, { backgroundColor: colors.surfaceSubtle }, disabled && styles.stepperDisabled]}>
        <Text style={[styles.stepperLabel, { color: disabled ? colors.inkFaint : colors.ink }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: AppSpacing[3],
  },
  sectionLabel: {
    fontSize: AppFontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: -AppSpacing[1],
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: AppSpacing[3],
    paddingHorizontal: AppSpacing[3],
  },
  toggleLabel: {
    flex: 1,
    marginRight: AppSpacing[2],
    fontSize: AppFontSize.md,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: AppSpacing[3],
  },
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: AppSpacing[4],
  },
  volumeValue: {
    minWidth: 48,
    textAlign: 'center',
    fontWeight: '600',
    fontSize: AppFontSize.md,
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperLabel: {
    fontSize: AppFontSize.base,
    fontWeight: '700',
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
    gap: AppSpacing[2],
    paddingVertical: AppSpacing[3],
    paddingHorizontal: AppSpacing[3],
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: AppRadius.pill,
  },
  soundOptionLabel: {
    flex: 1,
    fontSize: AppFontSize.md,
  },
  previewLink: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  webNote: {
    fontSize: AppFontSize.sm,
    lineHeight: 18,
  },
});
