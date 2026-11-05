const test = require('node:test');
const assert = require('node:assert/strict');
const FreeProjection = require('../docs/free-projection.js');

const fixed = (overrides = {}) => ({
  id: 'fixed-1',
  month: '2026-11',
  date: '2026-11-10',
  description: 'Internet',
  category: 'Contas',
  amount: 100,
  fixed: true,
  isStatic: false,
  ...overrides,
});

const receipt = (overrides = {}) => ({
  id: 'receipt-1',
  date: '2026-11-10',
  merchant: 'Internet',
  category: 'Contas',
  amount: 100,
  linkedPlannedId: 'fixed-1',
  ...overrides,
});

test('fixo pago pelo vínculo é conciliado mesmo quando a categoria da Nota é diferente', () => {
  const pending = FreeProjection.reconcilePendingFixedExpenses({
    month: '2026-11',
    currentMonth: '2026-11',
    plannedItems: [fixed()],
    receipts: [receipt({ category: 'Assinaturas' })],
  });

  assert.deepEqual(pending, []);
});

test('despesa diferente da mesma categoria não quita um fixo', () => {
  const pending = FreeProjection.reconcilePendingFixedExpenses({
    month: '2026-11',
    currentMonth: '2026-11',
    plannedItems: [fixed()],
    receipts: [receipt({ linkedPlannedId: '', merchant: 'Energia' })],
  });

  assert.equal(pending.length, 1);
  assert.equal(pending[0].actualAmount, 0);
  assert.equal(pending[0].remainingAmount, 100);
});

test('lançamento legado sem vínculo pode quitar pelo mesmo nome, responsável e valor, não pela categoria', () => {
  const pending = FreeProjection.reconcilePendingFixedExpenses({
    month: '2026-11',
    currentMonth: '2026-11',
    plannedItems: [fixed({ owner: 'Gabriel' })],
    receipts: [receipt({ linkedPlannedId: '', category: 'Assinaturas', owner: 'Gabriel' })],
  });

  assert.deepEqual(pending, []);
});

test('pagamento parcial reduz somente o fixo explicitamente vinculado', () => {
  const pending = FreeProjection.reconcilePendingFixedExpenses({
    month: '2026-11',
    currentMonth: '2026-11',
    plannedItems: [fixed()],
    receipts: [receipt({ amount: 35 })],
  });

  assert.equal(pending[0].actualAmount, 35);
  assert.equal(pending[0].remainingAmount, 65);
});

test('uma mesma Nota Real não pode quitar dois itens previstos', () => {
  const pending = FreeProjection.reconcilePendingFixedExpenses({
    month: '2026-11',
    currentMonth: '2026-11',
    plannedItems: [fixed(), fixed({ description: 'Duplicado legado', amount: 80 })],
    receipts: [receipt()],
  });

  assert.equal(pending.length, 1);
  assert.equal(pending[0].description, 'Duplicado legado');
  assert.equal(pending[0].actualAmount, 0);
  assert.equal(pending[0].remainingAmount, 80);
});

test('compra no cartão entra uma vez no Livre e a fatura fica separada', () => {
  const projection = FreeProjection.calculateProjection({
    baseIncome: 5000,
    actualExpenses: 1000,
    pendingFixedItems: [],
    pendingCardInvoices: [{ payment: { remaining: 1000 } }],
  });

  assert.equal(projection.freeReal, 4000);
  assert.equal(projection.afterPendingFixed, 4000);
  assert.equal(projection.pendingCardsTotal, 1000);
});

test('fatura transportada de mês anterior permanece obrigação separada', () => {
  const projection = FreeProjection.calculateProjection({
    baseIncome: 5000,
    actualExpenses: 500,
    pendingFixedItems: [{ remainingAmount: 200 }],
    pendingCardInvoices: [{ sourceMonth: '2026-10', payment: { remaining: 750 } }],
  });

  assert.equal(projection.freeReal, 4500);
  assert.equal(projection.afterPendingFixed, 4300);
  assert.equal(projection.pendingCardsTotal, 750);
});

test('renda do mês é priorizada e mês sem cadastro herda a última renda anterior', () => {
  const incomes = [
    { month: '2026-09', gabriel: 1000, luana: 2000 },
    { month: '2026-11', gabriel: 1500, luana: 2500 },
  ];

  const exact = FreeProjection.resolveIncomeForMonth(incomes, '2026-11', { historyLoaded: true });
  const inherited = FreeProjection.resolveIncomeForMonth(incomes, '2026-10', { historyLoaded: true });
  assert.equal(exact.status, 'exact');
  assert.equal(exact.sourceMonth, '2026-11');
  assert.equal(inherited.status, 'previous');
  assert.equal(inherited.sourceMonth, '2026-09');
});

test('ausência de renda não é convertida silenciosamente em renda zero', () => {
  const loading = FreeProjection.resolveIncomeForMonth([], '2026-11', { historyLoaded: false });
  const missing = FreeProjection.resolveIncomeForMonth([], '2026-11', { historyLoaded: true });
  const projection = FreeProjection.calculateProjection({ baseIncome: null, actualExpenses: 6000 });

  assert.equal(loading.status, 'loading');
  assert.equal(missing.status, 'missing');
  assert.equal(projection.incomeAvailable, false);
  assert.equal(projection.freeReal, null);
  assert.equal(projection.afterPendingFixed, null);
});
