// seed-dev.js
(function () {
  window.seedFinanceDemo = function () {
    const monthApril = '2026-04';
    const monthMarch = '2026-03';
    const pastMonths = ['2025-11', '2025-12', '2026-01', '2026-02'];

    if (typeof monthInput === 'undefined') {
      console.error('seedFinanceDemo: app.js ainda não foi carregado.');
      return;
    }

    monthInput.value = monthApril;

    plannedItems.length = 0;
    receipts.length = 0;
    incomes.length = 0;
    nextId = 1;

    // ===== GERADOR DE MESES ANTERIORES (NOV 2025 a FEV 2026) =====
    pastMonths.forEach((m) => {
      incomes.push({ month: m, luana: 3800, gabriel: 3300 });

      // Orçamento base
      plannedItems.push(
        { id: getNextId(), month: m, category: 'Contas', description: 'HIPOTECA', amount: 1850.0, owner: 'Ambos', fixed: true },
        { id: getNextId(), month: m, category: 'Contas', description: 'LUZ', amount: 120.0, owner: 'Ambos', fixed: true },
        { id: getNextId(), month: m, category: 'Contas', description: 'VIDEOTRON', amount: 90.0, owner: 'Gabriel', fixed: true },
        { id: getNextId(), month: m, category: 'Supermercado', description: 'IGA', amount: 500.0, owner: 'Luana', fixed: false },
        { id: getNextId(), month: m, category: 'Supermercado', description: 'MAXI', amount: 300.0, owner: 'Ambos', fixed: false },
        { id: getNextId(), month: m, category: 'Transporte', description: 'STM', amount: 97.0, owner: 'Luana', fixed: true },
        { id: getNextId(), month: m, category: 'Cuidados pessoais', description: 'ACADEMIA', amount: 45.0, owner: 'Gabriel', fixed: true },
      );

      let extraExpense = 0;
      let extraCategory = 'Lojas';
      let extraMerchant = 'AMAZON';

      // Variações para quebrar o padrão no gráfico
      if (m === '2025-12') {
        extraExpense = 1200;
        extraMerchant = 'COMPRAS DE NATAL';
      }
      if (m === '2026-01') {
        extraExpense = 80;
        extraCategory = 'Lojas';
        extraMerchant = 'BATERIA HEADSET';
      }

      // Notas Fiscais
      receipts.push(
        { id: getNextId(), date: m + '-01', category: 'Contas', merchant: 'HIPOTECA', amount: 1850.0, owner: 'Ambos', fixed: true },
        { id: getNextId(), date: m + '-05', category: 'Contas', merchant: 'VIDEOTRON', amount: 90.0, owner: 'Gabriel', fixed: true },
        { id: getNextId(), date: m + '-10', category: 'Contas', merchant: 'LUZ', amount: 125.0, owner: 'Ambos', fixed: true },
        { id: getNextId(), date: m + '-12', category: 'Supermercado', merchant: 'IGA', amount: 490.0, owner: 'Luana', fixed: false },
        { id: getNextId(), date: m + '-18', category: 'Supermercado', merchant: 'MAXI', amount: 280.0, owner: 'Ambos', fixed: false },
        { id: getNextId(), date: m + '-02', category: 'Transporte', merchant: 'STM', amount: 97.0, owner: 'Luana', fixed: true },
        { id: getNextId(), date: m + '-05', category: 'Cuidados pessoais', merchant: 'ACADEMIA', amount: 45.0, owner: 'Gabriel', fixed: true },
        { id: getNextId(), date: m + '-20', category: extraCategory, merchant: extraMerchant, amount: 150.0 + extraExpense, owner: 'Ambos', fixed: false },
      );
    });

    // ===== RENDAS DE MARÇO E ABRIL =====
    incomes.push(
      { month: monthMarch, luana: 3800, gabriel: 3300 }, // Total: CAD 7.100
      { month: monthApril, luana: 4000, gabriel: 3500 }, // Total: CAD 7.500
    );

    // ==========================================
    // ===== MARÇO 2026 (CENÁRIO: FALTANDO GRANA / VETERINÁRIO) =====
    // ==========================================
    plannedItems.push(
      { id: getNextId(), month: monthMarch, category: 'Contas', description: 'HIPOTECA', amount: 1850.0, owner: 'Ambos', fixed: true },
      { id: getNextId(), month: monthMarch, category: 'Contas', description: 'LUZ', amount: 120.0, owner: 'Ambos', fixed: true },
      { id: getNextId(), month: monthMarch, category: 'Contas', description: 'VIDEOTRON', amount: 90.0, owner: 'Gabriel', fixed: true },
      { id: getNextId(), month: monthMarch, category: 'Supermercado', description: 'IGA', amount: 500.0, owner: 'Luana', fixed: false },
      { id: getNextId(), month: monthMarch, category: 'Supermercado', description: 'MAXI', amount: 300.0, owner: 'Ambos', fixed: false },
      { id: getNextId(), month: monthMarch, category: 'Transporte', description: 'STM', amount: 97.0, owner: 'Luana', fixed: true },
      { id: getNextId(), month: monthMarch, category: 'Cuidados pessoais', description: 'ACADEMIA', amount: 45.0, owner: 'Gabriel', fixed: true },
    );

    receipts.push(
      { id: getNextId(), date: monthMarch + '-01', category: 'Contas', merchant: 'HIPOTECA', amount: 1850.0, owner: 'Ambos', fixed: true },
      { id: getNextId(), date: monthMarch + '-05', category: 'Contas', merchant: 'VIDEOTRON', amount: 90.0, owner: 'Gabriel', fixed: true },
      { id: getNextId(), date: monthMarch + '-10', category: 'Contas', merchant: 'LUZ', amount: 145.0, owner: 'Ambos', fixed: true },
      { id: getNextId(), date: monthMarch + '-12', category: 'Supermercado', merchant: 'IGA', amount: 620.0, owner: 'Luana', fixed: false },
      { id: getNextId(), date: monthMarch + '-18', category: 'Supermercado', merchant: 'MAXI', amount: 380.0, owner: 'Ambos', fixed: false },
      { id: getNextId(), date: monthMarch + '-02', category: 'Transporte', merchant: 'STM', amount: 97.0, owner: 'Luana', fixed: true },
      { id: getNextId(), date: monthMarch + '-05', category: 'Cuidados pessoais', merchant: 'ACADEMIA', amount: 45.0, owner: 'Gabriel', fixed: true },
      { id: getNextId(), date: monthMarch + '-22', category: 'Cuidados pessoais', merchant: 'VETERINÁRIO (PETRUCHIO)', amount: 4250.0, owner: 'Ambos', fixed: false },
    );

    // ==========================================
    // ===== ABRIL 2026 (CENÁRIO: SOBRANDO DINHEIRO) =====
    // ==========================================
    plannedItems.push(
      { id: getNextId(), month: monthApril, category: 'Contas', description: 'HIPOTECA', amount: 1850.0, owner: 'Ambos', fixed: true },
      { id: getNextId(), month: monthApril, category: 'Contas', description: 'LUZ', amount: 120.0, owner: 'Ambos', fixed: true },
      { id: getNextId(), month: monthApril, category: 'Contas', description: 'VIDEOTRON', amount: 90.0, owner: 'Gabriel', fixed: true },
      { id: getNextId(), month: monthApril, category: 'Supermercado', description: 'IGA', amount: 500.0, owner: 'Luana', fixed: false },
      { id: getNextId(), month: monthApril, category: 'Supermercado', description: 'MAXI', amount: 300.0, owner: 'Ambos', fixed: false },
      { id: getNextId(), month: monthApril, category: 'Transporte', description: 'STM', amount: 97.0, owner: 'Luana', fixed: true },
      { id: getNextId(), month: monthApril, category: 'Combustível', description: 'COSTCO GASOLINA', amount: 150.0, owner: 'Gabriel', fixed: false },
      { id: getNextId(), month: monthApril, category: 'Jantar fora', description: 'LA CAGE', amount: 100.0, owner: 'Ambos', fixed: false },
      { id: getNextId(), month: monthApril, category: 'Assinaturas', description: 'NETFLIX', amount: 22.99, owner: 'Gabriel', fixed: true },
      { id: getNextId(), month: monthApril, category: 'Cuidados pessoais', description: 'ACADEMIA', amount: 45.0, owner: 'Gabriel', fixed: true },
      { id: getNextId(), month: monthApril, category: 'Lojas', description: 'AMAZON', amount: 100.0, owner: 'Ambos', fixed: false },
    );

    receipts.push(
      { id: getNextId(), date: monthApril + '-01', category: 'Contas', merchant: 'HIPOTECA', amount: 1850.0, owner: 'Ambos', fixed: true },
      { id: getNextId(), date: monthApril + '-05', category: 'Contas', merchant: 'VIDEOTRON', amount: 90.0, owner: 'Gabriel', fixed: true },
      { id: getNextId(), date: monthApril + '-10', category: 'Contas', merchant: 'LUZ', amount: 135.5, owner: 'Ambos', fixed: true },
      { id: getNextId(), date: monthApril + '-04', category: 'Supermercado', merchant: 'IGA', amount: 210.3, owner: 'Luana', fixed: false },
      { id: getNextId(), date: monthApril + '-12', category: 'Supermercado', merchant: 'MAXI', amount: 145.8, owner: 'Ambos', fixed: false },
      { id: getNextId(), date: monthApril + '-18', category: 'Supermercado', merchant: 'IGA', amount: 180.2, owner: 'Luana', fixed: false },
      { id: getNextId(), date: monthApril + '-02', category: 'Transporte', merchant: 'STM', amount: 97.0, owner: 'Luana', fixed: true },
      { id: getNextId(), date: monthApril + '-08', category: 'Transporte', merchant: 'UBER', amount: 35.0, owner: 'Gabriel', fixed: false },
      { id: getNextId(), date: monthApril + '-15', category: 'Combustível', merchant: 'COSTCO GASOLINA', amount: 65.0, owner: 'Gabriel', fixed: false },
      { id: getNextId(), date: monthApril + '-20', category: 'Jantar fora', merchant: 'LA CAGE', amount: 125.4, owner: 'Ambos', fixed: false },
      { id: getNextId(), date: monthApril + '-22', category: 'Jantar fora', merchant: 'TIM HORTONS', amount: 14.5, owner: 'Gabriel', fixed: false },
      { id: getNextId(), date: monthApril + '-11', category: 'Assinaturas', merchant: 'NETFLIX', amount: 22.99, owner: 'Gabriel', fixed: true },
      { id: getNextId(), date: monthApril + '-05', category: 'Cuidados pessoais', merchant: 'ACADEMIA', amount: 45.0, owner: 'Gabriel', fixed: true },
      { id: getNextId(), date: monthApril + '-14', category: 'Lojas', merchant: 'AMAZON', amount: 142.0, owner: 'Ambos', fixed: false },
    );

    refreshAll();
    console.log('seedFinanceDemo: dados de 6 meses carregados.');
  };
})();
