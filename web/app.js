// ===== Estado em memória =====

const plannedItems = []; // {id, month, category, description, amount, owner, fixed}
const receipts = []; // {id, date, category, merchant, amount, owner, fixed}
const incomes = []; // {month, owner, amount}

let nextId = 1;
const getNextId = () => nextId++;

// Tipos de gasto (linha vermelha da planilha)
const RECEIPT_TYPES = ['Transporte', 'Supermercado', 'Contas', 'Eventos', 'Jantar fora', 'Lojas', 'Assinaturas', 'Combustível', 'Cuidados pessoais'];

// Cadastro inicial de empresas por tipo
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

function formatCurrency(value) {
  const n = Number(value) || 0;
  return 'CAD ' + n.toFixed(2).replace('.', ',');
}

function parseAmount(str) {
  if (!str) return NaN;
  return parseFloat(String(str).replace(',', '.'));
}

function getCurrentMonthISO() {
  const today = new Date();
  return today.toISOString().slice(0, 7);
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

// ===== ORÇAMENTO MENSAL =====

const budgetMonthInput = document.getElementById('budget-month');
const incomeLuanaInput = document.getElementById('income-luana');
const incomeGabrielInput = document.getElementById('income-gabriel');
const btnSaveIncome = document.getElementById('btn-save-income');

const summaryIncomeTotal = document.getElementById('summary-income-total');
const summaryTotalPlanned = document.getElementById('summary-total-planned');
const summaryTotalActual = document.getElementById('summary-total-actual');
const summarySaldoPrevisto = document.getElementById('summary-saldo-previsto');
const summarySaldoReal = document.getElementById('summary-saldo-real');

const budgetTableBody = document.getElementById('budget-table-body');
const plannedItemsTbody = document.getElementById('planned-items-tbody');

const formPlanned = document.getElementById('form-planned');
const plannedSubmitBtn = document.querySelector("#form-planned button[type='submit']");
let editingPlannedId = null;

btnSaveIncome.addEventListener('click', () => {
  const month = budgetMonthInput.value;
  if (!month) {
    alert('Escolha o mês antes de salvar as rendas.');
    return;
  }

  const luana = parseAmount(incomeLuanaInput.value) || 0;
  const gabriel = parseAmount(incomeGabrielInput.value) || 0;

  // remove rendas antigas deste mês
  for (let i = incomes.length - 1; i >= 0; i--) {
    if (incomes[i].month === month) incomes.splice(i, 1);
  }
  incomes.push({ month, owner: 'Luana', amount: luana });
  incomes.push({ month, owner: 'Gabriel', amount: gabriel });

  updateBudgetView();
  alert('Rendas salvas para ' + month + '!');
});

formPlanned.addEventListener('submit', (e) => {
  e.preventDefault();

  const month = budgetMonthInput.value;
  if (!month) {
    alert('Escolha o mês de referência primeiro.');
    return;
  }

  const category = document.getElementById('planned-category').value.trim();
  const description = document.getElementById('planned-description').value.trim();
  const amount = parseAmount(document.getElementById('planned-amount').value);
  const owner = document.getElementById('planned-owner').value;
  const fixed = document.getElementById('planned-fixed').checked;

  if (!category || !description || isNaN(amount)) {
    alert('Preencha categoria, descrição e valor.');
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
  updateBudgetView();
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

  budgetMonthInput.value = item.month;
  document.getElementById('planned-category').value = item.category;
  document.getElementById('planned-description').value = item.description;
  document.getElementById('planned-amount').value = item.amount;
  document.getElementById('planned-owner').value = item.owner;
  document.getElementById('planned-fixed').checked = item.fixed;

  plannedSubmitBtn.textContent = 'Salvar alterações';
  updateBudgetView();
}

function deletePlanned(id) {
  const idx = plannedItems.findIndex((p) => p.id === id);
  if (idx >= 0) plannedItems.splice(idx, 1);
  if (editingPlannedId === id) resetPlannedForm();
  updateBudgetView();
}

function updateBudgetView() {
  const month = budgetMonthInput.value;
  if (!month) return;

  const incomeForMonth = incomes.filter((i) => i.month === month);
  const totalIncome = incomeForMonth.reduce((s, i) => s + i.amount, 0);

  const plannedForMonth = plannedItems.filter((p) => p.month === month);
  const totalPlanned = plannedForMonth.reduce((s, p) => s + p.amount, 0);

  const actualForMonth = receipts.filter((r) => r.date.startsWith(month));
  const totalActual = actualForMonth.reduce((s, r) => s + r.amount, 0);

  const saldoPrevisto = totalIncome - totalPlanned;
  const saldoReal = totalIncome - totalActual;

  summaryIncomeTotal.textContent = formatCurrency(totalIncome);
  summaryTotalPlanned.textContent = formatCurrency(totalPlanned);
  summaryTotalActual.textContent = formatCurrency(totalActual);
  summarySaldoPrevisto.textContent = formatCurrency(saldoPrevisto);
  summarySaldoReal.textContent = formatCurrency(saldoReal);

  // tabela agregada por categoria
  const mapCat = {};
  plannedForMonth.forEach((p) => {
    if (!mapCat[p.category]) mapCat[p.category] = { planned: 0, actual: 0 };
    mapCat[p.category].planned += p.amount;
  });
  actualForMonth.forEach((r) => {
    if (!mapCat[r.category]) mapCat[r.category] = { planned: 0, actual: 0 };
    mapCat[r.category].actual += r.amount;
  });

  budgetTableBody.innerHTML = '';
  Object.keys(mapCat).forEach((cat) => {
    const { planned, actual } = mapCat[cat];
    const diff = actual - planned;

    const tr = document.createElement('tr');

    const tdCat = document.createElement('td');
    tdCat.textContent = cat;

    const tdPlanned = document.createElement('td');
    tdPlanned.textContent = formatCurrency(planned);

    const tdActual = document.createElement('td');
    tdActual.textContent = formatCurrency(actual);

    const tdDiff = document.createElement('td');
    tdDiff.textContent = formatCurrency(diff);
    tdDiff.className = diff > 0 ? 'negative' : diff < 0 ? 'positive' : '';

    tr.appendChild(tdCat);
    tr.appendChild(tdPlanned);
    tr.appendChild(tdActual);
    tr.appendChild(tdDiff);

    budgetTableBody.appendChild(tr);
  });

  renderPlannedItemsList(month);
  updateReceiptsView();
  updateChartsView();
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

    const tdOwner = document.createElement('td');
    tdOwner.textContent = p.owner;

    const tdFixed = document.createElement('td');
    tdFixed.textContent = p.fixed ? 'Sim' : 'Não';

    const tdActions = document.createElement('td');
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'planned-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'action-btn';
    editBtn.textContent = 'Editar';
    editBtn.onclick = () => startEditPlanned(p.id);

    const delBtn = document.createElement('button');
    delBtn.className = 'action-btn danger';
    delBtn.textContent = 'Excluir';
    delBtn.onclick = () => deletePlanned(p.id);

    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(delBtn);
    tdActions.appendChild(actionsDiv);

    tr.appendChild(tdCat);
    tr.appendChild(tdDesc);
    tr.appendChild(tdVal);
    tr.appendChild(tdOwner);
    tr.appendChild(tdFixed);
    tr.appendChild(tdActions);

    plannedItemsTbody.appendChild(tr);
  });
}

// ===== LANÇAMENTO DE NOTAS FISCAIS =====

const formActual = document.getElementById('form-actual');
const actualSubmitBtn = document.getElementById('actual-submit-btn');
const receiptsMonthInput = document.getElementById('receipts-month');
const receiptsList = document.getElementById('receipts-list');

const receiptTypeChipsContainer = document.getElementById('receipt-type-chips');
const companyChipsContainer = document.getElementById('company-chips');
const formCompany = document.getElementById('form-company');
const companyNameInput = document.getElementById('company-name');

const actualCategoryInput = document.getElementById('actual-category');
const actualMerchantInput = document.getElementById('actual-merchant');

let selectedReceiptType = RECEIPT_TYPES[0];
let editingReceiptId = null;

// mostra empresas de um tipo
function renderCompaniesForType(type) {
  companyChipsContainer.innerHTML = '';
  const companies = companyDirectory[type] || [];

  if (!companies.length) {
    const msg = document.createElement('span');
    msg.className = 'hint small';
    msg.textContent = 'Nenhuma empresa cadastrada para este tipo ainda. Use o campo abaixo para adicionar.';
    companyChipsContainer.appendChild(msg);
    return;
  }

  companies.forEach((name) => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.textContent = name;
    chip.addEventListener('click', () => {
      actualMerchantInput.value = name;
    });
    companyChipsContainer.appendChild(chip);
  });
}

// cria chips de tipo
RECEIPT_TYPES.forEach((type, idx) => {
  const chip = document.createElement('div');
  chip.className = 'chip';
  chip.textContent = type;
  chip.addEventListener('click', () => {
    selectedReceiptType = type;
    actualCategoryInput.value = type;

    receiptTypeChipsContainer.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');

    renderCompaniesForType(type);
  });
  receiptTypeChipsContainer.appendChild(chip);
  if (idx === 0) chip.classList.add('active');
});

// cadastro de empresa (sem criar lançamento)
formCompany.addEventListener('submit', (e) => {
  e.preventDefault();

  const name = companyNameInput.value.trim();
  if (!name) {
    alert('Digite o nome da empresa para cadastrar.');
    return;
  }

  const type = selectedReceiptType || actualCategoryInput.value.trim();
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
  renderCompaniesForType(type);
});

// salvar / editar lançamento
formActual.addEventListener('submit', (e) => {
  e.preventDefault();

  const date = document.getElementById('actual-date').value;
  const category = actualCategoryInput.value.trim();
  const merchant = actualMerchantInput.value.trim();
  const amount = parseAmount(document.getElementById('actual-amount').value);
  const owner = document.getElementById('actual-owner').value;
  const fixed = document.getElementById('actual-fixed').checked;

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
  updateBudgetView(); // atualiza real, lista, gráfico
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

  document.getElementById('actual-date').value = r.date;
  actualCategoryInput.value = r.category;
  actualMerchantInput.value = r.merchant;
  document.getElementById('actual-amount').value = r.amount;
  document.getElementById('actual-owner').value = r.owner;
  document.getElementById('actual-fixed').checked = r.fixed;

  // Seleciona o tipo, se existir
  if (RECEIPT_TYPES.includes(r.category)) {
    selectedReceiptType = r.category;
    receiptTypeChipsContainer.querySelectorAll('.chip').forEach((c) => {
      c.classList.toggle('active', c.textContent === r.category);
    });
    renderCompaniesForType(r.category);
  }

  actualSubmitBtn.textContent = 'Salvar alterações';
}

function deleteReceipt(id) {
  const idx = receipts.findIndex((r) => r.id === id);
  if (idx >= 0) receipts.splice(idx, 1);
  if (editingReceiptId === id) resetReceiptForm();
  updateBudgetView();
}

function updateReceiptsView() {
  const month = receiptsMonthInput.value;
  if (!month) return;

  const list = receipts.filter((r) => r.date.startsWith(month));
  receiptsList.innerHTML = '';

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
      right.style.display = 'flex';
      right.style.flexDirection = 'column';
      right.style.alignItems = 'flex-end';
      right.style.gap = '4px';

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

receiptsMonthInput.addEventListener('change', updateReceiptsView);

// ===== GRÁFICOS (Chart.js) =====

let categoriesChart = null;
const chartsMonthInput = document.getElementById('charts-month');
const chartCanvas = document.getElementById('chart-categories');

function updateChartsView() {
  const month = chartsMonthInput.value;
  if (!month) return;

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

  const labels = Object.keys(mapCat);
  const plannedData = labels.map((cat) => mapCat[cat].planned);
  const actualData = labels.map((cat) => mapCat[cat].actual);

  if (categoriesChart) {
    categoriesChart.destroy();
  }

  categoriesChart = new Chart(chartCanvas, {
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
      scales: { y: { beginAtZero: true } },
    },
  });
}

chartsMonthInput.addEventListener('change', updateChartsView);

// ===== Inicialização =====

(function init() {
  const m = getCurrentMonthISO();

  budgetMonthInput.value = m;
  receiptsMonthInput.value = m;
  chartsMonthInput.value = m;

  // tipo inicial
  selectedReceiptType = RECEIPT_TYPES[0];
  actualCategoryInput.value = selectedReceiptType;
  renderCompaniesForType(selectedReceiptType);

  updateBudgetView();
  updateReceiptsView();
  updateChartsView();
})();

//registrar o service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch((err) => console.error('SW registration failed:', err));
  });
}
