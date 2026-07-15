import { Image } from 'expo-image';
import { Camera, UserRound } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppRadius, useAppTheme } from '@/theme';
import type { ClientAvatarPreset } from '@/types/client';

type UserAvatarProps = {
  firstName?: string | null;
  lastName?: string | null;
  imageUrl?: string | null;
  preset?: ClientAvatarPreset | null;
  size?: number;
  editable?: boolean;
  style?: StyleProp<ViewStyle>;
};

const PRESET_ACCENTS: Record<ClientAvatarPreset, { bg: string; fg: string }> = {
  male: { bg: '#163A5D', fg: '#9DD7FF' },
  female: { bg: '#4A203C', fg: '#FFB8DD' },
  neutral: { bg: '#1D3D18', fg: '#80EA2D' },
};

export function UserAvatar({
  firstName,
  lastName,
  imageUrl,
  preset = 'neutral',
  size = 48,
  editable = false,
  style,
}: UserAvatarProps) {
  const { colors } = useAppTheme();
  const [failed, setFailed] = useState(false);
  const safePreset = preset ?? 'neutral';
  const initials = getInitials(firstName, lastName);
  const accent = PRESET_ACCENTS[safePreset];
  const radius = size / 2;

  useEffect(() => {
    setFailed(false);
  }, [imageUrl]);

  return (
    <View
      style={[
        styles.root,
        {
          width: size,
          height: size,
          borderRadius: radius,
          borderColor: imageUrl && !failed ? colors.moss : accent.fg,
          backgroundColor: imageUrl && !failed ? colors.surfaceSubtle : accent.bg,
        },
        style,
      ]}>
      {imageUrl && !failed ? (
        <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" onError={() => setFailed(true)} />
      ) : initials ? (
        <Text style={[styles.initials, { color: accent.fg, fontSize: Math.max(14, size * 0.34) }]}>{initials}</Text>
      ) : (
        <UserRound size={size * 0.44} color={accent.fg} strokeWidth={2.2} />
      )}
      {editable ? (
        <View style={[styles.editBadge, { backgroundColor: colors.moss, borderColor: colors.background }]}>
          <Camera size={Math.max(10, size * 0.18)} color={colors.onMoss} strokeWidth={2.4} />
        </View>
      ) : null}
    </View>
  );
}

function getInitials(firstName?: string | null, lastName?: string | null) {
  const first = firstName?.trim().charAt(0) ?? '';
  const last = lastName?.trim().charAt(0) ?? '';
  return `${first}${last}`.trim().toUpperCase();
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    borderWidth: 2,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: {
    fontWeight: '900',
    letterSpacing: 0,
  },
  editBadge: {
    alignItems: 'center',
    borderRadius: AppRadius.pill,
    borderWidth: 2,
    bottom: 0,
    height: 22,
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    width: 22,
  },
});
