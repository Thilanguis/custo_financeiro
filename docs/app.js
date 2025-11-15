// ===== Estado em memória =====

const plannedItems = []; // {id, month, category, description, amount, owner, fixed}
const receipts = []; // {id, date, category, merchant, amount, owner, fixed}
const incomes = []; // {month, owner, amount}

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

const summaryIncomeInline = document.getElementById('summary-income-inline');
const summaryTotalPlanned = document.getElementById('summary-total-planned');
const summaryTotalActual = document.getElementById('summary-total-actual');
const summarySaldoPrevisto = document.getElementById('summary-saldo-previsto');
const summarySaldoReal = document.getElementById('summary-saldo-real');
const summaryDiffSaldo = document.getElementById('summary-diff-saldo');

function getCurrentMonth() {
  return monthInput.value;
}

btnSaveIncome.addEventListener('click', () => {
  const month = getCurrentMonth();
  if (!month) {
    alert('Escolha o mês antes de salvar as rendas.');
    return;
  }

  const luana = parseAmount(incomeLuanaInput.value) || 0;
  const gabriel = parseAmount(incomeGabrielInput.value) || 0;

  // Remove rendas antigas desse mês
  for (let i = incomes.length - 1; i >= 0; i--) {
    if (incomes[i].month === month) incomes.splice(i, 1);
  }

  incomes.push({ month, owner: 'Luana', amount: luana });
  incomes.push({ month, owner: 'Gabriel', amount: gabriel });

  refreshAll();
  alert('Rendas salvas para ' + month + '!');
});

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
    span.textContent = 'Nenhuma empresa cadastrada para este tipo ainda. Use o campo abaixo para adicionar.';
    container.appendChild(span);
    return;
  }

  companies.forEach((name) => {
    const chip = document.createElement('div');
    chip.className = 'chip';
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
const plannedItemsTbody = document.getElementById('planned-items-tbody');

const formCompany = document.getElementById('form-company');
const companyNameInput = document.getElementById('company-name');

let editingPlannedId = null;

formCompany.addEventListener('submit', (e) => {
  e.preventDefault();

  const name = companyNameInput.value.trim();
  if (!name) {
    alert('Digite o nome da empresa para cadastrar.');
    return;
  }

  const type = selectedPlannedType || plannedCategoryInput.value.trim();
  if (!type) {
    alert('Selecione um tipo de gasto antes de cadastrar a empresa.');
    return;
  }

  if (!companyDirectory[type]) {
    companyDirectory[type] = [];
  }
  if (!companyDirectory[type].includes(name)) {
    companyDirectory[type].push(name);
  }

  companyNameInput.value = '';
  updatePlannedChips();
  updateReceiptChips();
});

formPlanned.addEventListener('submit', (e) => {
  e.preventDefault();

  const month = getCurrentMonth();
  if (!month) {
    alert('Escolha o mês de referência no topo primeiro.');
    return;
  }

  const category = plannedCategoryInput.value.trim();
  const description = plannedDescriptionInput.value.trim();
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

function renderPlannedItemsList(month) {
  plannedItemsTbody.innerHTML = '';
  const items = plannedItems.filter((p) => p.month === month);

  if (!items.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.textContent = 'Nenhum item de orçamento cadastrado para este mês.';
    td.className = 'hint small';
    tr.appendChild(td);
    plannedItemsTbody.appendChild(tr);
    return;
  }

  items.forEach((p) => {
    const tr = document.createElement('tr');

    const tdCat = document.createElement('td');
    tdCat.textContent = p.category;

    const tdDesc = document.createElement('td');
    tdDesc.textContent = p.description;

    const tdVal = document.createElement('td');
    tdVal.textContent = formatCurrency(p.amount);
    tdVal.classList.add('numeric');

    const tdOwner = document.createElement('td');
    tdOwner.textContent = p.owner;

    const tdFixed = document.createElement('td');
    tdFixed.textContent = p.fixed ? 'Sim' : 'Não';

    const tdActions = document.createElement('td');
    tdActions.classList.add('actions-col');
    const actions = document.createElement('div');
    actions.className = 'planned-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'action-btn';
    editBtn.textContent = 'Editar';
    editBtn.onclick = () => startEditPlanned(p.id);

    const delBtn = document.createElement('button');
    delBtn.className = 'action-btn danger';
    delBtn.textContent = 'Excluir';
    delBtn.onclick = () => deletePlanned(p.id);

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    tdActions.appendChild(actions);

    tr.appendChild(tdCat);
    tr.appendChild(tdDesc);
    tr.appendChild(tdVal);
    tr.appendChild(tdOwner);
    tr.appendChild(tdFixed);
    tr.appendChild(tdActions);

    plannedItemsTbody.appendChild(tr);
  });
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

  list
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((r) => {
      const item = document.createElement('div');
      item.className = 'receipt-item';

      const main = document.createElement('div');
      main.className = 'receipt-main';

      const line = document.createElement('div');
      line.className = 'receipt-line';
      line.textContent = `${r.merchant} • ${r.category}`;

      const meta = document.createElement('div');
      meta.className = 'receipt-meta';
      const dateStr = r.date.split('-').reverse().join('/');
      meta.textContent = `${dateStr} • ${r.owner}${r.fixed ? ' • Fixo' : ''}`;

      main.appendChild(line);
      main.appendChild(meta);

      const right = document.createElement('div');
      right.className = 'receipt-right';

      const amountDiv = document.createElement('div');
      amountDiv.className = 'receipt-amount';
      amountDiv.textContent = formatCurrency(r.amount);

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'receipt-actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'action-btn';
      editBtn.textContent = 'Editar';
      editBtn.onclick = () => startEditReceipt(r.id);

      const delBtn = document.createElement('button');
      delBtn.className = 'action-btn danger';
      delBtn.textContent = 'Excluir';
      delBtn.onclick = () => deleteReceipt(r.id);

      actionsDiv.appendChild(editBtn);
      actionsDiv.appendChild(delBtn);

      right.appendChild(amountDiv);
      right.appendChild(actionsDiv);

      item.appendChild(main);
      item.appendChild(right);

      receiptsList.appendChild(item);
    });
}

// ===== Comparativo por item (Orçamento x Notas) =====

const comparisonTbody = document.getElementById('comparison-tbody');

function updateComparisonTable() {
  const month = getCurrentMonth();
  comparisonTbody.innerHTML = '';
  if (!month) return;

  const plannedForMonth = plannedItems.filter((p) => p.month === month);
  const receiptsForMonth = receipts.filter((r) => r.date.startsWith(month));

  const map = new Map();

  plannedForMonth.forEach((p) => {
    const key = makeKey(p.category, p.description);
    if (!map.has(key)) {
      map.set(key, {
        category: p.category,
        description: p.description,
        planned: 0,
        actual: 0,
      });
    }
    map.get(key).planned += p.amount;
  });

  receiptsForMonth.forEach((r) => {
    const key = makeKey(r.category, r.merchant);
    if (!map.has(key)) {
      map.set(key, {
        category: r.category,
        description: r.merchant,
        planned: 0,
        actual: 0,
      });
    }
    map.get(key).actual += r.amount;
  });

  const rows = Array.from(map.values());

  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.textContent = 'Nenhum dado de orçamento ou notas para este mês.';
    td.className = 'hint small';
    tr.appendChild(td);
    comparisonTbody.appendChild(tr);
    return;
  }

  rows.sort((a, b) => a.category.localeCompare(b.category) || a.description.localeCompare(b.description));

  rows.forEach((row) => {
    const diff = row.planned - row.actual;

    const tr = document.createElement('tr');

    const tdCat = document.createElement('td');
    tdCat.textContent = row.category;

    const tdDesc = document.createElement('td');
    tdDesc.textContent = row.description;

    const tdPrev = document.createElement('td');
    tdPrev.textContent = formatCurrency(row.planned);
    tdPrev.classList.add('numeric');

    const tdReal = document.createElement('td');
    tdReal.textContent = formatCurrency(row.actual);
    tdReal.classList.add('numeric');

    const tdDiff = document.createElement('td');
    tdDiff.textContent = formatCurrency(diff);
    tdDiff.classList.add('numeric');
    tdDiff.classList.add(diff >= 0 ? 'positive' : 'negative');

    tr.appendChild(tdCat);
    tr.appendChild(tdDesc);
    tr.appendChild(tdPrev);
    tr.appendChild(tdReal);
    tr.appendChild(tdDiff);

    comparisonTbody.appendChild(tr);
  });
}

// ===== Resumo + tabela por categoria =====

function updateSummaryAndBudgetTables() {
  const month = getCurrentMonth();
  if (!month) return;

  const incomeForMonth = incomes.filter((i) => i.month === month);
  const totalIncome = incomeForMonth.reduce((s, i) => s + i.amount, 0);

  const plannedForMonth = plannedItems.filter((p) => p.month === month);
  const totalPlanned = plannedForMonth.reduce((s, p) => s + p.amount, 0);

  const actualForMonth = receipts.filter((r) => r.date.startsWith(month));
  const totalActual = actualForMonth.reduce((s, r) => s + r.amount, 0);

  const diffExpenses = totalPlanned - totalActual; // previsto - real (se quiser usar depois)
  const saldoPrevisto = totalIncome - totalPlanned;
  const saldoReal = totalIncome - totalActual;
  const diffSaldo = saldoReal - saldoPrevisto; // Economia / Estouro do mês

  summaryIncomeInline.textContent = formatCurrency(totalIncome);
  summaryTotalPlanned.textContent = formatCurrency(totalPlanned);
  summaryTotalActual.textContent = formatCurrency(totalActual);

  summarySaldoPrevisto.textContent = formatCurrency(saldoPrevisto);
  summarySaldoReal.textContent = formatCurrency(saldoReal);

  summaryDiffSaldo.textContent = formatCurrency(diffSaldo);
  summaryDiffSaldo.className = 'summary-value ' + (diffSaldo >= 0 ? 'positive' : 'negative');

  // Tabela por categoria
  const mapCat = {};

  plannedForMonth.forEach((p) => {
    if (!mapCat[p.category]) {
      mapCat[p.category] = { planned: 0, actual: 0 };
    }
    mapCat[p.category].planned += p.amount;
  });

  actualForMonth.forEach((r) => {
    if (!mapCat[r.category]) {
      mapCat[r.category] = { planned: 0, actual: 0 };
    }
    mapCat[r.category].actual += r.amount;
  });

  budgetTableBody.innerHTML = '';

  const cats = Object.keys(mapCat).sort((a, b) => a.localeCompare(b));
  cats.forEach((cat) => {
    const { planned, actual } = mapCat[cat];
    const diff = planned - actual; // Previsto − Real

    const tr = document.createElement('tr');

    const tdCat = document.createElement('td');
    tdCat.textContent = cat;

    const tdPlanned = document.createElement('td');
    tdPlanned.textContent = formatCurrency(planned);
    tdPlanned.classList.add('numeric');

    const tdActual = document.createElement('td');
    tdActual.textContent = formatCurrency(actual);
    tdActual.classList.add('numeric');

    const tdDiff = document.createElement('td');
    tdDiff.textContent = formatCurrency(diff);
    tdDiff.classList.add('numeric');
    tdDiff.classList.add(diff >= 0 ? 'positive' : 'negative');

    tr.appendChild(tdCat);
    tr.appendChild(tdPlanned);
    tr.appendChild(tdActual);
    tr.appendChild(tdDiff);

    budgetTableBody.appendChild(tr);
  });

  renderPlannedItemsList(month);
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

  categoriesChart = new Chart(chartsCanvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Previsto', data: plannedData },
        { label: 'Real', data: actualData },
      ],
    },
    options: {
      responsive: true,
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
    summaryIncomeInline.textContent = 'CAD 0,00';
    summaryTotalPlanned.textContent = 'CAD 0,00';
    summaryTotalActual.textContent = 'CAD 0,00';
    summarySaldoPrevisto.textContent = 'CAD 0,00';
    summarySaldoReal.textContent = 'CAD 0,00';
    summaryDiffSaldo.textContent = 'CAD 0,00';
    budgetTableBody.innerHTML = '';
    plannedItemsTbody.innerHTML = '';
    receiptsList.innerHTML = '';
    comparisonTbody.innerHTML = '';
    return;
  }

  updateSummaryAndBudgetTables();
  updateReceiptsView();
  updateComparisonTable();
  updateChartsView();
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
})();
