import Constants from 'expo-constants';

// Unico punto in cui vivono nome app, proprietario e copyright: se in futuro
// cambia il nome (o va aggiornato l'anno), si cambia solo qui, non nelle
// singole schermate. "FitCoach Pro" è un nome provvisorio scelto per non
// usare "CoachPlus" (nome di un'app di riferimento, non nostro) né "CoachDesk"
// (nome di lavoro usato nelle fasi iniziali di questo progetto) — vedi
// docs/DECISIONS.md.
export const APP_NAME = 'FitCoach Pro';
export const APP_OWNER = 'Luigi Marrano';
export const APP_YEAR = 2026;
export const APP_COPYRIGHT = `© ${APP_YEAR} ${APP_OWNER}. Tutti i diritti riservati.`;

// Letta da app.json/package.json tramite expo-constants, non duplicata a mano:
// così la versione mostrata in Impostazioni è sempre quella reale del build.
export const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

// App a coach singolo: oggi esiste un solo coach (l'utilizzatore), non un
// sistema multi-coach. `coachId` compare comunque nei modelli (abbonamento,
// scheda/sessione, appuntamento) per non dover fare una migrazione dati se in
// futuro si aggiungessero più coach; per ora vale sempre questa costante.
export const DEFAULT_COACH_ID = 'coach-1';
