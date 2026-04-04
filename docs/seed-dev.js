// seed-dev.js
(function () {
  window.seedFinanceDemo = function () {
    const month = '2026-04'; // Mês atualizado

    if (typeof monthInput === 'undefined') {
      console.error('seedFinanceDemo: app.js ainda não foi carregado.');
      return;
    }

    monthInput.value = month;

    plannedItems.length = 0;
    receipts.length = 0;
    incomes.length = 0;
    nextId = 1;

    // ===== RENDAS =====
    incomes.push({ month, owner: 'Luana', amount: 4000 }, { month, owner: 'Gabriel', amount: 3500 });

    // ===== CUSTOS PREVISTOS =====
    plannedItems.push(
      // Contas Fixas
      { id: getNextId(), month, category: 'Contas', description: 'HIPOTECA', amount: 1850.0, owner: 'Ambos', fixed: true },
      { id: getNextId(), month, category: 'Contas', description: 'LUZ', amount: 120.0, owner: 'Ambos', fixed: true },
      { id: getNextId(), month, category: 'Contas', description: 'VIDEOTRON', amount: 90.0, owner: 'Gabriel', fixed: true },

      // Supermercado
      { id: getNextId(), month, category: 'Supermercado', description: 'IGA', amount: 500.0, owner: 'Luana', fixed: false },
      { id: getNextId(), month, category: 'Supermercado', description: 'MAXI', amount: 300.0, owner: 'Ambos', fixed: false },

      // Transporte e Combustível
      { id: getNextId(), month, category: 'Transporte', description: 'STM', amount: 97.0, owner: 'Luana', fixed: true },
      { id: getNextId(), month, category: 'Combustível', description: 'COSTCO GASOLINA', amount: 150.0, owner: 'Gabriel', fixed: false },

      // Estilo de vida e Outros
      { id: getNextId(), month, category: 'Jantar fora', description: 'LA CAGE', amount: 100.0, owner: 'Ambos', fixed: false },
      { id: getNextId(), month, category: 'Assinaturas', description: 'NETFLIX', amount: 22.99, owner: 'Gabriel', fixed: true },
      { id: getNextId(), month, category: 'Cuidados pessoais', description: 'ACADEMIA', amount: 45.0, owner: 'Gabriel', fixed: true },
      { id: getNextId(), month, category: 'Lojas', description: 'AMAZON', amount: 100.0, owner: 'Ambos', fixed: false },
    );

    // ===== NOTAS FISCAIS (REAIS) =====
    receipts.push(
      // Contas (Na meta)
      { id: getNextId(), date: month + '-01', category: 'Contas', merchant: 'HIPOTECA', amount: 1850.0, owner: 'Ambos', fixed: true },
      { id: getNextId(), date: month + '-05', category: 'Contas', merchant: 'VIDEOTRON', amount: 90.0, owner: 'Gabriel', fixed: true },
      // Luz (Estourou um pouco)
      { id: getNextId(), date: month + '-10', category: 'Contas', merchant: 'LUZ', amount: 135.5, owner: 'Ambos', fixed: true },

      // Supermercado (Compras picadas, dentro da meta)
      { id: getNextId(), date: month + '-04', category: 'Supermercado', merchant: 'IGA', amount: 210.3, owner: 'Luana', fixed: false },
      { id: getNextId(), date: month + '-12', category: 'Supermercado', merchant: 'MAXI', amount: 145.8, owner: 'Ambos', fixed: false },
      { id: getNextId(), date: month + '-18', category: 'Supermercado', merchant: 'IGA', amount: 180.2, owner: 'Luana', fixed: false },

      // Transporte e Combustível (Com gasto não previsto de Uber)
      { id: getNextId(), date: month + '-02', category: 'Transporte', merchant: 'STM', amount: 97.0, owner: 'Luana', fixed: true },
      { id: getNextId(), date: month + '-08', category: 'Transporte', merchant: 'UBER', amount: 35.0, owner: 'Gabriel', fixed: false },
      { id: getNextId(), date: month + '-15', category: 'Combustível', merchant: 'COSTCO GASOLINA', amount: 65.0, owner: 'Gabriel', fixed: false },

      // Estilo de vida e Outros (Alguns estourados)
      { id: getNextId(), date: month + '-20', category: 'Jantar fora', merchant: 'LA CAGE', amount: 125.4, owner: 'Ambos', fixed: false }, // Estourou o previsto de 100
      { id: getNextId(), date: month + '-22', category: 'Jantar fora', merchant: 'TIM HORTONS', amount: 14.5, owner: 'Gabriel', fixed: false }, // Gasto surpresa
      { id: getNextId(), date: month + '-11', category: 'Assinaturas', merchant: 'NETFLIX', amount: 22.99, owner: 'Gabriel', fixed: true },
      { id: getNextId(), date: month + '-05', category: 'Cuidados pessoais', merchant: 'ACADEMIA', amount: 45.0, owner: 'Gabriel', fixed: true },
      { id: getNextId(), date: month + '-14', category: 'Lojas', merchant: 'AMAZON', amount: 142.0, owner: 'Ambos', fixed: false }, // Estourou o previsto de 100
    );

    refreshAll();
    console.log('seedFinanceDemo: dados de exemplo carregados para ' + month);
  };
})();
