// Test del componente email condiviso (stesso pattern di
// supabase/functions/revenuecat-webhook/index.test.ts: Deno.test su funzioni
// pure, nessuna infrastruttura di rendering reale). Vedi ESITO del commit
// per la conferma che questi test sono scritti/revisionati ma NON eseguiti
// in questo ambiente (nessun CLI Deno disponibile).

import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildEmail, escapeHtml, renderButton, renderInfoBox, renderSecurityNote, safeUrl } from './email-template.ts';

const TEST_OPTS = { sanitizeOps: false, sanitizeResources: false };

// --- escapeHtml --------------------------------------------------------

Deno.test({
  name: 'escapeHtml: nome con apostrofo non rompe il markup',
  ...TEST_OPTS,
  fn: () => {
    assertEquals(escapeHtml("D'Angelo"), 'D&#39;Angelo');
  },
});

Deno.test({
  name: 'escapeHtml: tentativo di injection <script> viene neutralizzato',
  ...TEST_OPTS,
  fn: () => {
    const result = escapeHtml('<script>alert(1)</script>');
    assertEquals(result.includes('<script>'), false);
    assertEquals(result, '&lt;script&gt;alert(1)&lt;/script&gt;');
  },
});

Deno.test({
  name: 'escapeHtml: & e virgolette doppie/singole escapate correttamente',
  ...TEST_OPTS,
  fn: () => {
    assertEquals(escapeHtml(`Coach "Mario" & C.`), 'Coach &quot;Mario&quot; &amp; C.');
  },
});

Deno.test({
  name: 'escapeHtml: null/undefined non producono mai la stringa "null"/"undefined"',
  ...TEST_OPTS,
  fn: () => {
    assertEquals(escapeHtml(null), '');
    assertEquals(escapeHtml(undefined), '');
  },
});

// --- safeUrl -------------------------------------------------------------

Deno.test({
  name: 'safeUrl: accetta solo https://',
  ...TEST_OPTS,
  fn: () => {
    assertEquals(safeUrl('https://fitcoach.example.com/set-password'), 'https://fitcoach.example.com/set-password');
  },
});

Deno.test({
  name: 'safeUrl: rifiuta javascript:/http:/data:/stringa vuota',
  ...TEST_OPTS,
  fn: () => {
    assertEquals(safeUrl('javascript:alert(1)'), null);
    assertEquals(safeUrl('http://example.com'), null);
    assertEquals(safeUrl('data:text/html;base64,abc'), null);
    assertEquals(safeUrl(''), null);
    assertEquals(safeUrl(null), null);
    assertEquals(safeUrl(undefined), null);
  },
});

Deno.test({
  name: 'safeUrl: rifiuta un URL malformato anche se inizia con https://',
  ...TEST_OPTS,
  fn: () => {
    assertEquals(safeUrl('https://'), null);
  },
});

// --- renderButton --------------------------------------------------------

Deno.test({
  name: 'renderButton: assente se url non valido, nessun href rotto',
  ...TEST_OPTS,
  fn: () => {
    assertEquals(renderButton({ label: 'Apri', url: 'javascript:alert(1)' }), '');
    assertEquals(renderButton(undefined), '');
  },
});

Deno.test({
  name: 'renderButton: presente con url valido, include sempre il fallback testuale',
  ...TEST_OPTS,
  fn: () => {
    const html = renderButton({ label: 'Conferma email', url: 'https://fitcoach.example.com/confirm' });
    assertStringIncludes(html, 'https://fitcoach.example.com/confirm');
    assertStringIncludes(html, 'Conferma email');
    assertStringIncludes(html, 'Se il pulsante non funziona');
  },
});

Deno.test({
  name: 'renderButton: escapa la label',
  ...TEST_OPTS,
  fn: () => {
    const html = renderButton({ label: '<b>Vai</b>', url: 'https://example.com' });
    assertEquals(html.includes('<b>Vai</b>'), false);
    assertStringIncludes(html, '&lt;b&gt;Vai&lt;/b&gt;');
  },
});

// --- renderInfoBox ---------------------------------------------------------

Deno.test({
  name: 'renderInfoBox: vuoto se nessuna riga valida',
  ...TEST_OPTS,
  fn: () => {
    assertEquals(renderInfoBox([]), '');
    assertEquals(renderInfoBox(undefined), '');
    assertEquals(renderInfoBox([{ label: '', value: 'x' }]), '');
  },
});

Deno.test({
  name: 'renderInfoBox: escapa label e valore di ogni riga',
  ...TEST_OPTS,
  fn: () => {
    const html = renderInfoBox([{ label: 'Email', value: '<script>evil()</script>' }]);
    assertEquals(html.includes('<script>evil()</script>'), false);
    assertStringIncludes(html, '&lt;script&gt;evil()&lt;/script&gt;');
  },
});

// --- renderSecurityNote -----------------------------------------------------

Deno.test({
  name: 'renderSecurityNote: vuoto se testo mancante, presente ed escapato altrimenti',
  ...TEST_OPTS,
  fn: () => {
    assertEquals(renderSecurityNote(''), '');
    assertEquals(renderSecurityNote(undefined), '');
    const html = renderSecurityNote("Se non hai richiesto tu, contatta l'assistenza.");
    assertStringIncludes(html, "contatta l'assistenza.");
  },
});

// --- buildEmail: struttura completa -----------------------------------------

Deno.test({
  name: 'buildEmail: include sempre preheader e footer comune',
  ...TEST_OPTS,
  fn: () => {
    const email = buildEmail({
      subject: 'Oggetto di prova',
      title: 'Titolo di prova',
      preheader: 'Anteprima nascosta',
      paragraphs: ['Corpo del messaggio.'],
    });
    assertStringIncludes(email.html, 'Anteprima nascosta');
    assertStringIncludes(email.html, "Questa è un'email automatica. Non rispondere direttamente a questo messaggio.");
    assertStringIncludes(email.html, 'Privacy Policy');
    assertStringIncludes(email.html, 'Termini di servizio');
    assertStringIncludes(email.text, "Questa è un'email automatica. Non rispondere direttamente a questo messaggio.");
  },
});

Deno.test({
  name: 'buildEmail: nessun placeholder perso, nessun "undefined"/"null" nell\'output',
  ...TEST_OPTS,
  fn: () => {
    const email = buildEmail({
      subject: 'Oggetto',
      title: 'Titolo',
      paragraphs: ['Riga 1', 'Riga 2'],
    });
    assertStringIncludes(email.html, 'Riga 1');
    assertStringIncludes(email.html, 'Riga 2');
    assertStringIncludes(email.text, 'Riga 1');
    assertStringIncludes(email.text, 'Riga 2');
    assertEquals(email.html.includes('undefined'), false);
    assertEquals(email.html.includes('null'), false);
    assertEquals(email.text.includes('undefined'), false);
    assertEquals(email.text.includes('null'), false);
  },
});

Deno.test({
  name: 'buildEmail: nessuna riga del box informativo viene persa nell\'output',
  ...TEST_OPTS,
  fn: () => {
    const email = buildEmail({
      subject: 'Oggetto',
      title: 'Titolo',
      paragraphs: ['Corpo.'],
      infoBox: [
        { label: 'Email', value: 'cliente@example.com' },
        { label: 'Ruolo', value: 'Cliente' },
      ],
    });
    assertStringIncludes(email.html, 'cliente@example.com');
    assertStringIncludes(email.html, 'Ruolo');
    assertStringIncludes(email.html, 'Cliente');
  },
});

Deno.test({
  name: 'buildEmail: escapa nome cliente/coach passato come greetingName',
  ...TEST_OPTS,
  fn: () => {
    const email = buildEmail({
      subject: 'Oggetto',
      title: 'Titolo',
      greetingName: '<script>alert(1)</script>',
      paragraphs: ['Corpo.'],
    });
    assertEquals(email.html.includes('<script>alert(1)</script>'), false);
    assertStringIncludes(email.html, '&lt;script&gt;alert(1)&lt;/script&gt;');
  },
});

Deno.test({
  name: 'buildEmail: layout entro 600px, tabelle, nessun JavaScript',
  ...TEST_OPTS,
  fn: () => {
    const email = buildEmail({ subject: 'Oggetto', title: 'Titolo', paragraphs: ['Corpo.'] });
    assertStringIncludes(email.html, 'max-width:600px');
    assertStringIncludes(email.html, '<table');
    assertEquals(email.html.includes('<script'), false);
    assertEquals(email.html.includes('display:flex'), false);
    assertEquals(email.html.includes('display:grid'), false);
  },
});

Deno.test({
  name: 'buildEmail: forza color-scheme light (nessun testo invisibile in dark mode)',
  ...TEST_OPTS,
  fn: () => {
    const email = buildEmail({ subject: 'Oggetto', title: 'Titolo', paragraphs: ['Corpo.'] });
    assertStringIncludes(email.html, 'name="color-scheme" content="light"');
    assertStringIncludes(email.html, 'name="supported-color-schemes" content="light"');
  },
});

Deno.test({
  name: 'buildEmail: subject restituito invariato',
  ...TEST_OPTS,
  fn: () => {
    const email = buildEmail({ subject: 'Il tuo account FitCoach è pronto', title: 'Titolo', paragraphs: ['Corpo.'] });
    assertEquals(email.subject, 'Il tuo account FitCoach è pronto');
  },
});
