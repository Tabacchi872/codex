// Componente email condiviso FitCoach — un solo sistema grafico per tutte le
// email inviate da Edge Function (oggi: send-temporary-credentials, in
// futuro qualunque altra email custom via Brevo/altro provider).
//
// NON riguarda i template Supabase Auth (Dashboard, docs/email-templates/):
// quelli sono file HTML statici con placeholder Go-template
// ({{ .ConfirmationURL }} ecc.) incollati a mano in Authentication → Email
// Templates, incompatibili con questo helper (che genera HTML/testo a
// partire da valori TypeScript, non da un motore di template lato server
// Supabase). Vedi docs/email-templates/README.md per quel flusso.
//
// Regole di sicurezza:
// - Ogni valore dinamico (nome cliente/coach, email, testo libero) passa da
//   escapeHtml prima di finire nel markup.
// - Ogni URL passa da safeUrl (solo https://) prima di finire in un href:
//   mai un javascript:/data:/URL vuoto in un link cliccabile.
// - Solo tabelle HTML e CSS inline, nessun JavaScript, nessun font esterno
//   obbligatorio, larghezza massima 600px — compatibile con Gmail, Outlook,
//   Apple Mail e client mobili.

export const BRAND_NAME = 'FitCoach';
export const BRAND_TAGLINE = 'Il tuo percorso, ogni giorno.';

// Duplicati da mobile/src/constants/app-info.ts: una Edge Function Deno non
// puo' importare codice React Native, quindi questi valori vivono qui come
// seconda fonte. Sono PLACEHOLDER espliciti (dominio example.com), non URL
// definitivi — tenerli allineati a mano con app-info.ts quando Luigi
// pubblichera' le pagine reali (vedi docs/email-templates/README.md).
export const PRIVACY_POLICY_URL = 'https://example.com/fitcoach/privacy-policy';
export const TERMS_OF_SERVICE_URL = 'https://example.com/fitcoach/termini-di-servizio';

// Palette 1:1 da mobile/src/theme/colors.ts (variante light: le email non
// tentano un vero tema scuro, vedi il meta "color-scheme" sotto).
const COLORS = {
  background: '#F3F6F2',
  surface: '#FFFFFF',
  surfaceSubtle: '#EAF1E7',
  border: '#DCE5DA',
  ink: '#07110B',
  inkSoft: '#536052',
  inkFaint: '#879187',
  moss: '#67D42D',
  onMoss: '#07110B',
  amberSoft: '#FCEACB',
  amber: '#E3922A',
  onAmber: '#2A1B02',
} as const;

const FONT_STACK = 'Arial, Helvetica, sans-serif';

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Solo https:// e' accettato in un href generato da questo helper: mai un
// javascript:/data:/mailto: costruito da un valore non fidato, mai un link
// rotto silenzioso da un URL vuoto/malformato.
export function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!/^https:\/\//i.test(trimmed)) return null;
  try {
    // eslint-disable-next-line no-new
    new URL(trimmed);
  } catch {
    return null;
  }
  return trimmed;
}

export type EmailButton = { label: string; url: string };
export type KeyValueRow = { label: string; value: string };

// Bottone principale + fallback testuale con l'URL sempre visibile subito
// sotto (non solo se il bottone "non funziona": alcuni client email
// rimuovono gli <a> con stile, il link in chiaro resta comunque leggibile
// e copiabile).
export function renderButton(button: EmailButton | null | undefined): string {
  if (!button) return '';
  const url = safeUrl(button.url);
  if (!url) return '';
  const label = escapeHtml(button.label);
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
  <tr>
    <td align="center" bgcolor="${COLORS.moss}" style="border-radius:8px;">
      <a href="${url}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:${FONT_STACK};font-size:16px;font-weight:700;color:${COLORS.onMoss};text-decoration:none;border-radius:8px;">${label}</a>
    </td>
  </tr>
</table>
<p style="margin:0 0 16px 0;font-family:${FONT_STACK};font-size:13px;line-height:1.5;color:${COLORS.inkSoft};word-break:break-all;">
  Se il pulsante non funziona, copia e incolla questo link nel browser:<br>
  <a href="${url}" style="color:${COLORS.inkSoft};">${url}</a>
</p>`.trim();
}

// Box informazioni (credenziali, nuovo indirizzo email, ecc.) — ogni valore
// passa da escapeHtml, righe vuote/mancanti semplicemente omesse.
export function renderInfoBox(rows: KeyValueRow[] | null | undefined): string {
  const list = (rows ?? []).filter((row) => row.label && row.value);
  if (list.length === 0) return '';
  const rowsHtml = list
    .map(
      (row) => `
    <div style="margin-bottom:10px;">
      <div style="font-family:${FONT_STACK};font-size:12px;color:${COLORS.inkSoft};text-transform:uppercase;letter-spacing:0.4px;">${escapeHtml(row.label)}</div>
      <div style="font-family:${FONT_STACK};font-size:16px;color:${COLORS.ink};font-weight:700;word-break:break-word;">${escapeHtml(row.value)}</div>
    </div>`,
    )
    .join('');
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 16px 0;">
  <tr>
    <td bgcolor="${COLORS.surfaceSubtle}" style="border:1px solid ${COLORS.border};border-radius:8px;padding:16px;">
      ${rowsHtml.trim()}
    </td>
  </tr>
</table>`.trim();
}

// Callout di sicurezza (es. "se non hai richiesto tu questa modifica...").
export function renderSecurityNote(text: string | null | undefined): string {
  if (!text) return '';
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 16px 0;">
  <tr>
    <td bgcolor="${COLORS.amberSoft}" style="border-radius:4px;padding:12px 16px;border-left:4px solid ${COLORS.amber};">
      <p style="margin:0;font-family:${FONT_STACK};font-size:13px;line-height:1.5;color:${COLORS.onAmber};">${escapeHtml(text)}</p>
    </td>
  </tr>
</table>`.trim();
}

export type BuildEmailOptions = {
  subject: string;
  title: string;
  preheader?: string;
  greetingName?: string | null;
  paragraphs: string[];
  infoBox?: KeyValueRow[];
  button?: EmailButton;
  securityNote?: string;
};

export type BuiltEmail = { subject: string; html: string; text: string };

// Assembla il documento completo (header FitCoach, corpo, footer comune) e
// la versione testo semplice equivalente. Ogni valore dinamico passato in
// paragraphs/greetingName/infoBox e' escapato internamente: i chiamanti non
// devono richiamare escapeHtml a mano su questi campi.
export function buildEmail(options: BuildEmailOptions): BuiltEmail {
  const title = escapeHtml(options.title);
  const preheader = escapeHtml(options.preheader ?? '');
  const greetingHtml = options.greetingName
    ? `<p style="margin:0 0 16px 0;font-family:${FONT_STACK};font-size:15px;line-height:1.6;color:${COLORS.ink};">Ciao ${escapeHtml(options.greetingName)},</p>`
    : '';
  const paragraphsHtml = options.paragraphs
    .filter((p) => Boolean(p))
    .map(
      (p) =>
        `<p style="margin:0 0 16px 0;font-family:${FONT_STACK};font-size:15px;line-height:1.6;color:${COLORS.ink};">${escapeHtml(p)}</p>`,
    )
    .join('');
  const infoBoxHtml = renderInfoBox(options.infoBox);
  const buttonHtml = renderButton(options.button);
  const securityHtml = renderSecurityNote(options.securityNote);

  const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.background};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.background};">
  <tr>
    <td align="center" style="padding:24px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:${COLORS.surface};border:1px solid ${COLORS.border};border-radius:12px;">
        <tr>
          <td align="center" style="padding:32px 32px 16px 32px;">
            <div style="font-family:${FONT_STACK};font-size:22px;font-weight:700;color:${COLORS.ink};">${BRAND_NAME}</div>
            <div style="font-family:${FONT_STACK};font-size:13px;color:${COLORS.inkSoft};margin-top:4px;">${BRAND_TAGLINE}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px;"><hr style="border:none;border-top:1px solid ${COLORS.border};margin:8px 0 24px 0;"></td>
        </tr>
        <tr>
          <td style="padding:0 32px;">
            <h1 style="margin:0 0 16px 0;font-family:${FONT_STACK};font-size:20px;color:${COLORS.ink};">${title}</h1>
            ${greetingHtml}
            ${paragraphsHtml}
            ${infoBoxHtml}
            ${buttonHtml}
            ${securityHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 32px 32px;border-top:1px solid ${COLORS.border};">
            <p style="margin:0 0 8px 0;font-family:${FONT_STACK};font-size:12px;color:${COLORS.inkFaint};line-height:1.6;">
              Hai ricevuto questa email perché è stata effettuata un'operazione sul tuo account FitCoach.<br>
              Per assistenza utilizza i contatti presenti nell'app.
            </p>
            <p style="margin:0 0 8px 0;font-family:${FONT_STACK};font-size:12px;">
              <a href="${PRIVACY_POLICY_URL}" style="color:${COLORS.inkSoft};">Privacy Policy</a> · <a href="${TERMS_OF_SERVICE_URL}" style="color:${COLORS.inkSoft};">Termini di servizio</a>
            </p>
            <p style="margin:0;font-family:${FONT_STACK};font-size:12px;color:${COLORS.inkFaint};">
              Questa è un'email automatica. Non rispondere direttamente a questo messaggio.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const textLines: string[] = [
    `${BRAND_NAME} — ${BRAND_TAGLINE}`,
    '',
    options.title,
    '',
  ];
  if (options.greetingName) {
    textLines.push(`Ciao ${options.greetingName},`, '');
  }
  for (const p of options.paragraphs) {
    if (!p) continue;
    textLines.push(p, '');
  }
  const infoRows = (options.infoBox ?? []).filter((row) => row.label && row.value);
  if (infoRows.length > 0) {
    for (const row of infoRows) textLines.push(`${row.label}: ${row.value}`);
    textLines.push('');
  }
  const buttonUrl = options.button ? safeUrl(options.button.url) : null;
  if (options.button && buttonUrl) {
    textLines.push(`${options.button.label}: ${buttonUrl}`, '');
  }
  if (options.securityNote) {
    textLines.push(options.securityNote, '');
  }
  textLines.push(
    "Hai ricevuto questa email perché è stata effettuata un'operazione sul tuo account FitCoach.",
    "Per assistenza utilizza i contatti presenti nell'app.",
    `Privacy Policy: ${PRIVACY_POLICY_URL}`,
    `Termini di servizio: ${TERMS_OF_SERVICE_URL}`,
    "Questa è un'email automatica. Non rispondere direttamente a questo messaggio.",
  );

  return { subject: options.subject, html, text: textLines.join('\n') };
}
