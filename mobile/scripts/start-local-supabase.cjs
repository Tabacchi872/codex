// Avvia Expo puntando esplicitamente al Supabase locale (Docker), senza
// dipendere da variabili di sessione del terminale (`$env:` in PowerShell/
// `export` in bash durano solo per quella sessione — se il terminale viene
// chiuso/riaperto o Expo riavviato altrove, l'app ricade silenziosamente su
// mobile/.env, che punta al progetto Supabase di PRODUZIONE, causando
// "Azione non riconosciuta" su ogni azione nutrition mai deployata li').
//
// Uso: npm run start:local  (equivalente a "expo start", con l'ambiente
// locale gia' impostato). Argomenti extra passano a "expo start" invariati,
// es.: npm run start:local -- --web --port 8099
//
// URL/anon key qui sotto sono i valori PUBBLICI standard di qualunque
// istanza Supabase locale avviata con "supabase start" (validi solo su
// 127.0.0.1, non segreti) - identici per chiunque lavori su questo repo.
const { spawnSync } = require('node:child_process');

const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';
const LOCAL_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const extraArgs = process.argv.slice(2);

console.log('[start-local-supabase] EXPO_PUBLIC_SUPABASE_URL =', LOCAL_SUPABASE_URL);
console.log('[start-local-supabase] Assicurati che "supabase start" sia gia\' in esecuzione.');

const result = spawnSync('npx', ['expo', 'start', ...extraArgs], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    EXPO_PUBLIC_SUPABASE_URL: LOCAL_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: LOCAL_SUPABASE_ANON_KEY,
  },
});

process.exit(result.status ?? 1);
