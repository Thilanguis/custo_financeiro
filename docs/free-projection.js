(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FreeProjection = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

  function hasIncomeData(income) {
    return Boolean(income && (income.luana !== undefined || income.gabriel !== undefined));
  }

  function resolveIncomeForMonth(incomes, month, options = {}) {
    const records = Array.isArray(incomes) ? incomes : [];
    const exact = records.find((income) => income.month === month && hasIncomeData(income));
    if (exact) return { available: true, status: 'exact', sourceMonth: month, record: exact };

    const previous = records
      .filter((income) => income.month < month && hasIncomeData(income))
      .sort((a, b) => b.month.localeCompare(a.month))[0];
    if (previous) return { available: true, status: 'previous', sourceMonth: previous.month, record: previous };

    return {
      available: false,
      status: options.historyFailed ? 'error' : options.historyLoaded ? 'missing' : 'loading',
      sourceMonth: null,
      record: null,
    };
  }

  function reconcilePendingFixedExpenses({ month, currentMonth, plannedItems, receipts }) {
    if (!month || (currentMonth && month < currentMonth)) return [];

    const plans = (Array.isArray(plannedItems) ? plannedItems : []).filter(
      (item) => item.month === month && item.fixed && !item.isStatic && Number(item.amount) > 0,
    );
    const realItems = (Array.isArray(receipts) ? receipts : [])
      .map((receipt, index) => ({ receipt, index, key: receipt.id !== undefined && receipt.id !== null ? `id:${receipt.id}` : `index:${index}` }))
      .filter(({ receipt }) => typeof receipt.date === 'string' && receipt.date.startsWith(month) && Number(receipt.amount) > 0 && !receipt.isReimbursement && !receipt.isStatic);
    const usedReceipts = new Set();
    const normalizeName = (value) =>
      String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9]+/gi, ' ')
        .trim()
        .toUpperCase();
    const reconciled = plans.map((item) => ({
      id: item.id,
      category: item.category || 'Sem categoria',
      description: item.description || item.merchant || item.category || 'Fixo sem nome',
      owner: item.owner || '',
      amount: roundMoney(item.amount),
      actualAmount: 0,
      remainingAmount: roundMoney(item.amount),
      date: typeof item.date === 'string' && item.date.startsWith(month) ? item.date : '',
      matchedReceiptIds: [],
    }));

    const consume = (item, candidate) => {
      usedReceipts.add(candidate.key);
      item.actualAmount = roundMoney(item.actualAmount + (Number(candidate.receipt.amount) || 0));
      item.remainingAmount = roundMoney(Math.max(item.amount - item.actualAmount, 0));
      item.matchedReceiptIds.push(candidate.receipt.id ?? candidate.index);
    };

    // Primeiro, honra exclusivamente o vínculo persistido. Assim, uma Nota ligada
    // a um item posterior nunca pode ser consumida pelo fallback de outro fixo.
    reconciled.forEach((item) => {
      const plannedId = String(item.id || '');
      if (!plannedId) return;
      realItems.forEach((candidate) => {
        if (!usedReceipts.has(candidate.key) && String(candidate.receipt.linkedPlannedId || '') === plannedId) consume(item, candidate);
      });
    });

    // Compatibilidade segura para lançamentos antigos sem linkedPlannedId: exige
    // nome e responsável equivalentes. Categoria, isoladamente, nunca quita fixo.
    reconciled.forEach((item) => {
      if (item.remainingAmount <= 0.005) return;
      const plannedName = normalizeName(item.description);
      const candidate = realItems.find(({ receipt, key }) => {
        if (usedReceipts.has(key) || receipt.linkedPlannedId) return false;
        if (!plannedName || normalizeName(receipt.merchant) !== plannedName) return false;
        if (item.owner && receipt.owner && item.owner !== receipt.owner) return false;
        return Math.abs((Number(receipt.amount) || 0) - item.remainingAmount) <= 0.005;
      });
      if (candidate) consume(item, candidate);
    });

    return reconciled.filter((item) => item.remainingAmount > 0.005);
  }

  function calculateProjection({ baseIncome, extraIncome = 0, actualExpenses = 0, reimbursements = 0, pendingFixedItems = [], pendingCardInvoices = [] }) {
    const incomeAvailable = Number.isFinite(baseIncome);
    const pendingFixedTotal = roundMoney(
      (Array.isArray(pendingFixedItems) ? pendingFixedItems : []).reduce((total, item) => total + Math.max(Number(item.remainingAmount) || 0, 0), 0),
    );
    const pendingCardsTotal = roundMoney(
      (Array.isArray(pendingCardInvoices) ? pendingCardInvoices : []).reduce(
        (total, invoice) => total + Math.max(Number(invoice.payment?.remaining ?? invoice.remaining) || 0, 0),
        0,
      ),
    );
    const normalizedExtraIncome = roundMoney(extraIncome);
    const normalizedExpenses = roundMoney(actualExpenses);
    const normalizedReimbursements = roundMoney(reimbursements);
    const netActualExpense = roundMoney(normalizedExpenses - normalizedReimbursements);

    if (!incomeAvailable) {
      return {
        incomeAvailable: false,
        baseIncome: null,
        extraIncome: normalizedExtraIncome,
        totalIncomeReal: null,
        actualExpenses: normalizedExpenses,
        reimbursements: normalizedReimbursements,
        netActualExpense,
        freeReal: null,
        pendingFixedTotal,
        afterPendingFixed: null,
        pendingCardsTotal,
      };
    }

    const normalizedBaseIncome = roundMoney(baseIncome);
    const totalIncomeReal = roundMoney(normalizedBaseIncome + normalizedExtraIncome);
    const freeReal = roundMoney(totalIncomeReal - netActualExpense);
    return {
      incomeAvailable: true,
      baseIncome: normalizedBaseIncome,
      extraIncome: normalizedExtraIncome,
      totalIncomeReal,
      actualExpenses: normalizedExpenses,
      reimbursements: normalizedReimbursements,
      netActualExpense,
      freeReal,
      pendingFixedTotal,
      afterPendingFixed: roundMoney(freeReal - pendingFixedTotal),
      // Faturas são obrigações de caixa. As compras que as formam já estão em
      // actualExpenses, então este total é informativo e nunca é subtraído de novo.
      pendingCardsTotal,
    };
  }

  return {
    resolveIncomeForMonth,
    reconcilePendingFixedExpenses,
    calculateProjection,
  };
});
