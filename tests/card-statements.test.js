const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cards = require('../docs/card-statements.js');

const card = { id: 'visa', closing: 15, due: 6, monthlyLimit: 2000 };
const entry = (date, amount = 100, extra = {}) => ({ id: `${date}-${amount}`, date, amount, paymentMethodId: card.id, ...extra });
const makeClosed = (entries = [entry('2026-08-10')]) => cards.createStatement(card, '2026-09', entries, null, '2026-08-16T00:00:00.000Z');

test('1. compra antes do fechamento entra na fatura correta', () => assert.equal(cards.getEntryDueMonth(entry('2026-08-14'), card), '2026-09'));
test('2. compra depois do fechamento entra na próxima fatura', () => assert.equal(cards.getEntryDueMonth(entry('2026-08-18'), card), '2026-10'));
test('3. postedDate posterior ao fechamento decide a próxima fatura', () => assert.equal(cards.getEntryDueMonth(entry('2026-08-14', 100, { postedDate: '2026-08-18' }), card), '2026-10'));
test('4. ciclo manual prevalece e permanece serializável', () => {
  const moved = entry('2026-08-10', 100, { cardStatementDueMonth: '2026-10' });
  assert.equal(cards.getEntryDueMonth(moved, card), '2026-10');
  assert.equal(cards.getEntryDueMonth(JSON.parse(JSON.stringify(moved)), card), '2026-10');
});
test('5. compra afeta o Livre uma única vez', () => assert.equal(cards.calculateFreeImpact([entry('2026-08-10', 125.55)]), 125.55));
test('6. pagamento não participa do cálculo do Livre', () => {
  const noteImpact = cards.calculateFreeImpact([entry('2026-08-10', 125.55)]);
  const statement = makeClosed();
  statement.payments = [{ id: 'p1', amount: 100 }];
  assert.equal(noteImpact, 125.55);
});
test('7. vários pagamentos parciais reduzem o restante', () => {
  const statement = makeClosed([entry('2026-08-10', 300)]);
  statement.payments = [{ id: 'p1', amount: 75 }, { id: 'p2', amount: 100 }];
  assert.deepEqual(cards.getStatementTotals(statement), { calculated: 300, bankAmount: null, difference: null, adjustments: 0, amount: 300, paid: 175, remaining: 125, credit: 0 });
});
test('8. excluir pagamento recalcula o restante', () => {
  const statement = makeClosed([entry('2026-08-10', 300)]);
  statement.payments = cards.removeById([{ id: 'p1', amount: 75 }, { id: 'p2', amount: 100 }], 'p2');
  assert.equal(cards.getStatementTotals(statement).remaining, 225);
});
test('9. reembolso diminui a fatura correta', () => assert.equal(cards.sumEntries([entry('2026-08-10', 300), entry('2026-08-11', -80, { isReimbursement: true })]), 220));
test('10. ajuste positivo aumenta a fatura', () => {
  const statement = makeClosed(); statement.adjustments = [{ id: 'a1', amount: 2.5 }]; assert.equal(cards.getStatementTotals(statement).amount, 102.5);
});
test('11. ajuste negativo diminui a fatura', () => {
  const statement = makeClosed(); statement.adjustments = [{ id: 'a1', amount: -2.5 }]; assert.equal(cards.getStatementTotals(statement).amount, 97.5);
});
test('12. fatura fechada mantém o valor salvo após serialização', () => {
  const saved = makeClosed(); const restored = cards.cloneForBackup([saved])[0]; assert.equal(restored.calculatedAmount, 100); assert.equal(restored.cycleEndDate, '2026-08-17');
});
test('13. vencimento não marca pagamento automaticamente', () => {
  const statement = makeClosed(); statement.dueDate = '2020-01-01'; assert.equal(cards.getStatus(statement), 'closed'); assert.equal(cards.getStatementTotals(statement).paid, 0);
});
test('14. limite disponível considera fatura fechada e aberta', () => {
  const statement = makeClosed([entry('2026-08-10', 300)]); statement.payments = [{ id: 'p1', amount: 100 }];
  const overview = cards.getCardOverview(statement, [entry('2026-08-20', 250)], 1000);
  assert.equal(overview.currentBalance, 450); assert.equal(overview.availableLimit, 550);
});
test('15. pagamento antigo é migrado sem duplicar', () => {
  const statement = makeClosed(); const legacy = cards.normalizeLegacyPayment(card.id, statement, { date: '2026-09-05', amount: 100 });
  const once = cards.addOrReplaceById([], legacy); const twice = cards.addOrReplaceById(once, legacy);
  assert.equal(twice.length, 1); assert.equal(twice[0].statementId, statement.id);
});
test('16. backup preserva faturas, pagamentos e ajustes', () => {
  const statement = makeClosed(); statement.payments = [{ id: 'p1', amount: 50 }]; statement.adjustments = [{ id: 'a1', amount: -1 }];
  const backup = cards.cloneForBackup([statement]);
  assert.deepEqual(backup[0].payments, statement.payments); assert.deepEqual(backup[0].adjustments, statement.adjustments);
  const firebaseApi = fs.readFileSync(path.join(__dirname, '../docs/firebase-api.js'), 'utf8');
  assert.match(firebaseApi, /faturas_cartoes/); assert.match(firebaseApi, /backupData\.cardStatements/);
});
test('17. conciliação usa o valor real sem alterar o valor calculado pelas Notas', () => {
  const statement = makeClosed([entry('2026-08-10', 438.59)]);
  statement.bankAmount = 424.10;
  statement.actualClosingDate = '2026-08-16';
  statement.actualDueDate = '2026-09-07';
  const totals = cards.getStatementTotals(statement);
  assert.equal(totals.calculated, 438.59);
  assert.equal(totals.bankAmount, 424.10);
  assert.equal(totals.difference, 14.49);
  assert.equal(totals.amount, 424.10);
  assert.equal(cards.calculateFreeImpact([entry('2026-08-10', 438.59)]), 438.59);
});

test('18. compra no dia do fechamento sem data de processamento fica na próxima fatura', () => {
  assert.equal(cards.getEntryDueMonth(entry('2026-08-17'), card), '2026-10');
});

test('19. data de processamento no fechamento confirma a fatura que encerrou', () => {
  assert.equal(cards.getEntryDueMonth(entry('2026-08-14', 100, { postedDate: '2026-08-17' }), card), '2026-09');
});

test('20. fechamento no fim de semana passa ao próximo dia útil', () => {
  const weekendCard = { id: 'rbc-gabriel', closing: 27, due: 17, monthlyLimit: 3500 };
  assert.equal(cards.getOperationalClosingDate('2026-06', 27), '2026-06-29');
  assert.equal(cards.getEntryDueMonth({ date: '2026-06-28', amount: 11.49, paymentMethodId: weekendCard.id }, weekendCard), '2026-07');
});

test('21. cartão ainda não fechado mostra compras em aberto sem duplicar como fatura a pagar', () => {
  const rbcLuana = { id: 'rbc-luana', closing: 6, due: 27, monthlyLimit: 13000 };
  const notes = [
    { id: 'a', date: '2026-07-28', amount: 175, paymentMethodId: rbcLuana.id },
    { id: 'b', date: '2026-08-01', amount: 306.37, paymentMethodId: rbcLuana.id },
  ];
  const state = cards.getCardMonthState(rbcLuana, '2026-08', notes, [], '2026-08-02', rbcLuana.monthlyLimit);
  assert.equal(state.isClosed, false);
  assert.equal(state.closedTotals.amount, 0);
  assert.equal(state.overview.openAmount, 481.37);
  assert.equal(state.payableEntries.length, 0);
});

test('22. cartão com ciclo fechado separa fatura a pagar das compras seguintes', () => {
  const rbcGabriel = { id: 'rbc-gabriel', closing: 27, due: 17, monthlyLimit: 3500 };
  const notes = [
    { id: 'closed', date: '2026-07-20', amount: 100, paymentMethodId: rbcGabriel.id },
    { id: 'closing-day', date: '2026-07-27', amount: 195, paymentMethodId: rbcGabriel.id },
    { id: 'open', date: '2026-07-29', amount: 45, paymentMethodId: rbcGabriel.id },
  ];
  const state = cards.getCardMonthState(rbcGabriel, '2026-08', notes, [], '2026-08-02', rbcGabriel.monthlyLimit);
  assert.equal(state.isClosed, true);
  assert.equal(state.closedTotals.amount, 100);
  assert.equal(state.overview.openAmount, 240);
  assert.deepEqual(state.payableEntries.map((item) => item.id), ['closed']);
  assert.deepEqual(state.openEntries.map((item) => item.id), ['closing-day', 'open']);
});

test('23. fatura salva com cálculo antigo é atualizada pelas Notas sem perder conciliação', () => {
  const rbcGabriel = { id: 'rbc-gabriel', closing: 27, due: 17, monthlyLimit: 3500 };
  const stale = cards.createStatement(rbcGabriel, '2026-08', [], null, '2026-07-27T12:00:00.000Z');
  stale.bankAmount = 95;
  stale.payments = [{ id: 'payment', amount: 20 }];
  const notes = [{ id: 'note', date: '2026-07-20', amount: 100, paymentMethodId: rbcGabriel.id }];
  const state = cards.getCardMonthState(rbcGabriel, '2026-08', notes, [stale], '2026-08-02', rbcGabriel.monthlyLimit);
  assert.equal(state.payableStatement.calculatedAmount, 100);
  assert.equal(state.payableStatement.bankAmount, 95);
  assert.equal(state.closedTotals.remaining, 75);
});

test('24. interface mostra o restante como Fatura a pagar', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '../docs/app.js'), 'utf8');
  const payableRemainingMatches = appSource.match(/Fatura a pagar<\/small><b>\$\{formatCurrency\(overview\.closed\.remaining\)\}/g) || [];
  assert.equal(payableRemainingMatches.length, 1);
  assert.match(appSource, /Fatura fechada a pagar[\s\S]*?<b>\$\{formatCurrency\(overview\.closed\.remaining\)\}<\/b>/);
  assert.doesNotMatch(appSource, /Fatura a pagar<\/small><b>\$\{formatCurrency\(overview\.closed\.amount\)\}/);
});

test('25. compras em formação reduzem o disponível mesmo com crédito reservado', () => {
  const overview = cards.getCardOverview(null, [{ amount: 680.76 }], 13000, -1967.44);
  assert.equal(overview.currentBalance, 680.76);
  assert.equal(overview.creditBalance, 1967.44);
  assert.equal(overview.usedBalance, 680.76);
  assert.equal(overview.availableLimit, 12319.24);
});

test('26. interface mostra reembolso do cartão como entrada positiva', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '../docs/app.js'), 'utf8');
  assert.match(appSource, /const displayedAmount = isCredit \? `\+ \$\{formatCurrency\(Math\.abs\(Number\(receipt\.amount\) \|\| 0\)\)\}`/);
  assert.match(appSource, /<b>\$\{displayedAmount\}<\/b>/);
});

test('27. reembolso vinculado no cartão usa o mesmo estilo encadeado do Histórico', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '../docs/app.js'), 'utf8');
  const styleSource = fs.readFileSync(path.join(__dirname, '../docs/style.css'), 'utf8');
  assert.match(appSource, /orderSimpleCardEntries/);
  assert.match(appSource, /is-linked-reimbursement/);
  assert.match(appSource, /reimbursement-item-arrow/);
  assert.match(appSource, /reimbursement-item-label/);
  assert.match(styleSource, /\.simple-card-entry\.is-linked-reimbursement/);
  assert.match(styleSource, /border-left: 2px solid rgba\(121, 182, 255, 0\.48\)/);
});



test('28. interface mantém somente resumo e controle do limite mensal', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '../docs/app.js'), 'utf8');
  assert.doesNotMatch(appSource, /Saldo atual do cartão:/);
  assert.doesNotMatch(appSource, /Crédito reservado para a próxima fatura/);
  assert.doesNotMatch(appSource, /cardBalanceCopy|reservedCreditCopy/);
  assert.doesNotMatch(appSource, /Controle pessoal; não altera o Livre\./);
  assert.match(appSource, /Limite mensal de segurança: <b class="credit-card-control-value">/);
});
