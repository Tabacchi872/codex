import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';

import { Radius } from '@/constants/theme';
import { resolveImageSource } from '@/data/image-registry';
import { useTheme } from '@/hooks/use-theme';
import type { Exercise } from '@/types/training';

// Thumbnail dell'esercizio nelle liste/card. Nessuna foto reale è ancora stata
// caricata nel progetto: finché IMAGE_REGISTRY resta vuoto, mostra un placeholder
// grafico (cerchio con iniziale) invece di un'icona finta o un'immagine rotta.
// Convenzione: il file immagine atteso è lo stesso nome di Exercise.videoFile con
// estensione .jpg (es. panca-piana.mp4 -> panca-piana.jpg) — vedi
// mobile/assets/images/exercises/README.md.
export function ExerciseThumbnail({ exercise, size = 48 }: { exercise: Exercise; size?: number }) {
  const theme = useTheme();
  const imageFile = exercise.videoFile.replace(/\.mp4$/i, '.jpg');
  const source = resolveImageSource(imageFile);

  const containerStyle = { width: size, height: size, borderRadius: size >= 64 ? Radius.md : Radius.sm };

  if (source) {
    return <Image source={source} style={[styles.image, containerStyle]} contentFit="cover" />;
  }

  return (
    <View style={[styles.placeholder, containerStyle, { backgroundColor: theme.background, borderColor: theme.border }]}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={{ fontSize: size * 0.36 }}>
        {exercise.name.charAt(0).toUpperCase()}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: '#00000010',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
