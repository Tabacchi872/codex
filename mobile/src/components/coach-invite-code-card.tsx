import * as Clipboard from 'expo-clipboard';
import { Copy, Share2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, Share, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppCard } from '@/components/ui';
import { Fonts } from '@/constants/theme';
import { useCoachInviteCode } from '@/hooks/use-coach-invite-code';
import { AppFontSize, AppRadius, AppSpacing, useAppTheme } from '@/theme';

type CoachInviteCodeCardProps = {
  title: string;
  description?: string;
  copyLabel?: string;
  showShare?: boolean;
};

export function CoachInviteCodeCard({ title, description, copyLabel = 'Copia codice', showShare = false }: CoachInviteCodeCardProps) {
  const { colors } = useAppTheme();
  const { code, active, loading, error, reload } = useCoachInviteCode();
  const [copyFeedback, setCopyFeedback] = useState('');

  useEffect(() => {
    if (!copyFeedback) return;
    const timeout = setTimeout(() => setCopyFeedback(''), 2500);
    return () => clearTimeout(timeout);
  }, [copyFeedback]);

  async function copyCoachCode() {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    setCopyFeedback('Codice copiato');
  }

  async function shareCoachCode() {
    if (!code) return;
    const message = `Usa il codice ${code} per collegarti al mio profilo su FitCoach.`;
    if (Platform.OS === 'web') {
      // Share.share di React Native non e' affidabile su web: copiamo direttamente.
      await Clipboard.setStringAsync(message);
      setCopyFeedback('Condivisione non disponibile su web: testo copiato negli appunti.');
      return;
    }
    try {
      await Share.share({ message });
    } catch {
      await Clipboard.setStringAsync(message);
      setCopyFeedback('Condivisione non riuscita: testo copiato negli appunti.');
    }
  }

  return (
    <AppCard style={styles.card}>
      <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
      {description ? <Text style={[styles.description, { color: colors.inkSoft }]}>{description}</Text> : null}

      {loading ? (
        <Text style={[styles.helper, { color: colors.inkSoft }]}>Caricamento codice...</Text>
      ) : error ? (
        <View style={styles.errorBlock}>
          <Text style={[styles.helper, { color: colors.inkSoft }]}>{error}</Text>
          <AppButton label="Riprova" onPress={reload} variant="outline" size="sm" />
        </View>
      ) : code ? (
        <>
          <View style={[styles.codeBlock, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
            <Text
              selectable
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
              style={[styles.codeValue, { color: colors.coral }]}>
              {code}
            </Text>
          </View>

          <View style={[styles.statusBadge, { backgroundColor: active ? colors.mossSoft : colors.surfaceSubtle }]}>
            {active ? <View style={[styles.statusDot, { backgroundColor: colors.moss }]} /> : null}
            <Text
              numberOfLines={1}
              style={[styles.statusLabel, { color: active ? colors.moss : colors.inkSoft }]}>
              {active ? 'Attivo per nuove registrazioni' : 'Disattivato'}
            </Text>
          </View>

          {showShare ? (
            <View style={styles.actionsRow}>
              <View style={styles.actionItem}>
                <AppButton
                  label={copyLabel}
                  onPress={copyCoachCode}
                  variant="outline"
                  size="lg"
                  icon={<Copy size={16} color={colors.ink} />}
                  disabled={!code}
                  accessibilityLabel="Copia codice coach"
                  fullWidth
                />
              </View>
              <View style={styles.actionItem}>
                <AppButton
                  label="Condividi"
                  onPress={shareCoachCode}
                  variant="outline"
                  size="lg"
                  icon={<Share2 size={16} color={colors.ink} />}
                  disabled={!code}
                  accessibilityLabel="Condividi codice coach"
                  fullWidth
                />
              </View>
            </View>
          ) : (
            <AppButton
              label={copyLabel}
              onPress={copyCoachCode}
              variant="outline"
              size="lg"
              icon={<Copy size={16} color={colors.ink} />}
              disabled={!code}
              accessibilityLabel="Copia codice coach"
            />
          )}

          {copyFeedback ? <Text style={[styles.feedback, { color: colors.moss }]}>{copyFeedback}</Text> : null}
        </>
      ) : (
        <View style={styles.errorBlock}>
          <Text style={[styles.helper, { color: colors.inkSoft }]}>Codice invito non disponibile</Text>
          <AppButton label="Riprova" onPress={reload} variant="outline" size="sm" />
        </View>
      )}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: AppSpacing[3],
  },
  title: {
    fontSize: AppFontSize.base,
    fontWeight: '800',
  },
  description: {
    fontSize: AppFontSize.sm,
    lineHeight: AppFontSize.sm * 1.35,
  },
  helper: {
    fontSize: AppFontSize.sm,
    lineHeight: AppFontSize.sm * 1.35,
  },
  codeBlock: {
    borderRadius: AppRadius.md,
    borderWidth: 1,
    paddingHorizontal: AppSpacing[3],
    paddingVertical: AppSpacing[3],
  },
  codeValue: {
    fontFamily: Fonts.mono,
    fontSize: AppFontSize.xl,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  statusBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: AppRadius.pill,
    flexDirection: 'row',
    gap: AppSpacing[1],
    paddingHorizontal: AppSpacing[2],
    paddingVertical: 5,
  },
  statusDot: {
    borderRadius: AppRadius.pill,
    height: 6,
    width: 6,
  },
  statusLabel: {
    fontSize: AppFontSize.sm - 1,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
  },
  actionItem: {
    flexBasis: 130,
    flexGrow: 1,
  },
  feedback: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  errorBlock: {
    alignItems: 'flex-start',
    gap: AppSpacing[2],
  },
});
