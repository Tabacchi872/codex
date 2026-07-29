import { Mail } from 'lucide-react-native';
import { StyleSheet, Text } from 'react-native';

import { openLegalLink } from '@/components/developer-info-section';
import { LegalPage, type LegalSection } from '@/components/legal-page';
import { AppButton, AppCard } from '@/components/ui';
import { ACCOUNT_DELETION_REQUEST_MAILTO_URL, APP_NAME, LEGAL_CONFIG } from '@/constants/app-info';
import { AppFontSize, AppSpacing, useAppTheme } from '@/theme';

const sections: LegalSection[] = [
  {
    title: `Eliminare l account ${APP_NAME}`,
    body: [`Questa pagina spiega come eliminare o richiedere l'eliminazione di un account ${APP_NAME}, sviluppata da ${LEGAL_CONFIG.legalBusinessName}.`],
  },
  {
    title: 'Eliminazione diretta dall app',
    body: ['Dall\'app apri Profilo/Account e usa il comando Elimina account. Segui le conferme mostrate prima della chiusura definitiva.'],
  },
  {
    title: 'Richiesta senza accesso',
    body: [`Se non riesci ad accedere, invia una richiesta a ${LEGAL_CONFIG.supportEmail}. Per comunicazioni formali puoi usare la PEC ${LEGAL_CONFIG.pecEmail}.`],
  },
  {
    title: 'Verifica identita',
    body: ['Per richieste via email puo essere necessario verificare l\'identita del richiedente. Non inviare mai password, codici OTP o credenziali via email.'],
  },
  {
    title: 'Dati eliminati',
    body: ['In base alle funzioni usate, l\'eliminazione puo riguardare profilo, dati cliente o coach, questionari, programmi, schede, sessioni, appuntamenti, messaggi, notifiche e dati collegati all\'account.'],
  },
  {
    title: 'Dati eventualmente conservati',
    body: ['Alcuni dati possono essere conservati quando necessario per obblighi legali o contabili, sicurezza, prevenzione abusi, gestione di contestazioni o tutela di diritti.'],
  },
  {
    title: 'Tempi della richiesta',
    body: ['I tempi operativi puntuali non sono ancora definiti in una policy interna pubblicata. Le richieste saranno gestite compatibilmente con verifiche di identita, obblighi applicabili e complessita tecnica.'],
  },
  {
    title: 'Abbonamenti Google Play',
    body: ['Eliminare l\'account FitCoach Pro non annulla automaticamente un abbonamento Google Play. Per gestirlo apri Google Play, account, Pagamenti e abbonamenti, Abbonamenti.'],
  },
  {
    title: 'Abbonamenti Apple',
    body: ['Eliminare l\'account FitCoach Pro non annulla automaticamente un abbonamento Apple. Per gestirlo apri Impostazioni iOS, il tuo nome, Abbonamenti, quindi seleziona l\'abbonamento.'],
  },
  {
    title: 'Contatti',
    body: [`Per richieste sull'eliminazione account scrivere a ${LEGAL_CONFIG.supportEmail}. Per comunicazioni formali e' disponibile la PEC ${LEGAL_CONFIG.pecEmail}.`],
  },
];

export default function AccountDeletionScreen() {
  const { colors } = useAppTheme();
  return (
    <LegalPage title="Eliminazione account" version={LEGAL_CONFIG.termsVersion} sections={sections}>
      <AppCard style={{ gap: AppSpacing[2] }}>
        <Mail size={20} color={colors.moss} />
        <AppButton
          label="Richiedi eliminazione account"
          onPress={() => void openLegalLink(ACCOUNT_DELETION_REQUEST_MAILTO_URL)}
          fullWidth
        />
        <Text style={[styles.note, { color: colors.inkSoft }]}>
          Si aprira una nuova email indirizzata al supporto, senza password o dati sensibili precompilati.
        </Text>
      </AppCard>
    </LegalPage>
  );
}

const styles = StyleSheet.create({
  note: {
    fontSize: AppFontSize.sm,
    fontWeight: '600',
    lineHeight: 19,
  },
});
