import { LegalPage, type LegalSection } from '@/components/legal-page';
import { APP_NAME, LEGAL_CONFIG } from '@/constants/app-info';

const sections: LegalSection[] = [
  {
    title: `Descrizione di ${APP_NAME}`,
    body: [`${APP_NAME} e' un'app per organizzare allenamenti, schede, progressi, comunicazioni coach-cliente e programmi automatici per clienti autonomi.`],
  },
  {
    title: 'Identita del fornitore',
    body: [`Il servizio e' fornito da ${LEGAL_CONFIG.legalBusinessName}, ${LEGAL_CONFIG.legalForm}, titolare ${LEGAL_CONFIG.legalOwnerName}, con sede in ${LEGAL_CONFIG.legalAddress}.`],
  },
  {
    title: 'Requisiti account',
    body: [`Per usare il servizio occorre creare un account, fornire dati corretti, custodire le credenziali e avere almeno ${LEGAL_CONFIG.minimumAge} anni.`],
  },
  {
    title: 'Ruoli Cliente, Coach e Superadmin',
    body: ['Il Cliente usa le funzioni disponibili nel proprio percorso. Il Coach gestisce soltanto i clienti assegnati. Il Superadmin amministra il servizio e accede alle aree necessarie alla gestione operativa.'],
  },
  {
    title: 'Cliente autonomo senza coach',
    body: ['Il cliente senza coach puo usare funzioni self-guided se possiede i requisiti richiesti, incluso l\'eventuale abbonamento Client Pro attivo.'],
  },
  {
    title: 'Programmi automatici',
    body: ['I programmi automatici sono basati su questionario, regole interne e template. Non sostituiscono una valutazione professionale individuale o medica.'],
  },
  {
    title: 'Schede create dai coach',
    body: ['Le schede e i contenuti creati o modificati da un coach sono responsabilita del coach che li assegna al cliente.'],
  },
  {
    title: 'Natura informativa del servizio',
    body: ['Le informazioni fornite dall\'app hanno natura organizzativa e informativa per la gestione dell\'allenamento.'],
  },
  {
    title: 'Nessuna diagnosi medica',
    body: ['Il servizio non fornisce diagnosi, prescrizioni, terapie, trattamenti sanitari o pareri medici.'],
  },
  {
    title: 'Nessuna promessa di risultato',
    body: ['Non vengono promessi dimagrimento, aumento di massa, miglioramenti fisici garantiti, prestazioni specifiche o assenza di infortuni.'],
  },
  {
    title: 'Responsabilita prima dell esercizio',
    body: ['L\'utente deve valutare il proprio stato fisico prima di allenarsi e consultare un professionista sanitario quando ha dubbi, patologie, dolore, infortuni o limitazioni.'],
  },
  {
    title: 'Interruzione in caso di dolore o malessere',
    body: ['L\'utente deve interrompere l\'attivita fisica e chiedere assistenza qualificata in caso di dolore, malessere, capogiri, difficolta respiratoria o sintomi anomali.'],
  },
  {
    title: 'Abbonamenti Client Pro',
    body: ['Client Pro abilita funzioni riservate ai clienti autonomi secondo le condizioni mostrate nello store e nell\'app.'],
  },
  {
    title: 'Rinnovo automatico',
    body: ['Gli abbonamenti possono rinnovarsi automaticamente secondo le condizioni dello store usato per l\'acquisto.'],
  },
  {
    title: 'Acquisti tramite Google Play o Apple',
    body: ['I pagamenti in-app sono gestiti da Google Play o Apple App Store. FitCoach Pro non tratta direttamente numeri completi di carta o credenziali di pagamento.'],
  },
  {
    title: 'Disdetta dallo store',
    body: ['La disdetta e la gestione del rinnovo devono essere effettuate nello store usato per l\'acquisto.'],
  },
  {
    title: 'Eliminazione account e abbonamento',
    body: ['Eliminare l\'account FitCoach Pro non annulla automaticamente un abbonamento Google Play o Apple. L\'utente deve gestire l\'abbonamento nello store.'],
  },
  {
    title: 'Uso consentito',
    body: ['Il servizio deve essere usato in modo lecito, personale, rispettoso dei diritti altrui e coerente con le funzioni previste.'],
  },
  {
    title: 'Divieti',
    body: ['Sono vietati accessi abusivi, condivisione impropria di account, uso di dati altrui senza autorizzazione, aggiramento di abbonamenti o sicurezza e caricamento di contenuti illeciti.'],
  },
  {
    title: 'Proprieta intellettuale',
    body: ['Marchi, interfacce, testi, codice, template e contenuti dell\'app sono protetti nei limiti previsti dalla legge.'],
  },
  {
    title: 'Sospensione ed eliminazione account',
    body: ['L\'account puo essere sospeso o eliminato in caso di violazioni, rischi di sicurezza, obblighi legali o richiesta dell\'utente.'],
  },
  {
    title: 'Disponibilita del servizio',
    body: ['Il servizio puo subire manutenzioni, interruzioni, limiti tecnici o indisponibilita dipendenti da fornitori esterni.'],
  },
  {
    title: 'Limitazioni di responsabilita',
    body: ['Le limitazioni valgono nei limiti consentiti dalla legge e non escludono diritti inderogabili dell\'utente o responsabilita che non possono essere escluse per legge.'],
  },
  {
    title: 'Legge applicabile',
    body: ['I presenti termini sono regolati dalla legge italiana, salvo norme inderogabili eventualmente applicabili all\'utente.'],
  },
  {
    title: 'Modifiche ai termini',
    body: ['Le modifiche saranno pubblicate su questa pagina con versione e data di efficacia aggiornate.'],
  },
  {
    title: 'Contatti assistenza',
    body: [`Per assistenza scrivere a ${LEGAL_CONFIG.supportEmail}. Per comunicazioni formali e' disponibile la PEC ${LEGAL_CONFIG.pecEmail}.`],
  },
];

export default function TermsOfServiceScreen() {
  return <LegalPage title="Termini di servizio" version={LEGAL_CONFIG.termsVersion} sections={sections} />;
}
