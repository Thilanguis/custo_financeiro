// seed-dev.js
(function () {
  // Função global para popular o sistema com dados de exemplo
  window.seedFinanceDemo = function () {
    const month = '2025-11'; // mês que vai ser usado nos dados

    if (typeof monthInput === 'undefined') {
      console.error('seedFinanceDemo: app.js ainda não foi carregado.');
      return;
    }

    // coloca o mês no input
    monthInput.value = month;

    // zera os arrays e o contador de IDs
    plannedItems.length = 0;
    receipts.length = 0;
    incomes.length = 0;
    nextId = 1;

    // ===== RENDAS =====
    incomes.push({ month, owner: 'Luana', amount: 4000 }, { month, owner: 'Gabriel', amount: 2500 });

    // ===== CUSTOS PREVISTOS =====
    plannedItems.push(
      {
        id: getNextId(),
        month,
        category: 'Moradia',
        description: 'Hipoteca',
        amount: 1852.76,
        owner: 'Ambos',
        fixed: true,
      },
      {
        id: getNextId(),
        month,
        category: 'Moradia',
        description: 'Luz',
        amount: 124.38,
        owner: 'Ambos',
        fixed: true,
      },
      {
        id: getNextId(),
        month,
        category: 'Contas',
        description: 'Internet',
        amount: 90,
        owner: 'Gabriel',
        fixed: true,
      },
      {
        id: getNextId(),
        month,
        category: 'Supermercado',
        description: 'IGA',
        amount: 800,
        owner: 'Luana',
        fixed: true,
      }
    );

    // ===== NOTAS FISCAIS (REAIS) =====
    receipts.push(
      {
        id: getNextId(),
        date: month + '-01',
        category: 'Contas',
        merchant: 'HIPOTECA',
        amount: 1852.76,
        owner: 'Ambos',
        fixed: true,
      },
      {
        id: getNextId(),
        date: month + '-02',
        category: 'Contas',
        merchant: 'LUZ',
        amount: 130,
        owner: 'Ambos',
        fixed: true,
      },
      {
        id: getNextId(),
        date: month + '-05',
        category: 'Supermercado',
        merchant: 'IGA',
        amount: 620.5,
        owner: 'Luana',
        fixed: false,
      }
    );

    // atualiza todas as telas
    refreshAll();

    console.log('seedFinanceDemo: dados de exemplo carregados para ' + month);
  };
})();
