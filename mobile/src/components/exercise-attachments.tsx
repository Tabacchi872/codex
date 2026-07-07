import * as ImagePicker from 'expo-image-picker';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { Card } from './card';
import { ThemedText } from './themed-text';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAttachmentStore } from '@/store/attachment-store';
import type { ExerciseAttachment } from '@/types/attachment';

// Allegati per esercizio (foto di forma, screenshot): store reale persistito,
// non solo UI. Su web l'URI è un blob locale al browser (vedi types/attachment.ts).
export function ExerciseAttachments({ clientId, workoutExerciseId }: { clientId: string; workoutExerciseId: string }) {
  const theme = useTheme();
  const attachments = useAttachmentStore((s) => s.attachments);
  const addAttachment = useAttachmentStore((s) => s.addAttachment);
  const removeAttachment = useAttachmentStore((s) => s.removeAttachment);

  const mine = attachments.filter((a) => a.clientId === clientId && a.workoutExerciseId === workoutExerciseId);

  async function handleUpload() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (result.canceled || !result.assets[0]) return;
    const attachment: ExerciseAttachment = {
      id: `attachment-${Date.now()}`,
      clientId,
      workoutExerciseId,
      uri: result.assets[0].uri,
      createdAt: new Date().toISOString(),
    };
    addAttachment(attachment);
  }

  return (
    <Card style={styles.container}>
      <ThemedText type="smallBold">Allegati</ThemedText>

      {mine.length > 0 && (
        <View style={styles.thumbRow}>
          {mine.map((attachment) => (
            <View key={attachment.id} style={styles.thumbWrap}>
              <Image source={{ uri: attachment.uri }} style={styles.thumb} />
              <Pressable onPress={() => removeAttachment(attachment.id)} style={[styles.removeBadge, { backgroundColor: theme.statusExpired }]}>
                <ThemedText type="small" themeColor="onPrimary" style={styles.removeBadgeText}>
                  ✕
                </ThemedText>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <Pressable onPress={handleUpload}>
        <View style={[styles.uploadButton, { borderColor: theme.border }]}>
          <ThemedText type="smallBold">Carica allegato +</ThemedText>
        </View>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  thumbRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  thumbWrap: {
    position: 'relative',
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: Radius.sm,
  },
  removeBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBadgeText: {
    fontSize: 11,
    lineHeight: 13,
  },
  uploadButton: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
});
