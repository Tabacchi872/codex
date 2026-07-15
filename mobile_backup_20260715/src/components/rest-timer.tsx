import { useAudioPlayer } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Vibration, View } from 'react-native';

import { Card } from './card';
import { ThemedText } from './themed-text';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { SOUND_REGISTRY } from '@/data/sound-registry';
import { useTrainingStore } from '@/store/training-store';

const COUNTDOWN_TICK_THRESHOLD = 3;

function formatSeconds(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Timer di recupero: usabile durante l'allenamento, non solo per consultare la scheda.
// Suoni reali (mobile/assets/sounds/*.wav), vibrazione solo su iOS/Android (su web
// react-native-web ignora Vibration.vibrate senza errori, ma non produce alcun effetto:
// lo dichiariamo esplicitamente in UI invece di far credere che funzioni).
// `autoStartToken`: valore opzionale che, quando cambia (es. Date.now() ad ogni
// tap), avvia il timer da un pulsante esterno (vedi il bottone "Rec." in
// ExerciseSetLogger) senza duplicare la logica di countdown in due posti.
export function RestTimer({ restSeconds, autoStartToken }: { restSeconds: number; autoStartToken?: number }) {
  const theme = useTheme();
  const soundSettings = useTrainingStore((s) => s.soundSettings);
  const [remaining, setRemaining] = useState(restSeconds);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tickPlayer = useAudioPlayer(SOUND_REGISTRY.beep);
  const finishPlayer = useAudioPlayer(SOUND_REGISTRY[soundSettings.selectedSound]);

  useEffect(() => {
    setRemaining(restSeconds);
    setIsRunning(false);
  }, [restSeconds]);

  useEffect(() => {
    finishPlayer.replace(SOUND_REGISTRY[soundSettings.selectedSound]);
  }, [soundSettings.selectedSound]);

  useEffect(() => {
    if (!isRunning) return undefined;
    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setIsRunning(false);
          playFinish();
          return 0;
        }
        if (next <= COUNTDOWN_TICK_THRESHOLD) {
          playCountdownTick();
        }
        return next;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  useEffect(() => {
    if (autoStartToken === undefined) return;
    handleStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartToken]);

  function playCountdownTick() {
    if (soundSettings.restSoundEnabled && soundSettings.countdownSoundEnabled) {
      tickPlayer.volume = soundSettings.restSoundVolume;
      tickPlayer.seekTo(0);
      tickPlayer.play();
    }
    if (soundSettings.vibrationEnabled && Platform.OS !== 'web') {
      Vibration.vibrate(40);
    }
  }

  function playFinish() {
    if (soundSettings.restSoundEnabled && soundSettings.finishSoundEnabled) {
      finishPlayer.volume = soundSettings.restSoundVolume;
      finishPlayer.seekTo(0);
      finishPlayer.play();
    }
    if (soundSettings.vibrationEnabled && Platform.OS !== 'web') {
      Vibration.vibrate([0, 200, 100, 200]);
    }
  }

  function handleStart() {
    if (remaining <= 0) setRemaining(restSeconds);
    setIsRunning(true);
  }

  function handlePause() {
    setIsRunning(false);
  }

  function handleReset() {
    setIsRunning(false);
    setRemaining(restSeconds);
  }

  const statusLabel = isRunning
    ? 'Recupero in corso'
    : remaining === 0
      ? 'Recupero completato'
      : remaining < restSeconds
        ? 'In pausa'
        : 'Pronto a partire';

  return (
    <Card style={styles.container}>
      <View style={styles.headerRow}>
        <ThemedText type="smallBold">Timer di recupero</ThemedText>
        <ThemedText type="small" themeColor={isRunning ? 'statusActive' : 'textSecondary'}>
          {statusLabel}
        </ThemedText>
      </View>

      <ThemedText type="title" style={styles.countdown}>
        {formatSeconds(remaining)}
      </ThemedText>

      <View style={styles.buttonsRow}>
        <Pressable onPress={handleStart} disabled={isRunning} style={styles.primaryButtonWrap}>
          <View style={[styles.primaryButton, { backgroundColor: theme.primary }, isRunning && styles.buttonDisabled]}>
            <ThemedText type="smallBold" themeColor="onPrimary">
              {isRunning ? 'In corso…' : 'Start'}
            </ThemedText>
          </View>
        </Pressable>
        <SecondaryButton label="Pausa" onPress={handlePause} disabled={!isRunning} />
        <SecondaryButton label="Reset" onPress={handleReset} />
      </View>

      {soundSettings.vibrationEnabled && Platform.OS === 'web' && (
        <ThemedText type="small" themeColor="textSecondary">
          Vibrazione non disponibile nella preview web: sarà attiva su iPhone/Android reali.
        </ThemedText>
      )}
      {!soundSettings.restSoundEnabled && (
        <ThemedText type="small" themeColor="textSecondary">
          Suoni di recupero disattivati nelle Impostazioni.
        </ThemedText>
      )}
    </Card>
  );
}

function SecondaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const theme = useTheme();

  return (
    <Pressable onPress={onPress} disabled={disabled} style={styles.secondaryButtonWrap}>
      <View style={[styles.secondaryButton, { borderColor: theme.border }, disabled && styles.buttonDisabled]}>
        <ThemedText type="smallBold" themeColor={disabled ? 'disabled' : 'text'}>
          {label}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  countdown: {
    fontSize: 56,
    lineHeight: 62,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignSelf: 'stretch',
  },
  primaryButtonWrap: {
    flex: 1.4,
  },
  secondaryButtonWrap: {
    flex: 1,
  },
  primaryButton: {
    borderRadius: Radius.sm,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  secondaryButton: {
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
