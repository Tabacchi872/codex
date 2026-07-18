import { useEvent } from 'expo';
import { useVideoPlayer, VideoView, type VideoSource } from 'expo-video';
import { Play, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef } from 'react';
import { AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';

type FullscreenVideoModalProps = {
  visible: boolean;
  source: VideoSource;
  onClose: () => void;
  onPlaybackError?: () => void;
};

type VideoPreviewButtonProps = {
  onPress: () => void;
  label?: string;
};

export function FullscreenVideoModal({ visible, source, onClose, onPlaybackError }: FullscreenVideoModalProps) {
  if (!visible || !source) {
    return null;
  }

  return <LoadedFullscreenVideoModal source={source} onClose={onClose} onPlaybackError={onPlaybackError} />;
}

function LoadedFullscreenVideoModal({ source, onClose, onPlaybackError }: Omit<FullscreenVideoModalProps, 'visible'>) {
  const insets = useSafeAreaInsets();
  const errorHandledRef = useRef(false);
  const player = useVideoPlayer(source, (p) => {
    p.loop = false;
    p.staysActiveInBackground = false;
    p.showNowPlayingNotification = false;
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });

  const stopPlayback = useCallback(() => {
    try {
      player.pause();
      player.currentTime = 0;
    } catch (error) {
      if (__DEV__) {
        console.warn('[FullscreenVideoModal] Unable to stop playback', error);
      }
    }
  }, [player]);

  const handleClose = useCallback(() => {
    stopPlayback();
    onClose();
  }, [onClose, stopPlayback]);

  useEffect(() => {
    try {
      player.currentTime = 0;
      player.play();
    } catch (error) {
      if (__DEV__) {
        console.warn('[FullscreenVideoModal] Unable to start playback', error);
      }
    }

    return stopPlayback;
  }, [player, stopPlayback]);

  useEffect(() => {
    if (status !== 'error' || errorHandledRef.current) {
      return;
    }
    errorHandledRef.current = true;
    stopPlayback();
    onPlaybackError?.();
  }, [onPlaybackError, status, stopPlayback]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        stopPlayback();
      }
    });

    return () => subscription.remove();
  }, [stopPlayback]);

  return (
    <Modal
      visible
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={styles.modalRoot}>
        <VideoView
          player={player}
          style={styles.fullscreenVideo}
          nativeControls
          contentFit="contain"
          fullscreenOptions={{ enable: false }}
          allowsPictureInPicture={false}
          startsPictureInPictureAutomatically={false}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chiudi video"
          hitSlop={8}
          onPress={handleClose}
          style={[styles.closeButton, { top: Math.max(insets.top, 12) + 8, right: Math.max(insets.right, 12) }]}
        >
          <X size={24} color="#000" strokeWidth={2.8} />
        </Pressable>
      </View>
    </Modal>
  );
}

export function VideoPreviewButton({ onPress, label = 'Riproduci video' }: VideoPreviewButtonProps) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.preview, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}
    >
      <View style={[styles.previewOverlay, { backgroundColor: colors.mossSoft }]}>
        <View style={[styles.playButton, { backgroundColor: colors.ink }]}>
          <Play size={30} color={colors.moss} fill={colors.moss} />
        </View>
        <Text style={[styles.previewLabel, { color: colors.ink }]}>Guarda video</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    backgroundColor: '#000',
  },
  fullscreenVideo: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
  closeButton: {
    position: 'absolute',
    zIndex: 20,
    elevation: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  preview: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: AppRadius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  previewOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: AppSpacing[2],
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 4,
  },
  previewLabel: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
});
