// ===== Estado em memória =====

const plannedItems = []; // {id, month, category, description, amount, owner, fixed}
const receipts = []; // {id, date, category, merchant, amount, owner, fixed}
const incomes = []; // {month, owner, amount}

// Memória para não resetar o agrupamento ao adicionar/excluir item (Padrão: tudo fechado)
const openPlannedCats = new Set();
const openReceiptCats = new Set();
const openDashboardCats = new Set();

let nextId = 1;
const getNextId = () => nextId++;

// Tipos de gasto (linha vermelha da tua planilha)
const RECEIPT_TYPES = ['Transporte', 'Supermercado', 'Contas', 'Eventos', 'Jantar fora', 'Lojas', 'Assinaturas', 'Combustível', 'Cuidados pessoais'];

// Empresas por tipo
const companyDirectory = {
  Transporte: ['STM', 'UBER'],
  Supermercado: ['MARCHE SA', 'WALMART', 'SUPER C', 'MAXI', 'MARCHE DOMAINE', 'IGA', 'COSTCO', 'PROVIGO', 'SAQ', 'MARCHE BRESILIEN', 'BULKBARN', 'METRO', 'ADONIS', 'T&T', 'KIMPHAY', 'MERCADO'],
  Contas: ['HIPOTECA', 'LUZ', 'VIRGEM', 'IPTU', 'TAXA MUNICIPAL', 'CONDÔMINO', 'CARTÃO CRÉDITO', 'CARTÃO ZOO', 'H. EXTR. ANUAL', 'VIDEOTRON'],
  Eventos: ['MOOSE BAWR', 'YATAI', 'POTAGER MONT-ROUGE', 'BIXI', 'AIRBNB', 'ESTACIONAMENTO', 'ZOO', 'CENTRE BELL', 'CINEMA'],
  'Jantar fora': ['CAFÉ', 'TIM HORTONS', 'PRESOTEA', 'KETTLEMANS BAGEL', 'SUSHI', 'BOSTON', 'PIZZA', 'McDonalds', 'LA CAGE', 'THE KEG', 'SUBWAY', 'REFEITÓRIO DESJARDINS', 'RESTAURANTE'],
  Lojas: ['CDN TIRE', 'SHEIN', 'DOLLARAMA', 'AMAZON', 'MINISO', 'URBAN PLANET', 'JOGOS ONLINE', 'HP', 'ZARA', 'WINNERS', 'ARDENE', 'IKEA', 'AVIZOO'],
  Assinaturas: ['MICROSOFT', 'NETFLIX', 'ICI TOUT TELE', 'MY FAMILY', 'DISNEY', 'AMAZON PRIME', 'HBO', 'APPLE TV', 'CHATGPT', 'YOUTUBE', 'SPOTIFY'],
  Combustível: ['PETRO CANADA', 'COSTCO GASOLINA', 'ESSO'],
  'Cuidados pessoais': ['CABELO', 'UNHA', 'PHARMAPRIX', 'JEAN COUTO', 'ACADEMIA', 'REMÉDIO', 'MASSAGEM', 'MÉDICO', 'VETERINÁRIO'],
};

// ===== Utilitários =====

// Formata como "CAD 1.234,56"
function formatCurrency(value) {
  const n = Number(value) || 0;
  const fixed = n.toFixed(2); // "1234.56"
  const [intPart, decPart] = fixed.split('.');
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return 'CAD ' + withThousands + ',' + decPart;
}

function parseAmount(str) {
  if (str === null || str === undefined || str === '') return NaN;
  return parseFloat(String(str).replace(',', '.'));
}

function getCurrentMonthISO() {
  const today = new Date();
  return today.toISOString().slice(0, 7); // AAAA-MM
}

function makeKey(category, description) {
  return (category || '').trim().toLowerCase() + '||' + (description || '').trim().toLowerCase();
}

// ===== Navegação entre telas =====

const navButtons = document.querySelectorAll('.nav-btn');
const views = document.querySelectorAll('.view');

navButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    navButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    views.forEach((v) => {
      v.classList.toggle('active', v.id === 'view-' + view);
    });
  });
});

// ===== Controles globais (mês + rendas + resumo) =====

const monthInput = document.getElementById('current-month');
const incomeLuanaInput = document.getElementById('income-luana');
const incomeGabrielInput = document.getElementById('income-gabriel');
const btnSaveIncome = document.getElementById('btn-save-income');
const btnLoadMonth = document.getElementById('btn-load-month');
const btnToggleIncome = document.getElementById('btn-toggle-income');
const incomePanel = document.getElementById('income-panel');

btnToggleIncome.addEventListener('click', () => {
  const isHidden = incomePanel.style.display === 'none';
  incomePanel.style.display = isHidden ? 'block' : 'none';
});

// Painel Global
const summaryIncomeInline = document.getElementById('summary-income-inline');
const summaryExpenseInline = document.getElementById('summary-expense-inline');
const summarySaldoLivre = document.getElementById('summary-saldo-livre');

// Aba 3 (Dashboard)
const summarySaldoPrevisto = document.getElementById('summary-saldo-previsto');
const summarySaldoReal = document.getElementById('summary-saldo-real');
const summaryDiffSaldo = document.getElementById('summary-diff-saldo');

function getCurrentMonth() {
  return monthInput.value;
}

// 1. Função para buscar a renda (atual ou a última salva no passado)
function loadIncomeToInputs(month) {
  let income = incomes.find((i) => i.month === month);

  // Se não tem renda para esse mês, busca a última disponível antes dele
  if (!income) {
    const pastIncomes = incomes.filter((i) => i.month < month).sort((a, b) => b.month.localeCompare(a.month));

    if (pastIncomes.length > 0) {
      income = pastIncomes[0];
    }
  }

  // Preenche os campos de input
  incomeLuanaInput.value = income ? income.luana || 0 : 0;
  incomeGabrielInput.value = income ? income.gabriel || 0 : 0;
}

// 2. Evento do botão Carregar
// Evento do botão Carregar (Agora carrega Renda + Orçamento Fixo)
btnLoadMonth.addEventListener('click', () => {
  const targetMonth = getCurrentMonth();
  if (!targetMonth) return alert('Selecione um mês primeiro.');

  // 1. Verificar se o mês atual já tem itens (para não duplicar por acidente)
  const hasItems = plannedItems.some((p) => p.month === targetMonth);

  if (!hasItems) {
    // 2. Buscar o mês anterior mais recente que possua dados
    const pastMonthsWithData = [...new Set(plannedItems.map((p) => p.month))].filter((m) => m < targetMonth).sort((a, b) => b.localeCompare(a));

    if (pastMonthsWithData.length > 0) {
      const lastMonth = pastMonthsWithData[0];

      // 3. Filtrar apenas os itens FIXOS do mês anterior
      const fixedItemsToClone = plannedItems.filter((p) => p.month === lastMonth && p.fixed);

      // 4. Clonar para o mês atual com novos IDs
      fixedItemsToClone.forEach((item) => {
        plannedItems.push({
          ...item,
          id: getNextId(),
          month: targetMonth,
        });
      });

      console.log(`${fixedItemsToClone.length} itens fixos clonados de ${lastMonth} para ${targetMonth}.`);
    }
  }

  // 5. Carregar a renda (já possui lógica de recorrência)
  loadIncomeToInputs(targetMonth);

  // 6. Atualizar a tela
  refreshAll();
  alert(`Dados de ${targetMonth} processados com sucesso!`);
});

// 3. Novo Salvar Rendas (Salva como objeto único por mês)
btnSaveIncome.addEventListener('click', () => {
  const month = getCurrentMonth();
  if (!month) return alert('Selecione o mês.');

  const luana = parseAmount(incomeLuanaInput.value) || 0;
  const gabriel = parseAmount(incomeGabrielInput.value) || 0;

  const index = incomes.findIndex((i) => i.month === month);
  if (index !== -1) {
    incomes[index] = { month, luana, gabriel };
  } else {
    incomes.push({ month, luana, gabriel });
  }

  alert(`Rendas de ${month} salvas! Valor fixado para os próximos meses.`);
  refreshAll();
});

// 4. Helper para o cálculo de saldo (considerando a recorrência)
function getIncomeTotalForMonth(month) {
  const exact = incomes.find((i) => i.month === month);
  if (exact) return (exact.luana || 0) + (exact.gabriel || 0);

  const past = incomes.filter((i) => i.month < month).sort((a, b) => b.month.localeCompare(a.month));

  return past.length > 0 ? past[0].luana + past[0].gabriel : 0;
}

monthInput.addEventListener('change', () => {
  refreshAll();
});

// ===== Chips de tipos & empresas (uso em 2 telas) =====

const plannedTypeChips = document.getElementById('planned-type-chips');
const plannedCompanyChips = document.getElementById('planned-company-chips');
const receiptTypeChips = document.getElementById('receipt-type-chips');
const receiptCompanyChips = document.getElementById('receipt-company-chips');

let selectedPlannedType = RECEIPT_TYPES[0];
let selectedReceiptType = RECEIPT_TYPES[0];

function renderTypeChips(container, selectedType, onSelect) {
  container.innerHTML = '';
  RECEIPT_TYPES.forEach((type) => {
    const chip = document.createElement('div');
    chip.className = 'chip' + (type === selectedType ? ' active' : '');
    chip.textContent = type;
    chip.addEventListener('click', () => onSelect(type));
    container.appendChild(chip);
  });
}

function renderCompanyChips(container, type, onSelectCompany) {
  container.innerHTML = '';
  const companies = companyDirectory[type] || [];

  if (!companies.length) {
    const span = document.createElement('span');
    span.className = 'hint small';
    span.textContent = 'Nenhuma empresa cadastrada para este tipo ainda. Digite abaixo para adicionar.';
    container.appendChild(span);
    return;
  }

  companies.forEach((name) => {
    const chip = document.createElement('div');
    // Adicionamos a classe 'chip-company' aqui:
    chip.className = 'chip chip-company';
    chip.textContent = name;
    chip.addEventListener('click', () => onSelectCompany(name));
    container.appendChild(chip);
  });
}

function updatePlannedChips() {
  renderTypeChips(plannedTypeChips, selectedPlannedType, (type) => {
    selectedPlannedType = type;
    plannedCategoryInput.value = type;
    updatePlannedChips();
  });

  renderCompanyChips(plannedCompanyChips, selectedPlannedType, (company) => {
    plannedDescriptionInput.value = company;
  });
}

function updateReceiptChips() {
  renderTypeChips(receiptTypeChips, selectedReceiptType, (type) => {
    selectedReceiptType = type;
    actualCategoryInput.value = type;
    updateReceiptChips();
  });

  renderCompanyChips(receiptCompanyChips, selectedReceiptType, (company) => {
    actualMerchantInput.value = company;
  });
}

// ===== Orçamento mensal (custos previstos) =====

const formPlanned = document.getElementById('form-planned');
const plannedCategoryInput = document.getElementById('planned-category');
const plannedDescriptionInput = document.getElementById('planned-description');
const plannedAmountInput = document.getElementById('planned-amount');
const plannedOwnerSelect = document.getElementById('planned-owner');
const plannedFixedCheckbox = document.getElementById('planned-fixed');
const plannedSubmitBtn = document.getElementById('planned-submit-btn');

const budgetTableBody = document.getElementById('budget-table-body');
const plannedItemsList = document.getElementById('planned-items-list');

const formCompany = document.getElementById('form-company');
const companyNameInput = document.getElementById('company-name');

let editingPlannedId = null;

// Adicione isso junto dos utilitários
function autoRegisterCompany(type, name) {
  const t = type.trim();
  const n = name.trim().toUpperCase(); // Padroniza tudo em maiúsculo igual você fez

  if (!t || !n) return;

  if (!companyDirectory[t]) {
    companyDirectory[t] = []; // Cria a categoria se não existir
  }

  if (!companyDirectory[t].includes(n)) {
    companyDirectory[t].push(n);
    // Atualiza os chips na tela imediatamente
    updatePlannedChips();
    updateReceiptChips();
  }
}

formPlanned.addEventListener('submit', (e) => {
  e.preventDefault();

  const month = getCurrentMonth();
  if (!month) {
    alert('Escolha o mês de referência no topo primeiro.');
    return;
  }

  const category = plannedCategoryInput.value.trim();
  const description = plannedDescriptionInput.value.trim();
  autoRegisterCompany(category, description);
  const amount = parseAmount(plannedAmountInput.value);
  const owner = plannedOwnerSelect.value;
  const fixed = plannedFixedCheckbox.checked;

  if (!category || !description || isNaN(amount)) {
    alert('Preencha categoria, descrição e valor previsto.');
    return;
  }

  if (editingPlannedId === null) {
    plannedItems.push({
      id: getNextId(),
      month,
      category,
      description,
      amount,
      owner,
      fixed,
    });
  } else {
    const item = plannedItems.find((p) => p.id === editingPlannedId);
    if (item) {
      item.month = month;
      item.category = category;
      item.description = description;
      item.amount = amount;
      item.owner = owner;
      item.fixed = fixed;
    }
  }

  resetPlannedForm();
  refreshAll();
});

function resetPlannedForm() {
  formPlanned.reset();
  editingPlannedId = null;
  plannedSubmitBtn.textContent = 'Adicionar ao orçamento do mês';
}

function startEditPlanned(id) {
  const item = plannedItems.find((p) => p.id === id);
  if (!item) return;
  editingPlannedId = id;

  monthInput.value = item.month;
  plannedCategoryInput.value = item.category;
  plannedDescriptionInput.value = item.description;
  plannedAmountInput.value = item.amount;
  plannedOwnerSelect.value = item.owner;
  plannedFixedCheckbox.checked = item.fixed;

  if (RECEIPT_TYPES.includes(item.category)) {
    selectedPlannedType = item.category;
    updatePlannedChips();
  }

  plannedSubmitBtn.textContent = 'Salvar alterações';
  refreshAll();
}

function deletePlanned(id) {
  const idx = plannedItems.findIndex((p) => p.id === id);
  if (idx >= 0) plannedItems.splice(idx, 1);
  if (editingPlannedId === id) resetPlannedForm();
  refreshAll();
}

// ===== Lógica Abrir/Fechar Tudo =====
const btnExpandPlanned = document.getElementById('btn-expand-planned');
const btnCollapsePlanned = document.getElementById('btn-collapse-planned');
const btnExpandReceipts = document.getElementById('btn-expand-receipts');
const btnCollapseReceipts = document.getElementById('btn-collapse-receipts');
const btnExpandDashboard = document.getElementById('btn-expand-dashboard');
const btnCollapseDashboard = document.getElementById('btn-collapse-dashboard');

if (btnExpandDashboard) {
  btnExpandDashboard.addEventListener('click', () => {
    const month = getCurrentMonth();
    if (!month) return;
    const items = [...plannedItems.filter((p) => p.month === month), ...receipts.filter((r) => r.date.startsWith(month))];
    items.forEach((i) => openDashboardCats.add(i.category));
    refreshAll();
  });

  btnCollapseDashboard.addEventListener('click', () => {
    openDashboardCats.clear();
    refreshAll();
  });
}

btnExpandPlanned.addEventListener('click', () => {
  const month = getCurrentMonth();
  if (!month) return;
  const items = plannedItems.filter((p) => p.month === month);
  items.forEach((p) => openPlannedCats.add(p.category)); // Adiciona todas as categorias na memória
  renderPlannedItemsList(month);
});

btnCollapsePlanned.addEventListener('click', () => {
  openPlannedCats.clear(); // Limpa a memória
  renderPlannedItemsList(getCurrentMonth());
});

btnExpandReceipts.addEventListener('click', () => {
  const month = getCurrentMonth();
  if (!month) return;
  const list = receipts.filter((r) => r.date.startsWith(month));
  list.forEach((r) => openReceiptCats.add(r.category)); // Adiciona todas as categorias na memória
  updateReceiptsView();
});

btnCollapseReceipts.addEventListener('click', () => {
  openReceiptCats.clear(); // Limpa a memória
  updateReceiptsView();
});

function renderPlannedItemsList(month) {
  plannedItemsList.innerHTML = '';
  const items = plannedItems.filter((p) => p.month === month);

  if (!items.length) {
    plannedItemsList.innerHTML = "<p class='hint'>Nenhum item de orçamento cadastrado para este mês.</p>";
    return;
  }

  const grandTotal = items.reduce((acc, curr) => acc + curr.amount, 0);

  const grouped = {};
  items.forEach((p) => {
    if (!grouped[p.category]) grouped[p.category] = [];
    grouped[p.category].push(p);
  });

  Object.keys(grouped)
    .sort()
    .forEach((cat) => {
      const groupItems = grouped[cat];
      const isOpen = openPlannedCats.has(cat);
      const catTotal = groupItems.reduce((acc, curr) => acc + curr.amount, 0);

      const headerDiv = document.createElement('div');
      headerDiv.className = 'group-header-div';
      headerDiv.innerHTML = `
      <span>${isOpen ? '▼' : '▶'} ${cat}</span>
      <span style="color:#a6a6c0; font-size:0.85rem; font-weight:normal;">${formatCurrency(catTotal)}</span>
    `;

      headerDiv.onclick = () => {
        if (openPlannedCats.has(cat)) openPlannedCats.delete(cat);
        else openPlannedCats.add(cat);
        renderPlannedItemsList(month);
      };

      plannedItemsList.appendChild(headerDiv);

      if (isOpen) {
        groupItems.forEach((p) => {
          const item = document.createElement('div');
          item.className = 'receipt-item';
          item.innerHTML = `
          <div class="receipt-main">
            <div class="receipt-line">${p.description}</div>
            <div class="receipt-meta">Resp: ${p.owner}${p.fixed ? ' • Fixo' : ''}</div>
          </div>
          <div class="receipt-right">
            <div class="receipt-amount">${formatCurrency(p.amount)}</div>
            <div class="receipt-actions">
              <button class="action-btn" onclick="startEditPlanned(${p.id})">Editar</button>
              <button class="action-btn danger" onclick="deletePlanned(${p.id})">Excluir</button>
            </div>
          </div>
        `;
          plannedItemsList.appendChild(item);
        });
      }
    });

  const footerDiv = document.createElement('div');
  footerDiv.className = 'list-footer-total';
  footerDiv.innerHTML = `<span>TOTAL PREVISTO</span><span>${formatCurrency(grandTotal)}</span>`;
  plannedItemsList.appendChild(footerDiv);
}

// ===== Lançamento de notas fiscais =====

const formActual = document.getElementById('form-actual');
const actualSubmitBtn = document.getElementById('actual-submit-btn');
const actualDateInput = document.getElementById('actual-date');
const actualCategoryInput = document.getElementById('actual-category');
const actualMerchantInput = document.getElementById('actual-merchant');
const actualAmountInput = document.getElementById('actual-amount');
const actualOwnerSelect = document.getElementById('actual-owner');
const actualFixedCheckbox = document.getElementById('actual-fixed');
const receiptsList = document.getElementById('receipts-list');

let editingReceiptId = null;

formActual.addEventListener('submit', (e) => {
  e.preventDefault();

  const date = actualDateInput.value;
  const category = actualCategoryInput.value.trim();
  const merchant = actualMerchantInput.value.trim();
  autoRegisterCompany(category, merchant);
  const amount = parseAmount(actualAmountInput.value);
  const owner = actualOwnerSelect.value;
  const fixed = actualFixedCheckbox.checked;

  if (!date || !category || !merchant || isNaN(amount)) {
    alert('Preencha data, categoria, nome e valor.');
    return;
  }

  if (editingReceiptId === null) {
    receipts.push({
      id: getNextId(),
      date,
      category,
      merchant,
      amount,
      owner,
      fixed,
    });
  } else {
    const r = receipts.find((x) => x.id === editingReceiptId);
    if (r) {
      r.date = date;
      r.category = category;
      r.merchant = merchant;
      r.amount = amount;
      r.owner = owner;
      r.fixed = fixed;
    }
  }

  resetReceiptForm();
  refreshAll();
});

function resetReceiptForm() {
  formActual.reset();
  editingReceiptId = null;
  actualSubmitBtn.textContent = 'Salvar nota fiscal';
}

function startEditReceipt(id) {
  const r = receipts.find((x) => x.id === id);
  if (!r) return;
  editingReceiptId = id;

  actualDateInput.value = r.date;
  actualCategoryInput.value = r.category;
  actualMerchantInput.value = r.merchant;
  actualAmountInput.value = r.amount;
  actualOwnerSelect.value = r.owner;
  actualFixedCheckbox.checked = r.fixed;

  if (RECEIPT_TYPES.includes(r.category)) {
    selectedReceiptType = r.category;
    updateReceiptChips();
  }

  actualSubmitBtn.textContent = 'Salvar alterações';
}

function deleteReceipt(id) {
  const idx = receipts.findIndex((r) => r.id === id);
  if (idx >= 0) receipts.splice(idx, 1);
  if (editingReceiptId === id) resetReceiptForm();
  refreshAll();
}

function updateReceiptsView() {
  const month = getCurrentMonth();
  receiptsList.innerHTML = '';
  if (!month) return;

  const list = receipts.filter((r) => r.date.startsWith(month));

  if (!list.length) {
    receiptsList.innerHTML = "<p class='hint'>Nenhum lançamento para este mês.</p>";
    return;
  }

  const grandTotal = list.reduce((acc, curr) => acc + curr.amount, 0);

  const grouped = {};
  list.forEach((r) => {
    if (!grouped[r.category]) grouped[r.category] = [];
    grouped[r.category].push(r);
  });

  Object.keys(grouped)
    .sort()
    .forEach((cat) => {
      const groupItems = grouped[cat].sort((a, b) => a.date.localeCompare(b.date));
      const isOpen = openReceiptCats.has(cat);
      const catTotal = groupItems.reduce((acc, curr) => acc + curr.amount, 0);

      const headerDiv = document.createElement('div');
      headerDiv.className = 'group-header-div';
      headerDiv.innerHTML = `
      <span>${isOpen ? '▼' : '▶'} ${cat}</span>
      <span style="color:#a6a6c0; font-size:0.85rem; font-weight:normal;">${formatCurrency(catTotal)}</span>
    `;

      headerDiv.onclick = () => {
        if (openReceiptCats.has(cat)) openReceiptCats.delete(cat);
        else openReceiptCats.add(cat);
        updateReceiptsView();
      };

      receiptsList.appendChild(headerDiv);

      if (isOpen) {
        groupItems.forEach((r) => {
          const item = document.createElement('div');
          item.className = 'receipt-item';
          item.innerHTML = `
          <div class="receipt-main">
            <div class="receipt-line">${r.merchant} • ${r.category}</div>
            <div class="receipt-meta">${r.date.split('-').reverse().join('/')} • ${r.owner}${r.fixed ? ' • Fixo' : ''}</div>
          </div>
          <div class="receipt-right">
            <div class="receipt-amount">${formatCurrency(r.amount)}</div>
            <div class="receipt-actions">
              <button class="action-btn" onclick="startEditReceipt(${r.id})">Editar</button>
              <button class="action-btn danger" onclick="deleteReceipt(${r.id})">Excluir</button>
            </div>
          </div>
        `;
          receiptsList.appendChild(item);
        });
      }
    });

  const footerDiv = document.createElement('div');
  footerDiv.className = 'list-footer-total';
  footerDiv.innerHTML = `<span>TOTAL REAL ACUMULADO</span><span>${formatCurrency(grandTotal)}</span>`;
  receiptsList.appendChild(footerDiv);
}

// ===== Resumo Global =====

function updateGlobalSummaries() {
  const month = getCurrentMonth();
  if (!month) return;

  const totalIncome = getIncomeTotalForMonth(month);

  const plannedForMonth = plannedItems.filter((p) => p.month === month);
  const totalPlanned = plannedForMonth.reduce((s, p) => s + p.amount, 0);

  const actualForMonth = receipts.filter((r) => r.date.startsWith(month));
  const totalActual = actualForMonth.reduce((s, r) => s + r.amount, 0);

  const saldoPrevisto = totalIncome - totalPlanned;
  const saldoReal = totalIncome - totalActual;

  if (summaryIncomeInline) {
    summaryIncomeInline.textContent = formatCurrency(totalIncome);
    summaryIncomeInline.className = 'positive'; // Renda sempre verde
  }
  if (summaryExpenseInline) {
    summaryExpenseInline.textContent = formatCurrency(totalActual);
    summaryExpenseInline.className = saldoReal < 0 ? 'negative' : ''; // Gasto fica vermelho se estourar
  }
  if (summarySaldoLivre) {
    summarySaldoLivre.textContent = formatCurrency(saldoReal);
    summarySaldoLivre.className = saldoReal >= 0 ? 'positive' : 'negative';
  }

  const summaryPlannedExpense = document.getElementById('summary-planned-expense');
  if (summaryPlannedExpense) {
    summaryPlannedExpense.textContent = formatCurrency(totalPlanned);
  }

  if (summarySaldoPrevisto) {
    summarySaldoPrevisto.textContent = formatCurrency(saldoPrevisto);
    summarySaldoPrevisto.className = saldoPrevisto >= 0 ? 'positive-planned' : 'negative-planned';
  }

  if (summarySaldoReal) {
    summarySaldoReal.textContent = formatCurrency(saldoReal);
    summarySaldoReal.className = saldoReal >= 0 ? 'positive' : 'negative';
  }

  renderPlannedItemsList(month);
}

// ===== Dashboard Unificado (Sanfona) =====

function updateDashboardView() {
  const month = getCurrentMonth();
  const tbody = document.getElementById('dashboard-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!month) return;

  const plannedForMonth = plannedItems.filter((p) => p.month === month);
  const receiptsForMonth = receipts.filter((r) => r.date.startsWith(month));

  const mapCat = {};

  // Agrupa os previstos
  plannedForMonth.forEach((p) => {
    if (!mapCat[p.category]) mapCat[p.category] = { planned: 0, actual: 0, items: new Map() };
    mapCat[p.category].planned += p.amount;

    const key = makeKey(p.category, p.description);
    if (!mapCat[p.category].items.has(key)) {
      mapCat[p.category].items.set(key, { name: p.description, planned: 0, actual: 0 });
    }
    mapCat[p.category].items.get(key).planned += p.amount;
  });

  // Agrupa os reais
  receiptsForMonth.forEach((r) => {
    if (!mapCat[r.category]) mapCat[r.category] = { planned: 0, actual: 0, items: new Map() };
    mapCat[r.category].actual += r.amount;

    const key = makeKey(r.category, r.merchant);
    if (!mapCat[r.category].items.has(key)) {
      mapCat[r.category].items.set(key, { name: r.merchant, planned: 0, actual: 0 });
    }
    mapCat[r.category].items.get(key).actual += r.amount;
  });

  let sumPlanned = 0;
  let sumActual = 0;

  const cats = Object.keys(mapCat).sort((a, b) => a.localeCompare(b));

  if (!cats.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="hint small" style="text-align:center; padding: 20px;">Nenhum dado de orçamento ou notas para este mês.</td></tr>';
    return;
  }

  cats.forEach((cat) => {
    const data = mapCat[cat];
    sumPlanned += data.planned;
    sumActual += data.actual;
    const diffCat = data.planned - data.actual;
    const isOpen = openDashboardCats.has(cat);

    // Header da Categoria
    const trCat = document.createElement('tr');
    trCat.className = 'dashboard-group-header';
    trCat.onclick = () => {
      if (isOpen) openDashboardCats.delete(cat);
      else openDashboardCats.add(cat);
      updateDashboardView();
    };

    const tdCatName = document.createElement('td');
    const catContainer = document.createElement('div');
    catContainer.className = 'cat-name-container';

    const catTitle = document.createElement('span');
    catTitle.innerHTML = `<span class="toggle-icon">${isOpen ? '▼' : '▶'}</span> ${cat}`;
    catContainer.appendChild(catTitle);

    if (data.planned > 0 || data.actual > 0) {
      let percent = data.planned > 0 ? (data.actual / data.planned) * 100 : 100;
      const progressContainer = document.createElement('div');
      progressContainer.className = 'progress-bar-container';
      const progressFill = document.createElement('div');
      progressFill.className = 'progress-bar-fill';
      progressFill.style.width = Math.min(percent, 100) + '%';

      if (percent <= 75) progressFill.classList.add('progress-safe');
      else if (percent <= 95) progressFill.classList.add('progress-warning');
      else progressFill.classList.add('progress-danger');

      progressContainer.appendChild(progressFill);
      catContainer.appendChild(progressContainer);
    }
    tdCatName.appendChild(catContainer);

    const tdCatPrev = document.createElement('td');
    tdCatPrev.className = 'numeric';
    tdCatPrev.textContent = formatCurrency(data.planned);

    const tdCatReal = document.createElement('td');
    tdCatReal.className = 'numeric';
    tdCatReal.textContent = formatCurrency(data.actual);

    const tdCatDiff = document.createElement('td');
    tdCatDiff.className = 'numeric ' + (diffCat >= 0 ? 'positive' : 'negative');
    tdCatDiff.textContent = formatCurrency(diffCat);

    trCat.appendChild(tdCatName);
    trCat.appendChild(tdCatPrev);
    trCat.appendChild(tdCatReal);
    trCat.appendChild(tdCatDiff);
    tbody.appendChild(trCat);

    // Linhas de Detalhe (Filhos)
    if (isOpen) {
      const items = Array.from(data.items.values()).sort((a, b) => a.name.localeCompare(b.name));
      items.forEach((item) => {
        const diffItem = item.planned - item.actual;
        const trItem = document.createElement('tr');
        trItem.className = 'dashboard-detail-row';

        const tdItemName = document.createElement('td');
        tdItemName.textContent = item.name;

        const tdItemPrev = document.createElement('td');
        tdItemPrev.className = 'numeric';
        tdItemPrev.textContent = formatCurrency(item.planned);

        const tdItemReal = document.createElement('td');
        tdItemReal.className = 'numeric';
        tdItemReal.textContent = formatCurrency(item.actual);

        const tdItemDiff = document.createElement('td');
        tdItemDiff.className = 'numeric ' + (diffItem >= 0 ? 'positive' : 'negative');
        tdItemDiff.textContent = formatCurrency(diffItem);

        trItem.appendChild(tdItemName);
        trItem.appendChild(tdItemPrev);
        trItem.appendChild(tdItemReal);
        trItem.appendChild(tdItemDiff);
        tbody.appendChild(trItem);
      });
    }
  });

  // Totais do Rodapé
  const totalDiff = sumPlanned - sumActual;
  document.getElementById('dashboard-total-planned').textContent = formatCurrency(sumPlanned);
  document.getElementById('dashboard-total-actual').textContent = formatCurrency(sumActual);
  const tdDiffTotal = document.getElementById('dashboard-total-diff');
  tdDiffTotal.textContent = formatCurrency(totalDiff);
  tdDiffTotal.className = 'numeric ' + (totalDiff >= 0 ? 'positive' : 'negative');
}

// ===== Gráficos (Chart.js) =====

let categoriesChart = null;
const chartsCanvas = document.getElementById('chart-categories');

function updateChartsView() {
  const month = getCurrentMonth();
  if (!month || !chartsCanvas) return;

  const plannedForMonth = plannedItems.filter((p) => p.month === month);
  const actualForMonth = receipts.filter((r) => r.date.startsWith(month));

  const mapCat = {};
  plannedForMonth.forEach((p) => {
    if (!mapCat[p.category]) mapCat[p.category] = { planned: 0, actual: 0 };
    mapCat[p.category].planned += p.amount;
  });
  actualForMonth.forEach((r) => {
    if (!mapCat[r.category]) mapCat[r.category] = { planned: 0, actual: 0 };
    mapCat[r.category].actual += r.amount;
  });

  const labels = Object.keys(mapCat).sort((a, b) => a.localeCompare(b));
  const plannedData = labels.map((cat) => mapCat[cat].planned);
  const actualData = labels.map((cat) => mapCat[cat].actual);

  if (categoriesChart) {
    categoriesChart.destroy();
  }

  // Plugin customizado para desenhar os valores diretamente nas barras
  const valueLabelsPlugin = {
    id: 'valueLabels',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      chart.data.datasets.forEach((dataset, i) => {
        const meta = chart.getDatasetMeta(i);
        meta.data.forEach((bar, index) => {
          const value = dataset.data[index];
          if (value === 0) return;

          ctx.save();
          ctx.fillStyle = '#c3c3d5';
          ctx.font = '11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = value >= 0 ? 'bottom' : 'top';

          const yPos = value >= 0 ? bar.y - 5 : bar.y + 5;
          const text = Math.round(value).toLocaleString('pt-BR');

          ctx.fillText(text, bar.x, yPos);
          ctx.restore();
        });
      });
    },
  };

  categoriesChart = new Chart(chartsCanvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Previsto', data: plannedData },
        { label: 'Real', data: actualData },
      ],
    },
    plugins: [valueLabelsPlugin],
    options: {
      responsive: true,
      layout: {
        padding: {
          top: 25, // Dá espaço extra no topo para o número não cortar
          bottom: 10,
        },
      },
      scales: {
        y: { beginAtZero: true },
      },
    },
  });
}

// ===== Gráfico Histórico (Evolução) =====

let historyChart = null;
const chartHistoryCanvas = document.getElementById('chart-history');
const historyMonthsSelect = document.getElementById('history-months-select');

if (historyMonthsSelect) {
  historyMonthsSelect.addEventListener('change', updateHistoricalChart);
}

function updateHistoricalChart() {
  if (!chartHistoryCanvas) return;

  const allMonthsSet = new Set();
  incomes.forEach((i) => allMonthsSet.add(i.month));
  receipts.forEach((r) => allMonthsSet.add(r.date.substring(0, 7)));
  plannedItems.forEach((p) => allMonthsSet.add(p.month));

  let allMonths = Array.from(allMonthsSet).sort();

  if (allMonths.length === 0) {
    if (historyChart) historyChart.destroy();
    return;
  }

  const limit = historyMonthsSelect.value;
  if (limit !== 'all') {
    allMonths = allMonths.slice(-parseInt(limit));
  }

  const labels = [];
  const monthlyBalances = [];
  let selectedPeriodTotal = 0; // Somador para o período filtrado

  allMonths.forEach((m) => {
    const inc = getIncomeTotalForMonth(m);
    const exp = receipts.filter((r) => r.date.startsWith(m)).reduce((sum, r) => sum + r.amount, 0);
    const bal = inc - exp;

    labels.push(m);
    monthlyBalances.push(bal);
    selectedPeriodTotal += bal;
  });

  // Atualiza o texto de Total Acumulado na tela
  const totalEl = document.getElementById('history-total-accumulated');
  if (totalEl) {
    totalEl.textContent = 'Total: ' + formatCurrency(selectedPeriodTotal);
    totalEl.className = selectedPeriodTotal >= 0 ? 'positive' : 'negative';
  }

  if (historyChart) {
    historyChart.destroy();
  }

  // Plugin customizado para desenhar os valores diretamente nas barras
  const valueLabelsPlugin = {
    id: 'valueLabels',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      chart.data.datasets.forEach((dataset, i) => {
        const meta = chart.getDatasetMeta(i);
        meta.data.forEach((bar, index) => {
          const value = dataset.data[index];
          if (value === 0) return; // Não desenha nada se for zero absoluto

          ctx.save();
          ctx.fillStyle = '#c3c3d5'; // Cor discreta para o texto
          ctx.font = '11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = value >= 0 ? 'bottom' : 'top';

          // Posiciona o texto levemente acima (se positivo) ou abaixo (se negativo)
          const yPos = value >= 0 ? bar.y - 5 : bar.y + 5;

          // Formata o número arredondado e com separador de milhar (Ex: 4.098)
          const text = Math.round(value).toLocaleString('pt-BR');

          ctx.fillText(text, bar.x, yPos);
          ctx.restore();
        });
      });
    },
  };

  historyChart = new Chart(chartHistoryCanvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Saldo Livre do Mês',
          data: monthlyBalances,
          backgroundColor: monthlyBalances.map((v) => (v >= 0 ? '#62c462' : '#d9534f')),
          borderRadius: 4,
        },
      ],
    },
    plugins: [valueLabelsPlugin],
    options: {
      responsive: true,
      layout: {
        padding: {
          top: 25, // Dá espaço extra no topo para o número não cortar
          bottom: 10,
        },
      },
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: { beginAtZero: true },
      },
    },
  });
}

// ===== Refresh geral =====

function refreshAll() {
  const month = getCurrentMonth();
  if (!month) {
    if (summaryIncomeInline) {
      summaryIncomeInline.textContent = 'CAD 0,00';
      summaryIncomeInline.className = '';
    }
    if (summaryExpenseInline) {
      summaryExpenseInline.textContent = 'CAD 0,00';
      summaryExpenseInline.className = '';
    }
    if (summarySaldoLivre) {
      summarySaldoLivre.textContent = 'CAD 0,00';
      summarySaldoLivre.className = '';
    }
    const summaryPlannedExpense = document.getElementById('summary-planned-expense');
    if (summaryPlannedExpense) summaryPlannedExpense.textContent = 'CAD 0,00';

    if (summarySaldoPrevisto) {
      summarySaldoPrevisto.textContent = 'CAD 0,00';
      summarySaldoPrevisto.className = '';
    }
    if (summarySaldoReal) {
      summarySaldoReal.textContent = 'CAD 0,00';
      summarySaldoReal.className = '';
    }

    if (plannedItemsList) plannedItemsList.innerHTML = '';
    receiptsList.innerHTML = '';

    const dashTbody = document.getElementById('dashboard-tbody');
    if (dashTbody) dashTbody.innerHTML = '';

    const tPlanned = document.getElementById('dashboard-total-planned');
    if (tPlanned) tPlanned.textContent = 'CAD 0,00';
    const tActual = document.getElementById('dashboard-total-actual');
    if (tActual) tActual.textContent = 'CAD 0,00';
    const tDiff = document.getElementById('dashboard-total-diff');
    if (tDiff) {
      tDiff.textContent = 'CAD 0,00';
      tDiff.className = 'numeric';
    }
    return;
  }

  updateGlobalSummaries();
  updateReceiptsView();
  updateDashboardView();
  updateChartsView();
  updateHistoricalChart();
}

// ===== Inicialização =====

(function init() {
  const m = getCurrentMonthISO();
  monthInput.value = m;

  selectedPlannedType = RECEIPT_TYPES[0];
  selectedReceiptType = RECEIPT_TYPES[0];

  updatePlannedChips();
  updateReceiptChips();

  refreshAll();
  loadIncomeToInputs(monthInput.value); // Já tenta carregar os valores assim que abre o app
})();

// ===== PWA e Service Worker =====

// 1. Registra o Service Worker (Necessário para o app instalar offline)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch((err) => console.error('Falha no Service Worker:', err));
  });
}

// 2. Intercepta o evento de instalação do Chrome/Android
let deferredPrompt;
const installBanner = document.getElementById('install-banner');
const btnInstall = document.getElementById('btn-install');
const btnCloseInstall = document.getElementById('btn-close-install');

window.addEventListener('beforeinstallprompt', (e) => {
  // Impede o mini-infobar padrão de aparecer em dispositivos móveis
  e.preventDefault();
  // Guarda o evento para acionar o botão depois
  deferredPrompt = e;
  // Exibe o nosso banner customizado
  if (installBanner) installBanner.style.display = 'flex';
});

if (btnInstall) {
  btnInstall.addEventListener('click', async () => {
    installBanner.style.display = 'none';
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`Instalação PWA: ${outcome}`);
      deferredPrompt = null;
    }
  });
}

if (btnCloseInstall) {
  btnCloseInstall.addEventListener('click', () => {
    installBanner.style.display = 'none';
  });
}
