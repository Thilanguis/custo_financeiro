const test = require('node:test');
const assert = require('node:assert/strict');
const cards = require('../docs/card-statements.js');

const card = { id: 'visa', closing: 15, due: 6, monthlyLimit: 5000 };
const statement = (dueMonth, amount, payments = [], extra = {}) => ({
  id: cards.statementId(card.id, dueMonth),
  cardId: card.id,
  ...cards.getCycle(card, dueMonth),
  calculatedAmount: amount,
  payments,
  adjustments: [],
  createdAt: `${dueMonth}-01T00:00:00.000Z`,
  updatedAt: `${dueMonth}-01T00:00:00.000Z`,
  ...extra,
});

test('crédito confirmado da fatura anterior reduz a fatura atual', () => {
  const july = statement('2026-07', 1606.15, [
    { id: 'p1', amount: 1000 },
    { id: 'p2', amount: 1000 },
    { id: 'p3', amount: 1000 },
    { id: 'p4', amount: 774 },
  ], { bankAmount: 1606.15 });
  const august = statement('2026-08', 3817.55);

  const opening = cards.getCardOpeningBalance(card, '2026-08', [july, august]);
  const overview = cards.getCardOverview(august, [{ amount: 1175.76 }], 5000, opening);

  assert.equal(opening, -2167.85);
  assert.equal(overview.closed.carriedCredit, 2167.85);
  assert.equal(overview.closed.remaining, 1649.70);
  assert.equal(overview.currentBalance, 2825.46);
  assert.equal(overview.availableLimit, 2174.54);
});

test('crédito oficial continua para os meses seguintes até ser totalmente consumido', () => {
  const june = statement('2026-06', 500, [{ id: 'p1', amount: 1000 }], { bankAmount: 500 });
  const july = statement('2026-07', 200);
  const august = statement('2026-08', 150);

  assert.equal(cards.getCardOpeningBalance(card, '2026-07', [june, july, august]), -500);
  assert.equal(cards.getCardOpeningBalance(card, '2026-08', [june, july, august]), -300);

  const augustTotals = cards.getEffectiveStatementTotals(august, -300);
  assert.equal(augustTotals.remaining, 0);
  assert.equal(augustTotals.credit, 150);
});

test('saldo não pago também é carregado para a fatura seguinte', () => {
  const july = statement('2026-07', 1000, [{ id: 'p1', amount: 600 }]);
  const august = statement('2026-08', 500);

  const opening = cards.getCardOpeningBalance(card, '2026-08', [july, august]);
  const totals = cards.getEffectiveStatementTotals(august, opening);

  assert.equal(opening, 400);
  assert.equal(totals.carriedDebt, 400);
  assert.equal(totals.remaining, 900);
});

test('valor real conciliado no banco reinicia a cadeia e não desconta crédito duas vezes', () => {
  const july = statement('2026-07', 500, [{ id: 'p1', amount: 1000 }], { bankAmount: 500 });
  const august = statement('2026-08', 900, [], { bankAmount: 400 });

  const opening = cards.getCardOpeningBalance(card, '2026-08', [july, august]);
  const totals = cards.getEffectiveStatementTotals(august, opening);

  assert.equal(opening, -500);
  assert.equal(totals.openingApplied, 0);
  assert.equal(totals.remaining, 400);
  assert.equal(totals.credit, 0);
});

test('registro duplicado do mesmo mês usa a versão mais recente', () => {
  const oldJuly = statement('2026-07', 0, [{ id: 'p1', amount: 3000 }], {
    id: 'old',
    bankAmount: 0,
    updatedAt: '2026-07-01T00:00:00.000Z',
  });
  const currentJuly = statement('2026-07', 1600, [{ id: 'p1', amount: 2000 }], {
    id: 'current',
    bankAmount: 1600,
    updatedAt: '2026-07-02T00:00:00.000Z',
  });

  assert.equal(cards.getCardOpeningBalance(card, '2026-08', [oldJuly, currentJuly]), -400);
});

test('registro antigo sem calculatedAmount ou bankAmount não cria crédito artificial', () => {
  const legacy = {
    id: 'legacy',
    cardId: card.id,
    dueDate: '2026-07-06',
    statementBalance: 1600,
    payments: [{ id: 'p1', amount: 3000 }],
    updatedAt: '2026-07-03T00:00:00.000Z',
  };

  assert.equal(cards.getCardOpeningBalance(card, '2026-08', [legacy]), 0);
});

test('histórico incompleto não transforma excesso de pagamentos em crédito', () => {
  const current = statement('2026-08', 3789.53, [
    { id: 'p1', amount: 1774 },
    { id: 'p2', amount: 1347 },
    { id: 'p3', amount: 1000 },
  ]);
  const totals = cards.getEffectiveStatementTotals(current, -3195.34);

  assert.equal(totals.amount, 3789.53);
  assert.equal(totals.paid, 4121);
  assert.equal(totals.carriedCredit, 3195.34);
  assert.equal(totals.ownCredit, 0);
  assert.equal(totals.credit, 0);
  assert.equal(totals.unverifiedExcess, 3526.81);
  assert.equal(totals.remaining, 0);
});

test('pagamento maior que Notas sem valor oficial não cria crédito no mês seguinte', () => {
  const july = statement('2026-07', 500, [{ id: 'p1', amount: 1000 }]);
  const totals = cards.getEffectiveStatementTotals(july);

  assert.equal(totals.rawEndingBalance, -500);
  assert.equal(totals.endingBalance, 0);
  assert.equal(totals.credit, 0);
  assert.equal(totals.unverifiedExcess, 500);
  assert.equal(cards.getCardOpeningBalance(card, '2026-08', [july]), 0);
});

test('pagamento maior que valor oficial confirmado cria crédito real', () => {
  const july = statement('2026-07', 500, [{ id: 'p1', amount: 1000 }], { bankAmount: 500 });
  const totals = cards.getEffectiveStatementTotals(july);

  assert.equal(totals.endingBalance, -500);
  assert.equal(totals.credit, 500);
  assert.equal(totals.unverifiedExcess, 0);
  assert.equal(cards.getCardOpeningBalance(card, '2026-08', [july]), -500);
});

test('fatura vencida sem pagamento manual usa quitação automática sem gravar pagamento', () => {
  const july = statement('2026-07', 500);
  const totals = cards.getEffectiveStatementTotals(july, 0, { assumeFullPayment: true });

  assert.equal(totals.recordedPaid, 0);
  assert.equal(totals.assumedPaid, 500);
  assert.equal(totals.remaining, 0);
  assert.deepEqual(july.payments, []);
  assert.equal(cards.getCardOpeningBalance(card, '2026-08', [july], '2026-08-01'), 0);
});

test('pagamento manual substitui a quitação automática e preserva saldo parcial', () => {
  const july = statement('2026-07', 500, [{ id: 'manual', amount: 200, source: 'manual' }]);
  const totals = cards.getEffectiveStatementTotals(july, 0, { assumeFullPayment: true });

  assert.equal(totals.recordedPaid, 200);
  assert.equal(totals.assumedPaid, 0);
  assert.equal(totals.remaining, 300);
  assert.equal(cards.getCardOpeningBalance(card, '2026-08', [july], '2026-08-01'), 300);
});

test('fatura atual só recebe quitação automática depois do vencimento', () => {
  const july = statement('2026-07', 500);
  const beforeDue = cards.getCardOverview(july, [], 5000, 0, '2026-07-05');
  const onDueDate = cards.getCardOverview(july, [], 5000, 0, '2026-07-06');

  assert.equal(beforeDue.closed.remaining, 500);
  assert.equal(beforeDue.closed.assumedPaid, 0);
  assert.equal(onDueDate.closed.remaining, 0);
  assert.equal(onDueDate.closed.assumedPaid, 500);
});
