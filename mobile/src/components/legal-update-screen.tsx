import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LegalConsentCheckbox } from '@/components/legal-consent-checkbox';
import { AppButton, AppCard, AppScreen } from '@/components/ui';
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '@/constants/app-info';
import { recordCurrentLegalAcceptance } from '@/lib/legal-acceptance-service';
import { AppFontSize, AppSpacing, AppTextStyle, useAppTheme } from '@/theme';

type LegalUpdateScreenProps = {
  onAccepted: () => void;
  onLogout: () => void;
};

export function LegalUpdateScreen({ onAccepted, onLogout }: LegalUpdateScreenProps) {
  const { colors } = useAppTheme();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!termsAccepted || !privacyAcknowledged || submitting) {
      setError('Per continuare devi accettare i Termini di servizio e dichiarare di aver letto l Informativa privacy.');
      return;
    }

    setSubmitting(true);
    setError('');
    const result = await recordCurrentLegalAcceptance();
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (!result.data.accepted) {
      setError('Accettazione non confermata dal server. Riprova.');
      return;
    }
    onAccepted();
  }

  return (
    <AppScreen contentStyle={styles.content} bottomTabInset={false}>
      <AppCard style={styles.card}>
        <Text style={[AppTextStyle.title, { color: colors.ink }]}>Aggiornamento legale richiesto</Text>
        <Text style={[styles.body, { color: colors.inkSoft }]}>
          Prima di continuare devi confermare la versione corrente dei Termini di servizio e dichiarare di aver letto
          l Informativa privacy. Nessuna accettazione viene registrata senza una tua azione esplicita.
        </Text>
        <View style={styles.consents}>
          <LegalConsentCheckbox
            checked={termsAccepted}
            label="Accetto i Termini di servizio"
            linkLabel="Apri Termini"
            linkUrl={TERMS_OF_SERVICE_URL}
            onToggle={setTermsAccepted}
          />
          <LegalConsentCheckbox
            checked={privacyAcknowledged}
            label="Dichiaro di aver letto l Informativa privacy"
            linkLabel="Apri Privacy"
            linkUrl={PRIVACY_POLICY_URL}
            onToggle={setPrivacyAcknowledged}
          />
        </View>
        {error ? <Text style={[styles.error, { color: colors.rust }]}>{error}</Text> : null}
        <AppButton
          label="Continua"
          onPress={submit}
          loading={submitting}
          disabled={submitting || !termsAccepted || !privacyAcknowledged}
          fullWidth
        />
        <Pressable onPress={onLogout} hitSlop={8}>
          <Text style={[styles.logout, { color: colors.inkSoft }]}>Esci</Text>
        </Pressable>
      </AppCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  card: {
    gap: AppSpacing[3],
  },
  body: {
    fontSize: AppFontSize.base,
    fontWeight: '600',
    lineHeight: 22,
  },
  consents: {
    gap: AppSpacing[2],
  },
  error: {
    fontSize: AppFontSize.sm,
    fontWeight: '700',
  },
  logout: {
    fontSize: AppFontSize.sm,
    fontWeight: '800',
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});
