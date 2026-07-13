import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from './ui';

import {
  getCurrentCoachIdForUpload,
  uploadExerciseVideo,
  validateVideoAsset,
  type VideoAssetInput,
} from '@/lib/exercise-video-service';
import { AppFontSize, AppSpacing, useAppTheme } from '@/theme';

type UploadStatus = 'idle' | 'uploading' | 'error' | 'success';

// Controllo di caricamento video, visibile solo al coach (vedi
// esercizi/[id].tsx: montato solo se currentRole === 'coach' e Supabase e'
// configurato). Un solo video per (coach, esercizio): ricaricare sostituisce
// sempre il precedente (upsert lato service). Nessun progress reale mostrato
// durante l'upload (il client Supabase Storage non espone un callback di
// avanzamento): uno stato di caricamento indeterminato e' piu' onesto di una
// barra di progresso finta.
export function ExerciseVideoUploadControl({
  exerciseId,
  hasExistingVideo,
  onUploaded,
}: {
  exerciseId: string;
  hasExistingVideo: boolean;
  onUploaded: (videoUrl: string) => void;
}) {
  const { colors } = useAppTheme();
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function handlePick() {
    setStatus('idle');
    setMessage(null);

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setStatus('error');
      setMessage('Permesso di accesso alla libreria video negato.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] });
    if (result.canceled || !result.assets[0]) return;

    const picked = result.assets[0];
    const asset: VideoAssetInput = {
      uri: picked.uri,
      mimeType: picked.mimeType,
      fileName: picked.fileName,
      fileSize: picked.fileSize,
      webFile: picked.file ?? null,
    };

    const validation = validateVideoAsset(asset);
    if (!validation.ok) {
      setStatus('error');
      setMessage(validation.message);
      return;
    }

    setStatus('uploading');
    const coachId = await getCurrentCoachIdForUpload();
    if (!coachId) {
      setStatus('error');
      setMessage('Funzione disponibile solo per coach con account Supabase collegato.');
      return;
    }

    const uploadResult = await uploadExerciseVideo(coachId, exerciseId, asset);
    if (!uploadResult.ok) {
      setStatus('error');
      setMessage(uploadResult.message);
      return;
    }

    setStatus('success');
    setMessage('Video caricato correttamente.');
    onUploaded(uploadResult.data.videoUrl);
  }

  return (
    <View style={styles.wrap}>
      <AppButton
        label={hasExistingVideo ? 'Sostituisci video' : 'Carica video'}
        onPress={handlePick}
        variant="outline"
        size="sm"
        loading={status === 'uploading'}
        disabled={status === 'uploading'}
      />
      {message ? (
        <Text style={[styles.message, { color: status === 'error' ? colors.rust : colors.moss }]}>{message}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: AppSpacing[1],
  },
  message: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
  },
});
