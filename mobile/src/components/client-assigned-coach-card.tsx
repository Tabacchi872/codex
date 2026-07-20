import { useRouter } from 'expo-router';
import { RefreshCw, UserRound } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppBadge, AppButton, AppCard } from './ui';

import { getAssignedCoachStatusLabel, type AssignedCoachSummary } from '@/lib/client-coach-service';
import { AppFontSize, AppSpacing, useAppTheme } from '@/theme';

type ClientAssignedCoachCardProps = {
  coach: AssignedCoachSummary | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
};

export function ClientAssignedCoachCard({ coach, loading, error, onRetry }: ClientAssignedCoachCardProps) {
  const { colors } = useAppTheme();
  const router = useRouter();

  return (
    <AppCard style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <UserRound size={18} color={colors.moss} />
          <Text style={[styles.title, { color: colors.ink }]}>Il tuo coach</Text>
        </View>
        {coach ? (
          <AppBadge
            label={getAssignedCoachStatusLabel(coach.connectionStatus)}
            tone={coach.connectionStatus === 'suspended' ? 'amber' : 'moss'}
          />
        ) : null}
      </View>

      {loading ? (
        <Text style={[styles.body, { color: colors.inkSoft }]}>Caricamento coach...</Text>
      ) : error ? (
        <View style={styles.errorBlock}>
          <Text style={[styles.body, { color: colors.inkSoft }]}>Non e stato possibile caricare i dati del coach.</Text>
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel="Riprova caricamento coach"
            hitSlop={8}
            style={styles.retryButton}>
            <RefreshCw size={14} color={colors.moss} />
            <Text style={[styles.retryText, { color: colors.moss }]}>Riprova</Text>
          </Pressable>
        </View>
      ) : coach ? (
        <View style={styles.coachBlock}>
          <Text style={[styles.coachName, { color: colors.ink }]} numberOfLines={1}>
            {coach.fullName || 'Coach'}
          </Text>
          {coach.businessName ? (
            <Text style={[styles.businessName, { color: colors.inkSoft }]} numberOfLines={1}>
              {coach.businessName}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.emptyBlock}>
          <Text style={[styles.body, { color: colors.inkSoft }]}>Nessun coach collegato</Text>
          <AppButton
            label="Collega un coach"
            variant="outline"
            onPress={() => router.push('/collega-coach')}
            accessibilityLabel="Collega un coach"
          />
        </View>
      )}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: AppSpacing[3],
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[2],
    justifyContent: 'space-between',
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppSpacing[2],
    minWidth: 0,
  },
  title: {
    fontSize: AppFontSize.base,
    fontWeight: '800',
  },
  body: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
    lineHeight: 19,
  },
  coachBlock: {
    gap: 3,
    minWidth: 0,
  },
  coachName: {
    fontSize: AppFontSize.base,
    fontWeight: '800',
    lineHeight: 20,
  },
  businessName: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
    lineHeight: 18,
  },
  errorBlock: {
    gap: AppSpacing[2],
  },
  emptyBlock: {
    gap: AppSpacing[2],
    alignItems: 'flex-start',
  },
  retryButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 6,
    minHeight: 44,
  },
  retryText: {
    fontSize: AppFontSize.sm,
    fontWeight: '800',
  },
});
