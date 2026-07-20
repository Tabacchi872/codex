import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton, AppCard } from '@/components/ui';
import { useCoachInviteCode } from '@/hooks/use-coach-invite-code';
import { AppFontSize, AppSpacing, useAppTheme } from '@/theme';

type CoachInviteCodeCardProps = {
  title: string;
  description?: string;
  copyLabel?: string;
};

export function CoachInviteCodeCard({ title, description, copyLabel = 'Copia codice' }: CoachInviteCodeCardProps) {
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

  return (
    <AppCard style={styles.card}>
      <View style={styles.header}>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
          {description ? <Text style={[styles.description, { color: colors.inkSoft }]}>{description}</Text> : null}
        </View>
      </View>

      {loading ? (
        <Text style={[styles.helper, { color: colors.inkSoft }]}>Caricamento codice...</Text>
      ) : error ? (
        <View style={styles.errorBlock}>
          <Text style={[styles.helper, { color: colors.inkSoft }]}>{error}</Text>
          <AppButton label="Riprova" onPress={reload} variant="outline" size="sm" />
        </View>
      ) : code ? (
        <>
          <View style={styles.codeRow}>
            <View style={styles.copy}>
              <Text selectable style={[styles.codeValue, { color: colors.coral }]}>
                {code}
              </Text>
              <Text style={[styles.status, { color: active ? colors.moss : colors.inkSoft }]}>
                {active ? 'Attivo per nuove registrazioni clienti' : 'Disattivato'}
              </Text>
            </View>
            <AppButton
              label={copyLabel}
              onPress={copyCoachCode}
              variant="outline"
              size="lg"
              disabled={!code}
              accessibilityLabel="Copia codice coach"
            />
          </View>
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
    gap: AppSpacing[2],
  },
  header: {
    flexDirection: 'row',
    gap: AppSpacing[2],
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: AppFontSize.base,
    fontWeight: '800',
  },
  description: {
    fontSize: AppFontSize.sm,
    lineHeight: AppFontSize.sm * 1.35,
    marginTop: 3,
  },
  helper: {
    fontSize: AppFontSize.sm,
    lineHeight: AppFontSize.sm * 1.35,
  },
  codeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppSpacing[2],
    justifyContent: 'space-between',
  },
  codeValue: {
    fontSize: AppFontSize.lg,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  status: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
    marginTop: 2,
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
