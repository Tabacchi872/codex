import type { Client } from '@/types/client';

// Generazione credenziali DEMO. Username derivato dal nome, password temporanea
// generata da una lista di parole + numero: sufficiente per dimostrare il flusso
// (genera, mostra, copia/condividi, cambio obbligatorio al primo accesso),
// non un generatore crittograficamente sicuro. Vedi docs/DECISIONS.md.
const ACCENTS: Record<string, string> = {
  a: 'aàáâã',
  e: 'eèéêë',
  i: 'iìíîï',
  o: 'oòóôõ',
  u: 'uùúûü',
  c: 'cç',
  n: 'nñ',
};

function stripAccents(value: string): string {
  let result = value;
  for (const [plain, accented] of Object.entries(ACCENTS)) {
    for (const char of accented) {
      result = result.split(char).join(plain);
    }
  }
  return result;
}

function slugify(value: string): string {
  return stripAccents(value.toLowerCase()).replace(/[^a-z0-9]+/g, '');
}

export function generateUsername(client: Pick<Client, 'firstName' | 'lastName'>): string {
  return `${slugify(client.firstName)}.${slugify(client.lastName)}`;
}

const PASSWORD_WORDS = ['Forza', 'Slancio', 'Ritmo', 'Energia', 'Scatto', 'Grinta', 'Podio', 'Motore'];

export function generateTemporaryPassword(): string {
  const word = PASSWORD_WORDS[Math.floor(Math.random() * PASSWORD_WORDS.length)];
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `${word}${digits}!`;
}

export function buildCredentialsMessage(
  client: Pick<Client, 'firstName'>,
  account: { username: string; temporaryPassword: string }
): string {
  return `Ciao ${client.firstName},\nil tuo coach ti ha creato l'accesso all'app.\n\nUsername: ${account.username}\nPassword temporanea: ${account.temporaryPassword}\n\nAl primo accesso cambia la password.`;
}
