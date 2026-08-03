(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CardStatements = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

  function shiftMonth(referenceMonth, offset) {
    const [year, month] = String(referenceMonth || '').split('-').map(Number);
    if (!year || !month) return referenceMonth || '';
    const shifted = new Date(year, month - 1 + offset, 1);
    return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
  }

  function clampDate(referenceMonth, day) {
    const [year, month] = String(referenceMonth || '').split('-').map(Number);
    if (!year || !month) return '';
    const lastDay = new Date(year, month, 0).getDate();
    return `${referenceMonth}-${String(Math.min(Math.max(Number(day) || 1, 1), lastDay)).padStart(2, '0')}`;
  }

  function moveWeekendToNextBusinessDay(dateISO) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateISO || ''))) return dateISO || '';
    const date = new Date(`${dateISO}T12:00:00`);
    if (date.getDay() === 6) date.setDate(date.getDate() + 2);
    else if (date.getDay() === 0) date.setDate(date.getDate() + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function getOperationalClosingDate(referenceMonth, day) {
    return moveWeekendToNextBusinessDay(clampDate(referenceMonth, day));
  }

  function getStatementDueMonth(statement) {
    const dueDate = String(statement?.actualDueDate || statement?.dueDate || '');
    return /^\d{4}-\d{2}/.test(dueDate) ? dueDate.slice(0, 7) : '';
  }

  function getEffectiveClosingDate(statement) {
    return String(statement?.actualClosingDate || statement?.closingDate || statement?.cycleEndDate || '');
  }

  function getDueMonthForDate(card, date, explicitDueMonth, includeClosingDate = true) {
    if (/^\d{4}-\d{2}$/.test(String(explicitDueMonth || ''))) return explicitDueMonth;
    const match = String(date || '').match(/^(\d{4}-\d{2})-(\d{2})$/);
    if (!match) return null;
    const purchaseMonth = match[1];
    const closingDay = Number(card?.closing);
    const dueDay = Number(card?.due);
    if (!closingDay || !dueDay) return purchaseMonth;
    const closingDate = getOperationalClosingDate(purchaseMonth, closingDay);
    const belongsToCurrentCycle = includeClosingDate ? date <= closingDate : date < closingDate;
    const closingMonth = belongsToCurrentCycle ? purchaseMonth : shiftMonth(purchaseMonth, 1);
    return dueDay > closingDay ? closingMonth : shiftMonth(closingMonth, 1);
  }

  function getEntryDueMonth(entry, card, statements = []) {
    if (/^\d{4}-\d{2}$/.test(String(entry?.cardStatementDueMonth || ''))) return entry.cardStatementDueMonth;

    const effectiveDate = String(entry?.postedDate || entry?.date || '');
    const hasPostedDate = Boolean(entry?.postedDate);
    const knownCycles = (statements || [])
      .filter((statement) => statement?.cardId === card?.id && getStatementDueMonth(statement) && getEffectiveClosingDate(statement))
      .map((statement) => ({ dueMonth: getStatementDueMonth(statement), closingDate: getEffectiveClosingDate(statement) }))
      .sort((a, b) => a.closingDate.localeCompare(b.closingDate));
    const knownCycle = knownCycles.find((cycle) => (hasPostedDate ? effectiveDate <= cycle.closingDate : effectiveDate < cycle.closingDate));
    if (knownCycle) return knownCycle.dueMonth;

    // Sem a data de processamento, uma compra feita exatamente no fechamento
    // fica na próxima fatura. É a opção conservadora: evita considerar como
    // fechada uma compra que o banco só processará no dia seguinte.
    return getDueMonthForDate(card, effectiveDate, null, hasPostedDate);
  }

  function getCycle(card, dueMonth) {
    const closingMonth = Number(card?.due) > Number(card?.closing) ? dueMonth : shiftMonth(dueMonth, -1);
    const closingDate = getOperationalClosingDate(closingMonth, card?.closing);
    const previousClosingDate = getOperationalClosingDate(shiftMonth(closingMonth, -1), card?.closing);
    const start = new Date(`${previousClosingDate}T12:00:00`);
    start.setDate(start.getDate() + 1);
    const cycleStartDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    return { cycleStartDate, cycleEndDate: closingDate, closingDate, dueDate: clampDate(dueMonth, card?.due) };
  }

  function statementId(cardId, dueMonth) {
    return `statement_${String(cardId || '').replace(/[^a-zA-Z0-9_-]/g, '_')}_${dueMonth}`;
  }

  function sumEntries(entries) {
    return roundMoney((entries || []).reduce((sum, entry) => sum + (Number(entry?.amount) || 0), 0));
  }

  function sumPayments(payments) {
    return roundMoney((payments || []).reduce((sum, payment) => sum + Math.max(0, Number(payment?.amount) || 0), 0));
  }

  function sumAdjustments(adjustments) {
    return roundMoney((adjustments || []).reduce((sum, adjustment) => sum + (Number(adjustment?.amount) || 0), 0));
  }

  function getStatementTotals(statement) {
    const calculated = roundMoney(statement?.calculatedAmount);
    const adjustments = sumAdjustments(statement?.adjustments);
    const hasBankAmount = statement?.bankAmount !== undefined && statement?.bankAmount !== null && statement?.bankAmount !== '';
    const bankAmount = hasBankAmount ? roundMoney(statement.bankAmount) : null;
    const amount = roundMoney((hasBankAmount ? bankAmount : calculated) + adjustments);
    const paid = sumPayments(statement?.payments);
    const payable = Math.max(0, amount);
    const remaining = roundMoney(Math.max(0, payable - paid));
    const credit = roundMoney(Math.max(0, paid - payable) + Math.max(0, -amount));
    const difference = hasBankAmount ? roundMoney(calculated - bankAmount) : null;
    return { calculated, bankAmount, difference, adjustments, amount, paid, remaining, credit };
  }

  function getStatus(statement) {
    const totals = getStatementTotals(statement);
    if (totals.amount <= 0 && totals.credit > 0) return 'credit';
    if (totals.remaining <= 0 && totals.amount > 0) return 'paid';
    if (totals.paid > 0) return 'partial';
    return statement?.status === 'open' ? 'open' : 'closed';
  }

  function createStatement(card, dueMonth, entries, existing, nowISO) {
    const cycle = getCycle(card, dueMonth);
    const base = existing || {};
    const statement = {
      id: base.id || statementId(card?.id, dueMonth), cardId: card?.id, ...cycle,
      calculatedAmount: base.calculatedAmount === undefined ? sumEntries(entries) : roundMoney(base.calculatedAmount),
      status: base.status || 'closed', payments: Array.isArray(base.payments) ? base.payments : [],
      adjustments: Array.isArray(base.adjustments) ? base.adjustments : [], createdAt: base.createdAt || nowISO, updatedAt: nowISO,
    };
    if (base.bankAmount !== undefined && base.bankAmount !== null && base.bankAmount !== '') statement.bankAmount = roundMoney(base.bankAmount);
    if (base.actualClosingDate) statement.actualClosingDate = base.actualClosingDate;
    if (base.actualDueDate) statement.actualDueDate = base.actualDueDate;
    statement.status = getStatus(statement);
    return statement;
  }

  function refreshStatementCalculation(card, dueMonth, entries, existing, nowISO) {
    const statement = createStatement(card, dueMonth, entries, existing, nowISO);
    statement.calculatedAmount = sumEntries(entries);
    statement.status = getStatus(statement);
    return statement;
  }

  function getCardMonthState(card, referenceMonth, entries, statements, todayISO, realLimit) {
    const exactStatement = (statements || []).find(
      (statement) => statement?.cardId === card?.id && getStatementDueMonth(statement) === referenceMonth,
    );
    const cycle = getCycle(card, referenceMonth);
    const effectiveClosingDate = getEffectiveClosingDate(exactStatement) || cycle.closingDate;
    const isClosed = Boolean(effectiveClosingDate && todayISO && effectiveClosingDate <= todayISO);
    const dueMonthForEntry = (entry) => getEntryDueMonth(entry, card, statements);
    const payableEntries = isClosed ? (entries || []).filter((entry) => entry?.paymentMethodId === card?.id && dueMonthForEntry(entry) === referenceMonth) : [];
    const openDueMonth = isClosed ? shiftMonth(referenceMonth, 1) : referenceMonth;
    const openEntries = (entries || []).filter((entry) => entry?.paymentMethodId === card?.id && dueMonthForEntry(entry) === openDueMonth);
    const payableStatement = isClosed
      ? refreshStatementCalculation(card, referenceMonth, payableEntries, exactStatement, new Date().toISOString())
      : null;
    const closedTotals = getStatementTotals(payableStatement || {});
    const overview = getCardOverview(payableStatement, openEntries, realLimit);

    return {
      cycle,
      effectiveClosingDate,
      isClosed,
      payableDueMonth: referenceMonth,
      openDueMonth,
      payableEntries,
      openEntries,
      payableStatement,
      storedStatement: exactStatement || null,
      closedTotals,
      overview,
    };
  }

  function addOrReplaceById(items, item) {
    const list = Array.isArray(items) ? [...items] : [];
    const index = list.findIndex((candidate) => candidate.id === item.id);
    if (index >= 0) list[index] = item; else list.push(item);
    return list;
  }

  const removeById = (items, id) => (items || []).filter((item) => item.id !== id);

  function getCardOverview(closedStatement, openEntries, realLimit) {
    const closed = getStatementTotals(closedStatement || {});
    const openAmount = sumEntries(openEntries);
    const currentBalance = roundMoney(closed.remaining + openAmount - closed.credit);
    return { closed, openAmount, currentBalance, availableLimit: roundMoney((Number(realLimit) || 0) - currentBalance) };
  }

  function normalizeLegacyPayment(cardId, statement, record) {
    if (!record || !(Number(record.amount) >= 0) || !record.date) return null;
    return { id: `legacy_${statement.id}`, cardId, statementId: statement.id, date: record.date, amount: roundMoney(record.amount), observation: 'Pagamento migrado do formato anterior' };
  }

  const cloneForBackup = (statements) => JSON.parse(JSON.stringify(Array.isArray(statements) ? statements : []));
  const calculateFreeImpact = (notes) => sumEntries(notes);

  return { roundMoney, shiftMonth, getDueMonthForDate, getEntryDueMonth, getCycle, getOperationalClosingDate, getStatementDueMonth, getEffectiveClosingDate, statementId, sumEntries, sumPayments, sumAdjustments, getStatementTotals, getStatus, createStatement, refreshStatementCalculation, getCardMonthState, addOrReplaceById, removeById, getCardOverview, normalizeLegacyPayment, cloneForBackup, calculateFreeImpact };
});
