const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const file = path.join(__dirname, '..', 'src', 'lib', 'superadmin-payment-utils.ts');
const source = fs.readFileSync(file, 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

const sandbox = { exports: {}, module: { exports: {} }, Intl, Date, console, require };
sandbox.exports = sandbox.module.exports;
vm.runInNewContext(js, sandbox, { filename: file });
const utils = sandbox.module.exports;

const cases = [
  { name: 'acquisto produzione completo', row: { id: '1', eventType: 'INITIAL_PURCHASE', amount: 9.99, currency: 'EUR', environment: 'PRODUCTION', transactionId: 'tx1', date: '2026-07-28T10:00:00Z', clientName: 'Cliente' } },
  { name: 'acquisto sandbox', row: { id: '2', eventType: 'INITIAL_PURCHASE', amount: 9.99, currency: 'EUR', environment: 'SANDBOX', transactionId: 'tx2', date: '2026-07-28T10:00:00Z' } },
  { name: 'rinnovo', row: { id: '3', eventType: 'RENEWAL', amount: 9.99, currency: 'EUR', environment: 'PRODUCTION', transactionId: 'tx3', date: '2026-07-28T10:00:00Z' } },
  { name: 'cancellazione valida', row: { id: '4', eventType: 'CANCELLATION', subscriptionStatus: 'active', amount: null, currency: null, originalTransactionId: 'orig4', date: '2026-07-28T10:00:00Z' } },
  { name: 'scadenza', row: { id: '5', eventType: 'EXPIRATION', amount: null, currency: null, originalTransactionId: 'orig5', date: '2026-07-28T10:00:00Z' } },
  { name: 'refund', row: { id: '6', eventType: 'REFUND', amount: 9.99, currency: 'EUR', environment: 'PRODUCTION', transactionId: 'tx6', date: '2026-07-28T10:00:00Z' } },
  { name: 'billing issue', row: { id: '7', eventType: 'BILLING_ISSUE', amount: null, currency: null, transactionId: 'tx7', date: '2026-07-28T10:00:00Z' } },
  { name: 'vecchio evento payload fallback', row: { id: '8', eventType: 'INITIAL_PURCHASE', amount: '9.99', currency: 'EUR', eventId: 'evt8', date: '2026-07-28T10:00:00Z' } },
  { name: 'price null', row: { id: '9', eventType: 'INITIAL_PURCHASE', amount: null, currency: 'EUR', eventId: 'evt9', date: '2026-07-28T10:00:00Z' } },
  { name: 'currency null', row: { id: '10', eventType: 'INITIAL_PURCHASE', amount: 9.99, currency: null, eventId: 'evt10', date: '2026-07-28T10:00:00Z' } },
  { name: 'senza profilo', row: { id: '11', eventType: 'RENEWAL', amount: 9.99, currency: 'EUR', eventId: 'evt11', date: '2026-07-28T10:00:00Z', clientName: null } },
  { name: 'data non valida', row: { id: '12', eventType: 'RENEWAL', amount: 9.99, currency: 'EUR', eventId: 'evt12', date: 'non-data' } },
  { name: 'evento sconosciuto', row: { id: '13', eventType: 'SOMETHING_NEW', amount: null, currency: null, eventId: 'evt13', date: '2026-07-28T10:00:00Z' } },
];

const duplicateRows = [
  { id: 'dup1', eventType: 'RENEWAL', transactionId: 'tx-dup', date: '2026-07-28T10:00:00Z' },
  { id: 'dup2', eventType: 'RENEWAL', transactionId: 'tx-dup', date: '2026-07-28T10:00:00Z' },
];

const failures = [];
for (const item of cases) {
  try {
    const presentation = utils.revenueCatEventPresentation(item.row.eventType);
    const amount = utils.formatPaymentAmount(item.row.amount, item.row.currency);
    const date = utils.formatPaymentDate(item.row.date);
    const name = utils.clientDisplayName(item.row);
    const key = utils.paymentIdentity(item.row);
    if (!presentation.label || !amount || !date || !name || !key) failures.push(`${item.name}: output vuoto`);
    if (amount.includes('NaN')) failures.push(`${item.name}: importo NaN`);
    if (date.includes('Invalid')) failures.push(`${item.name}: data invalida`);
  } catch (err) {
    failures.push(`${item.name}: ${err.message}`);
  }
}

if (utils.dedupePayments(duplicateRows).length !== 1) failures.push('evento duplicato: dedupe fallito');
if (utils.isRealPositiveRevenue(cases[1].row)) failures.push('sandbox conteggiato come incasso reale');
if (utils.isRealPositiveRevenue(cases[5].row)) failures.push('refund conteggiato come incasso positivo');
if (utils.isRealPositiveRevenue(cases[6].row)) failures.push('billing issue conteggiato come incasso');

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('SUPERADMIN_PAYMENT_FIXTURES_PASS', cases.length + 3);
