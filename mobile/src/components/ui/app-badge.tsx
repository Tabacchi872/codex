import { StyleSheet, Text } from 'react-native';

import { AppFontSize, AppRadius, useAppTheme } from '@/theme';

export type AppBadgeTone = 'moss' | 'coral' | 'amber' | 'rust' | 'neutral';

type AppBadgeProps = {
  label: string;
  tone?: AppBadgeTone;
};

// Badge di stato (StatusBadge nel mockup): completato/attivo -> moss,
// saltato/errore/bloccato/scaduto -> rust (MAI coral: coral è riservato alle
// azioni, un badge di stato negativo che usasse lo stesso colore delle CTA
// leggerebbe come "cosa fare" invece di "cosa è successo"), in prova -> amber.
export function AppBadge({ label, tone = 'neutral' }: AppBadgeProps) {
  const { colors } = useAppTheme();

  const { background, color } =
    tone === 'moss'
      ? { background: colors.mossSoft, color: colors.moss }
      : tone === 'coral'
        ? { background: colors.coralSoft, color: colors.coral }
        : tone === 'amber'
          ? { background: colors.amberSoft, color: colors.amber }
          : tone === 'rust'
            ? { background: colors.rustSoft, color: colors.rust }
            : { background: colors.surfaceSubtle, color: colors.inkSoft };

  return (
    <Text style={[styles.badge, { backgroundColor: background, color }]} numberOfLines={1}>
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: AppRadius.xs,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: AppFontSize.sm - 1,
    fontWeight: '700',
    alignSelf: 'flex-start',
    overflow: 'hidden',
  },
});
