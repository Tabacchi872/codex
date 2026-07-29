import { LegalPage, type LegalSection } from '@/components/legal-page';
import { ACCOUNT_DELETION_URL, APP_NAME, LEGAL_CONFIG } from '@/constants/app-info';

const sections: LegalSection[] = [
  {
    title: 'Titolare del trattamento',
    body: [
      `${APP_NAME} e' fornita da ${LEGAL_CONFIG.legalBusinessName}, ${LEGAL_CONFIG.legalForm}, titolare ${LEGAL_CONFIG.legalOwnerName}. I dati identificativi e i contatti ufficiali sono riportati nella scheda iniziale di questa pagina.`,
    ],
  },
  {
    title: 'Dati raccolti',
    body: [
      `Trattiamo solo i dati necessari a creare l'account, usare ${APP_NAME}, gestire coach e clienti, generare o assegnare programmi, fornire assistenza e gestire abbonamenti.`,
    ],
  },
  {
    title: 'Dati account e contatto',
    body: ['Possiamo trattare nome, email, ruolo, stato account, preferenze essenziali, dati di registrazione e informazioni necessarie per autenticazione e supporto.'],
  },
  {
    title: 'Profilo fitness e questionario',
    body: [
      'Per i clienti autonomi trattiamo le risposte al questionario: obiettivi, livello dichiarato, luogo di allenamento, giorni disponibili, durata preferita, attrezzatura e preferenze di allenamento.',
    ],
  },
  {
    title: 'Peso, misure, obiettivi, dolori o limitazioni inserite',
    body: [
      'Peso, misure, obiettivi, dolori, patologie o limitazioni fisiche vengono trattati solo quando l\'utente li inserisce o li conferma. I dati fitness non sono automaticamente dati sanitari; informazioni su dolori, patologie o limitazioni possono pero avere natura particolare e sono usate solo per fornire le funzionalita richieste.',
    ],
  },
  {
    title: 'Allenamenti, carichi e progressi',
    body: ['Conserviamo schede, esercizi, sessioni, carichi, note, completamenti e progressi necessari a mostrare lo storico e proseguire il percorso di allenamento.'],
  },
  {
    title: 'Messaggi tra cliente e coach',
    body: ["Quando la funzione e' usata, i messaggi sono trattati per consentire comunicazioni tra cliente e coach e per mostrare lo storico pertinente."],
  },
  {
    title: 'Appuntamenti e notifiche',
    body: ['Trattiamo appuntamenti, promemoria e notifiche operative. Le notifiche push dipendono dalle autorizzazioni del dispositivo e dall\'integrazione Expo.'],
  },
  {
    title: 'Dati tecnici e diagnostici',
    body: ['Possiamo trattare dati tecnici essenziali come log applicativi, errori, identificativi tecnici, versione app, piattaforma, eventi di sicurezza e informazioni necessarie alla sincronizzazione.'],
  },
  {
    title: 'Dati relativi agli abbonamenti',
    body: ['Per Client Pro trattiamo product identifier, entitlement, store, ambiente, stato, date di acquisto/scadenza/rinnovo e dati ricevuti da RevenueCat o dagli store. Non gestiamo direttamente credenziali o numeri completi delle carte.'],
  },
  {
    title: 'Finalita del trattamento',
    body: ['Le finalita sono: erogare il servizio, creare account, collegare clienti e coach, generare programmi automatici, mostrare progressi, inviare notifiche operative, gestire abbonamenti, assistenza, sicurezza e obblighi legali.'],
  },
  {
    title: 'Base giuridica',
    body: ['Le basi giuridiche possono essere esecuzione del contratto o misure precontrattuali, obblighi legali, legittimo interesse per sicurezza e prevenzione abusi, e consenso esplicito quando vengono trattate informazioni potenzialmente relative alla salute o limitazioni fisiche.'],
  },
  {
    title: 'Fornitori e responsabili esterni',
    body: ['Dall\'audit del codice risultano usati Supabase, RevenueCat, Google Play, Apple App Store, Expo e Brevo. Ogni fornitore tratta dati secondo il proprio ruolo e le proprie condizioni contrattuali.'],
  },
  { title: 'Supabase', body: ["Supabase e' usato per autenticazione, database, policy di accesso, Edge Functions e servizi backend collegati."] },
  { title: 'RevenueCat', body: ["RevenueCat e' usato per gestire entitlement, abbonamenti in-app e webhook collegati agli acquisti Client Pro."] },
  { title: 'Google Play', body: ['Su Android, acquisti, rinnovi, disdette e gestione dell\'abbonamento avvengono tramite Google Play.'] },
  { title: 'Apple App Store', body: ["Su iOS, acquisti, rinnovi, disdette e gestione dell'abbonamento avvengono tramite Apple App Store quando la build iOS e' distribuita."] },
  {
    title: 'Expo',
    body: ["Expo e' usato per lo sviluppo e per servizi tecnici dell'app, inclusa la gestione delle notifiche push quando abilitate."],
  },
  {
    title: 'Brevo',
    body: ['Brevo risulta usato per email operative inviate dal backend, quando configurate.'],
  },
  {
    title: 'Conservazione dei dati',
    body: ['I dati sono conservati per il tempo necessario a fornire il servizio, mantenere lo storico utile all\'utente, rispettare obblighi legali o contabili e gestire sicurezza o contestazioni. Tempi piu specifici potranno essere definiti in una policy interna del titolare.'],
  },
  {
    title: 'Eliminazione account',
    body: [`L'account puo essere eliminato dall'app o tramite richiesta ai contatti indicati. Le istruzioni pubbliche sono disponibili su ${ACCOUNT_DELETION_URL}. Alcuni dati possono restare conservati se richiesto da obblighi legali o contabili.`],
  },
  {
    title: 'Trasferimenti internazionali',
    body: ['I fornitori cloud, store e servizi tecnici possono trattare dati anche fuori dall\'Italia o dall\'Unione europea secondo i rispettivi contratti e meccanismi di trasferimento. Non dichiariamo che tutti i dati restino sempre nell\'Unione europea se non verificato contrattualmente.'],
  },
  {
    title: 'Diritti dell interessato',
    body: [`L'utente puo chiedere accesso, rettifica, cancellazione, limitazione, opposizione e portabilita nei casi previsti dalla normativa. Per richieste privacy scrivere a ${LEGAL_CONFIG.privacyEmail}.`],
  },
  {
    title: 'Sicurezza',
    body: ['Il progetto usa autenticazione, separazione dei ruoli, policy RLS e funzioni server. Nessuna misura tecnica puo garantire sicurezza assoluta.'],
  },
  {
    title: 'Minori',
    body: [`Il servizio e' destinato a utenti maggiorenni. L'eta minima prevista e' ${LEGAL_CONFIG.minimumAge} anni.`],
  },
  {
    title: 'Modifiche alla privacy policy',
    body: ['Eventuali modifiche saranno pubblicate su questa pagina indicando nuova versione e data di efficacia.'],
  },
  {
    title: 'Contatti',
    body: [`Per privacy e assistenza scrivere a ${LEGAL_CONFIG.privacyEmail}. Per comunicazioni formali e' disponibile la PEC ${LEGAL_CONFIG.pecEmail}.`],
  },
];

export default function PrivacyPolicyScreen() {
  return <LegalPage title="Privacy policy" version={LEGAL_CONFIG.privacyVersion} sections={sections} />;
}
