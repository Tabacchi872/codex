// Avvia Expo puntando esplicitamente al Supabase locale (Docker), senza
// dipendere da variabili di sessione del terminale (`$env:` in PowerShell/
// `export` in bash durano solo per quella sessione — se il terminale viene
// chiuso/riaperto o Expo riavviato altrove, l'app ricade silenziosamente su
// mobile/.env, che punta al progetto Supabase di PRODUZIONE, causando
// "Azione non riconosciuta" su ogni azione nutrition mai deployata li').
//
// Uso:
//   npm run start:local        -> 127.0.0.1 (web, stesso PC)
//   npm run start:local:lan    -> IP LAN rilevato automaticamente (device
//                                 fisico/emulatore sulla stessa rete, via
//                                 Expo Dev Client — vedi mobile/eas.json,
//                                 profilo "development", + `npx expo start
//                                 --dev-client` dopo aver installato l'APK)
// Argomenti extra passano a "expo start" invariati, es.:
//   npm run start:local -- --web --port 8099
//
// Anon key qui sotto e' il valore PUBBLICO standard di qualunque istanza
// Supabase locale avviata con "supabase start" (non segreto, identico per
// chiunque lavori su questo repo). L'host (127.0.0.1 vs IP LAN) e' l'unica
// parte che cambia in base al target.
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const LOCAL_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

// Interfaccia IPv4 non-interna con nome Wi-Fi/Ethernet reale — MAI un
// adattatore virtuale (vEthernet/WSL/Hyper-V/VirtualBox/VMware), che pur
// risultando "non interno" non e' mai raggiungibile da un device fisico
// sulla stessa rete. Verificato su questa macchina: os.networkInterfaces()
// restituisce sia "Wi-Fi" (192.168.x.x, quella giusta) sia
// "vEthernet (WSL (Hyper-V firewall))" (172.x.x.x, quella sbagliata) — l'
// ordine delle chiavi dell'oggetto NON e' garantito, quindi prendere "la
// prima non-interna" senza filtrare il nome sceglierebbe quella giusta solo
// per caso.
const VIRTUAL_ADAPTER_PATTERN = /vEthernet|virtualbox|vmware|hyper-v|docker|wsl|loopback|tailscale|zerotier/i;

function detectLanIp() {
  const interfaces = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(interfaces)) {
    if (VIRTUAL_ADAPTER_PATTERN.test(name)) continue;
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) candidates.push({ name, address: iface.address });
    }
  }
  // Preferisci esplicitamente Wi-Fi/Ethernet se presenti tra i candidati
  // rimasti, altrimenti usa il primo non filtrato (meglio di niente, ma
  // segnalato all'utente per conferma visiva).
  const preferred = candidates.find((c) => /wi-?fi|ethernet/i.test(c.name));
  return (preferred ?? candidates[0])?.address ?? null;
}

const useLan = process.argv[2] === '--lan';
const extraArgs = useLan ? process.argv.slice(3) : process.argv.slice(2);

let host = '127.0.0.1';
if (useLan) {
  const lanIp = detectLanIp();
  if (!lanIp) {
    console.error('[start-local-supabase] Nessun IP di rete locale (LAN) rilevato — verifica di essere connesso a una rete Wi-Fi/Ethernet.');
    process.exit(1);
  }
  host = lanIp;
  console.log('[start-local-supabase] IP LAN rilevato:', host);
  console.log('[start-local-supabase] Verifica che il firewall di Windows permetta connessioni in ingresso sulla porta 54321.');
}

const LOCAL_SUPABASE_URL = `http://${host}:54321`;
const extraArgsFinal = useLan ? ['--dev-client', ...extraArgs] : extraArgs;

console.log('[start-local-supabase] EXPO_PUBLIC_SUPABASE_URL =', LOCAL_SUPABASE_URL);
console.log('[start-local-supabase] Assicurati che "supabase start" sia gia\' in esecuzione.');

const result = spawnSync('npx', ['expo', 'start', ...extraArgsFinal], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    EXPO_PUBLIC_SUPABASE_URL: LOCAL_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: LOCAL_SUPABASE_ANON_KEY,
  },
});

process.exit(result.status ?? 1);
