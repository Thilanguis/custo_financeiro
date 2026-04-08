// ===== Estado em memória =====

const plannedItems = []; // {id, month, category, description, amount, owner, fixed}
const receipts = []; // {id, date, category, merchant, amount, owner, fixed}
const incomes = []; // {month, owner, amount}

// Memória para não resetar o agrupamento ao adicionar/excluir item (Padrão: tudo fechado)
const openPlannedCats = new Set();
const openReceiptCats = new Set();
const openDashboardCats = new Set();
const openOwnerCats = new Set();

let nextId = 1;
const getNextId = () => nextId++;

// Categorias e Empresas unificadas e dinâmicas
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

// Helper dinâmico
function getCategories() {
  return Object.keys(companyDirectory);
}

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

// 2. Evento do botão Carregar (Clona contas fixas do mês anterior)
btnLoadMonth.addEventListener('click', async () => {
  const targetMonth = getCurrentMonth();
  if (!targetMonth) return alert('Selecione um mês primeiro.');

  const originalText = btnLoadMonth.textContent;
  btnLoadMonth.textContent = 'Processando...';
  btnLoadMonth.disabled = true;

  try {
    const hasItems = plannedItems.some((p) => p.month === targetMonth);

    if (!hasItems) {
      const [year, month] = targetMonth.split('-');
      let prevDate = new Date(year, parseInt(month) - 2, 1);
      const prevMonthStr = prevDate.getFullYear() + '-' + String(prevDate.getMonth() + 1).padStart(2, '0');

      const prevItems = await FinanceAPI.getPlannedOnce(prevMonthStr);
      const fixedItemsToClone = prevItems.filter((p) => p.fixed);

      for (const item of fixedItemsToClone) {
        const newItem = { ...item, month: targetMonth };
        delete newItem.id;
        await FinanceAPI.savePlanned(targetMonth, newItem);

        if (item.isStatic) {
          const today = new Date().toISOString().split('T')[0];
          const launchDate = today.startsWith(targetMonth) ? today : `${targetMonth}-01`;
          const receiptData = {
            date: launchDate,
            category: item.category,
            merchant: item.description,
            amount: item.amount,
            owner: item.owner,
            isStatic: true, // ADICIONADO "isStatic: true" ABAIXO
          };
          await FinanceAPI.saveReceipt(targetMonth, receiptData);
        }
      }

      if (fixedItemsToClone.length > 0) {
        alert(`${fixedItemsToClone.length} contas fixas copiadas de ${prevMonthStr}!`);
      } else {
        alert(`Nenhuma conta marcada como "Fixo" encontrada em ${prevMonthStr}.`);
      }
    } else {
      alert('Este mês já possui itens. A cópia automática só funciona em meses vazios.');
    }

    loadIncomeToInputs(targetMonth);
  } catch (error) {
    console.error('Erro ao clonar:', error);
    alert('Erro ao carregar mês.');
  } finally {
    btnLoadMonth.textContent = originalText;
    btnLoadMonth.disabled = false;
  }
});

// 3. Novo Salvar Rendas
btnSaveIncome.addEventListener('click', async () => {
  const month = getCurrentMonth();
  if (!month) return alert('Selecione o mês.');

  const luana = parseAmount(incomeLuanaInput.value) || 0;
  const gabriel = parseAmount(incomeGabrielInput.value) || 0;

  btnSaveIncome.textContent = 'Salvando...';
  btnSaveIncome.disabled = true;

  await FinanceAPI.saveIncome(month, luana, gabriel);

  const index = incomes.findIndex((i) => i.month === month);
  if (index !== -1) {
    incomes[index] = { month, luana, gabriel };
  } else {
    incomes.push({ month, luana, gabriel });
  }

  btnSaveIncome.textContent = 'Salvar Rendas';
  btnSaveIncome.disabled = false;
  alert(`Rendas de ${month} salvas!`);
  refreshAll();
});

// 4. Helper para o cálculo de saldo
function getIncomeTotalForMonth(month) {
  const exact = incomes.find((i) => i.month === month);
  if (exact) return (exact.luana || 0) + (exact.gabriel || 0);
  const past = incomes.filter((i) => i.month < month).sort((a, b) => b.month.localeCompare(a.month));
  return past.length > 0 ? past[0].luana + past[0].gabriel : 0;
}

monthInput.addEventListener('change', () => {
  const newMonth = getCurrentMonth();
  syncData(newMonth);

  // Atualiza a data do form de notas fiscais ao trocar o mês
  if (actualDateInput && !editingReceiptId) {
    const today = new Date().toISOString().split('T')[0];
    actualDateInput.value = today.startsWith(newMonth) ? today : `${newMonth}-01`;
  }
});

// ===== Chips de tipos & empresas (uso em 2 telas) =====

const plannedTypeChips = document.getElementById('planned-type-chips');
const plannedCompanyChips = document.getElementById('planned-company-chips');
const receiptTypeChips = document.getElementById('receipt-type-chips');
const receiptCompanyChips = document.getElementById('receipt-company-chips');

let selectedPlannedType = getCategories()[0];
let selectedReceiptType = getCategories()[0];
let isEditMode = false; // Flag para interceptar os cliques

function renderTypeChips(container, selectedType, onSelect) {
  container.innerHTML = '';
  const categories = getCategories();

  categories.forEach((type) => {
    const chip = document.createElement('div');
    chip.className = 'chip' + (type === selectedType ? ' active' : '') + (isEditMode ? ' edit-mode' : '');
    chip.textContent = type;
    chip.addEventListener('click', () => {
      if (isEditMode) handleEditCategory(type);
      else onSelect(type);
    });
    container.appendChild(chip);
  });

  // Botão embutido e minimalista
  const manageChip = document.createElement('div');
  manageChip.className = 'chip special-action';
  manageChip.style.background = isEditMode ? '#62c462' : 'transparent';
  manageChip.style.color = isEditMode ? '#0b0b10' : '#fddf7b';
  manageChip.style.border = '1px dashed #fddf7b';
  manageChip.textContent = isEditMode ? '✅ Concluir Edição' : '⚙️ Gerenciar Tags';
  manageChip.addEventListener('click', () => {
    isEditMode = !isEditMode;
    updatePlannedChips();
    updateReceiptChips();
  });
  container.appendChild(manageChip);
}

function renderCompanyChips(container, type, onSelectCompany) {
  container.innerHTML = '';
  const companies = companyDirectory[type] || [];

  if (!companies.length && !isEditMode) {
    const span = document.createElement('span');
    span.className = 'hint small';
    span.textContent = 'Nenhuma empresa cadastrada para este tipo ainda. Digite abaixo para adicionar.';
    container.appendChild(span);
    return;
  }

  companies.forEach((name) => {
    const chip = document.createElement('div');
    chip.className = 'chip chip-company' + (isEditMode ? ' edit-mode' : '');
    chip.textContent = name;
    chip.addEventListener('click', () => {
      if (isEditMode) handleEditCompany(type, name);
      else onSelectCompany(name);
    });
    container.appendChild(chip);
  });
}

// Funções de CRUD das Tags (Nativo e leve)
async function handleEditCategory(oldName) {
  const newName = prompt(`Renomear a categoria "${oldName}"?\n\nDeixe em branco e clique em OK para EXCLUIR.`, oldName);
  if (newName === null) return;

  const trimmed = newName.trim();
  if (trimmed === '') {
    if (confirm(`Atenção: Excluir a categoria "${oldName}" vai sumir com todas as empresas dentro dela. Continuar?`)) {
      delete companyDirectory[oldName];
    }
  } else if (trimmed !== oldName) {
    companyDirectory[trimmed] = companyDirectory[oldName];
    delete companyDirectory[oldName];
    if (selectedPlannedType === oldName) selectedPlannedType = trimmed;
    if (selectedReceiptType === oldName) selectedReceiptType = trimmed;
  }

  updatePlannedChips();
  updateReceiptChips();
  await FinanceAPI.saveCompanies(companyDirectory);
}

async function handleEditCompany(category, oldName) {
  const newName = prompt(`Renomear a empresa "${oldName}"?\n\nDeixe em branco e clique em OK para EXCLUIR.`, oldName);
  if (newName === null) return;

  const trimmed = newName.trim().toUpperCase();
  if (trimmed === '') {
    if (confirm(`Excluir a empresa "${oldName}"?`)) {
      companyDirectory[category] = companyDirectory[category].filter((c) => c !== oldName);
    }
  } else if (trimmed !== oldName) {
    const idx = companyDirectory[category].indexOf(oldName);
    if (idx !== -1) companyDirectory[category][idx] = trimmed;
  }

  updatePlannedChips();
  updateReceiptChips();
  await FinanceAPI.saveCompanies(companyDirectory);
}

function updatePlannedChips() {
  renderTypeChips(plannedTypeChips, selectedPlannedType, (type) => {
    selectedPlannedType = type;
    plannedCategoryInput.value = type;
    plannedDescriptionInput.value = ''; // Limpa a empresa ao trocar de categoria
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
    actualMerchantInput.value = ''; // Limpa a empresa ao trocar de categoria
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
const plannedStaticCheckbox = document.getElementById('planned-static');
const labelPlannedStatic = document.getElementById('label-planned-static');
const plannedSubmitBtn = document.getElementById('planned-submit-btn');

// Regra: Estático só liga se Fixo estiver marcado
plannedFixedCheckbox.addEventListener('change', (e) => {
  if (e.target.checked) {
    plannedStaticCheckbox.disabled = false;
    labelPlannedStatic.style.opacity = '1';
  } else {
    plannedStaticCheckbox.disabled = true;
    plannedStaticCheckbox.checked = false;
    labelPlannedStatic.style.opacity = '0.5';
  }
});

const budgetTableBody = document.getElementById('budget-table-body');
const plannedItemsList = document.getElementById('planned-items-list');

const formCompany = document.getElementById('form-company');
const companyNameInput = document.getElementById('company-name');

let editingPlannedId = null;

// Auto Register Assíncrono
async function autoRegisterCompany(type, name) {
  const t = type.trim();
  const n = name.trim().toUpperCase();

  if (!t || !n) return;

  if (!companyDirectory[t]) {
    companyDirectory[t] = [];
  }

  if (!companyDirectory[t].includes(n)) {
    companyDirectory[t].push(n);
    updatePlannedChips();
    updateReceiptChips();
    await FinanceAPI.saveCompanies(companyDirectory);
  }
}

formPlanned.addEventListener('submit', async (e) => {
  e.preventDefault();
  const month = getCurrentMonth();
  if (!month) return alert('Escolha o mês de referência no topo primeiro.');

  const category = plannedCategoryInput.value.trim();
  const description = plannedDescriptionInput.value.trim();
  const amount = parseAmount(plannedAmountInput.value);
  const owner = plannedOwnerSelect.value;
  const fixed = plannedFixedCheckbox.checked;
  const isStatic = plannedStaticCheckbox.checked;

  if (!category || !description || isNaN(amount)) return alert('Preencha categoria, descrição e valor.');

  plannedSubmitBtn.textContent = 'Salvando...';
  plannedSubmitBtn.disabled = true;

  await autoRegisterCompany(category, description);

  // Pega os dados antigos ANTES de salvar, para podermos achar a nota fiscal correspondente
  let oldItem = null;
  if (editingPlannedId !== null) {
    oldItem = plannedItems.find((p) => p.id === editingPlannedId);
  }

  const itemData = { category, description, amount, owner, fixed, isStatic, month };
  if (editingPlannedId !== null) itemData.id = editingPlannedId;

  await FinanceAPI.savePlanned(month, itemData);

  if (editingPlannedId === null) {
    // Lança nota fiscal automática se for um item NOVO e ESTÁTICO
    if (isStatic) {
      const today = new Date().toISOString().split('T')[0];
      const launchDate = today.startsWith(month) ? today : `${month}-01`;
      const receiptData = { date: launchDate, category, merchant: description, amount, owner, isStatic: true };
      await FinanceAPI.saveReceipt(month, receiptData);
    }
  } else if (oldItem) {
    // Se for uma EDIÇÃO, tenta achar a nota fiscal usando o nome/categoria antigos
    const linkedReceipt = receipts.find((r) => r.date.startsWith(month) && r.category === oldItem.category && r.merchant === oldItem.description);

    if (linkedReceipt) {
      // Atualiza a nota fiscal existente com os novos dados (valor, nome e a flag estática)
      const updatedReceipt = {
        id: linkedReceipt.id,
        date: linkedReceipt.date,
        category: category,
        merchant: description,
        amount: amount,
        owner: owner,
        isStatic: isStatic,
      };
      await FinanceAPI.saveReceipt(month, updatedReceipt);
    } else if (isStatic) {
      // Se a nota fiscal não existia, mas na edição você marcou "Estático" agora, ele cria
      const today = new Date().toISOString().split('T')[0];
      const launchDate = today.startsWith(month) ? today : `${month}-01`;
      const receiptData = { date: launchDate, category, merchant: description, amount, owner, isStatic: true };
      await FinanceAPI.saveReceipt(month, receiptData);
    }
  }

  plannedSubmitBtn.textContent = 'Adicionar ao Orçamento';
  plannedSubmitBtn.disabled = false;
  resetPlannedForm();
});

function resetPlannedForm() {
  formPlanned.reset();
  editingPlannedId = null;
  plannedSubmitBtn.textContent = 'Adicionar ao Orçamento';

  plannedStaticCheckbox.disabled = true;
  labelPlannedStatic.style.opacity = '0.5';

  selectedPlannedType = getCategories()[0] || '';
  plannedCategoryInput.value = selectedPlannedType;
  updatePlannedChips();
}

function startEditPlanned(id) {
  const item = plannedItems.find((p) => p.id === id);
  if (!item) return;
  editingPlannedId = id;

  // Removido o monthInput.value que estava puxando sua tela pro mês atual sozinho
  plannedCategoryInput.value = item.category;
  plannedDescriptionInput.value = item.description;
  plannedAmountInput.value = item.amount;
  plannedOwnerSelect.value = item.owner;

  plannedFixedCheckbox.checked = item.fixed;
  plannedStaticCheckbox.disabled = !item.fixed;
  labelPlannedStatic.style.opacity = item.fixed ? '1' : '0.5';
  plannedStaticCheckbox.checked = item.isStatic || false;

  if (getCategories().includes(item.category)) {
    selectedPlannedType = item.category;
    updatePlannedChips();
  }

  plannedSubmitBtn.textContent = 'Salvar alterações';
  // Removido o refreshAll() que fazia a tela piscar desnecessariamente
}

async function deletePlanned(id) {
  const p = plannedItems.find((x) => x.id === id);
  if (!p) return;

  const msg = p.isStatic ? 'Este item é ESTÁTICO. Excluí-lo aqui também apagará a Nota Fiscal vinculada. Deseja continuar?' : 'Excluir este item do Orçamento?';

  if (!confirm(msg)) return;

  const month = getCurrentMonth();
  await FinanceAPI.deletePlanned(month, id);

  // Exclusão em cadeia nas Notas Fiscais
  if (p.isStatic) {
    const receiptToDelete = receipts.find((r) => r.date.startsWith(month) && r.category === p.category && r.merchant === p.description && r.isStatic);
    if (receiptToDelete) {
      await FinanceAPI.deleteReceipt(month, receiptToDelete.id);
    }
  }

  if (editingPlannedId === id) resetPlannedForm();
}

async function deleteReceipt(id) {
  const r = receipts.find((x) => x.id === id);
  if (!r) return;

  const msg = r.isStatic ? 'Esta nota fiscal é ESTÁTICA. Excluí-la aqui também apagará a previsão no Orçamento. Deseja continuar?' : 'Excluir esta nota fiscal?';

  if (!confirm(msg)) return;

  const month = r.date.substring(0, 7);
  await FinanceAPI.deleteReceipt(month, id);

  // Exclusão em cadeia no Orçamento
  if (r.isStatic) {
    const plannedToDelete = plannedItems.find((p) => p.month === month && p.category === r.category && p.description === r.merchant && p.isStatic);
    if (plannedToDelete) {
      await FinanceAPI.deletePlanned(month, plannedToDelete.id);
    }
  }

  if (editingReceiptId === id) resetReceiptForm();
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
      // Ordena do valor mais alto para o mais baixo
      const groupItems = grouped[cat].sort((a, b) => b.amount - a.amount);
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
            <div class="receipt-meta">Resp: ${p.owner}${p.fixed ? (p.isStatic ? ' • Fixo & Estático' : ' • Fixo') : ''}</div>
          </div>
          <div class="receipt-right">
            <div class="receipt-amount">${formatCurrency(p.amount)}</div>
            <div class="receipt-actions">
              <button class="action-btn" onclick="startEditPlanned('${p.id}')">Editar</button>
              <button class="action-btn danger" onclick="deletePlanned('${p.id}')">Excluir</button>
            </div>
          </div>
        `;
          plannedItemsList.appendChild(item);
        });
      }
    });

  // Calcula o subtotal apenas dos itens marcados como fixos
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
const receiptsList = document.getElementById('receipts-list');

let editingReceiptId = null;

// Sincroniza a tag ativa com o que for digitado no campo Categoria
plannedCategoryInput.addEventListener('input', (e) => {
  selectedPlannedType = e.target.value.trim();
  updatePlannedChips();
});

actualCategoryInput.addEventListener('input', (e) => {
  selectedReceiptType = e.target.value.trim();
  updateReceiptChips();
});

formActual.addEventListener('submit', async (e) => {
  e.preventDefault();
  const date = actualDateInput.value;
  const inputMonth = date.substring(0, 7);
  const currentViewMonth = getCurrentMonth();

  if (inputMonth !== currentViewMonth) {
    return alert(`A data da nota fiscal não pertence ao mês selecionado no topo (${currentViewMonth}).`);
  }

  const month = inputMonth;
  const category = actualCategoryInput.value.trim();
  const merchant = actualMerchantInput.value.trim();
  const amount = parseAmount(actualAmountInput.value);
  const owner = actualOwnerSelect.value;

  if (!date || !category || !merchant || isNaN(amount)) return alert('Preencha data, categoria, nome e valor.');

  actualSubmitBtn.textContent = 'Salvando...';
  actualSubmitBtn.disabled = true;

  await autoRegisterCompany(category, merchant);

  const itemData = { date, category, merchant, amount, owner };
  if (editingReceiptId !== null) itemData.id = editingReceiptId;

  await FinanceAPI.saveReceipt(month, itemData);

  actualSubmitBtn.textContent = 'Salvar Nota Fiscal';
  actualSubmitBtn.disabled = false;
  resetReceiptForm();
});

function resetReceiptForm() {
  formActual.reset();
  editingReceiptId = null;
  actualSubmitBtn.textContent = 'Salvar Nota Fiscal';

  // Reseta a tag e o input para o padrão
  selectedReceiptType = getCategories()[0] || '';
  actualCategoryInput.value = selectedReceiptType;
  actualMerchantInput.value = ''; // Limpa a empresa ao trocar de categoria

  // Ajusta a data padrão com base no mês selecionado no topo
  const selectedMonth = getCurrentMonth();
  const today = new Date().toISOString().split('T')[0];
  actualDateInput.value = today.startsWith(selectedMonth) ? today : `${selectedMonth}-01`;

  updateReceiptChips();
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

  if (getCategories().includes(r.category)) {
    selectedReceiptType = r.category;
    updateReceiptChips();
  }

  actualSubmitBtn.textContent = 'Salvar alterações';
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
      // Ordena do valor mais alto para o mais baixo (ignorando a data)
      const groupItems = grouped[cat].sort((a, b) => b.amount - a.amount);
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
            <div class="receipt-meta">${r.date.split('-').reverse().join('/')} • ${r.owner}${r.isStatic ? ' • Estático' : ''}</div>
          </div>
          <div class="receipt-right">
            <div class="receipt-amount">${formatCurrency(r.amount)}</div>
            <div class="receipt-actions">
              <button class="action-btn" onclick="startEditReceipt('${r.id}')">Editar</button>
              <button class="action-btn danger" onclick="deleteReceipt('${r.id}')">Excluir</button>
            </div>
          </div>
        `;
          receiptsList.appendChild(item);
        });
      }
    });

  // Define o que é custo de vida base (O resto entra como lazer/supérfluo automaticamente)
  const categoriasEssenciais = ['Contas', 'Supermercado', 'Transporte', 'Combustível', 'Saúde', 'Educação', 'Cuidados pessoais'];

  let totalEssencial = 0;
  let totalLazer = 0;

  list.forEach((r) => {
    if (categoriasEssenciais.includes(r.category)) {
      totalEssencial += r.amount;
    } else {
      totalLazer += r.amount;
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
  const ownerContainer = document.getElementById('owner-breakdown-list');

  if (tbody) tbody.innerHTML = '';
  if (ownerContainer) ownerContainer.innerHTML = '';

  if (!month) return;

  const plannedForMonth = plannedItems.filter((p) => p.month === month);
  const receiptsForMonth = receipts.filter((r) => r.date.startsWith(month));

  const categoriasEssenciais = ['Contas', 'Supermercado', 'Transporte', 'Combustível', 'Saúde', 'Casa', 'Pets', 'Educação', 'Cuidados pessoais'];
  let totalEssencialReal = 0;
  let totalLazerReal = 0;

  receiptsForMonth.forEach((r) => {
    if (categoriasEssenciais.includes(r.category)) {
      totalEssencialReal += r.amount;
    } else {
      totalLazerReal += r.amount;
    }
  });

  const elEssencial = document.getElementById('dash-essencial-real');
  const elLazer = document.getElementById('dash-lazer-real');
  if (elEssencial) elEssencial.textContent = formatCurrency(totalEssencialReal);
  if (elLazer) elLazer.textContent = formatCurrency(totalLazerReal);

  // === RENDERIZAÇÃO DOS GASTOS POR RESPONSÁVEL ===
  if (ownerContainer) {
    const ownerMap = {
      Gabriel: { total: 0, essencial: 0, lazer: 0 },
      Luana: { total: 0, essencial: 0, lazer: 0 },
      Ambos: { total: 0, essencial: 0, lazer: 0 },
    };

    receiptsForMonth.forEach((r) => {
      const owner = r.owner || 'Ambos';
      if (!ownerMap[owner]) ownerMap[owner] = { total: 0, essencial: 0, lazer: 0 };

      ownerMap[owner].total += r.amount;
      if (categoriasEssenciais.includes(r.category)) {
        ownerMap[owner].essencial += r.amount;
      } else {
        ownerMap[owner].lazer += r.amount;
      }
    });

    const ownersArray = ['Gabriel', 'Luana', 'Ambos'];
    let hasOwnerData = false;

    ownersArray.forEach((owner) => {
      const data = ownerMap[owner];
      if (data.total === 0) return;
      hasOwnerData = true;

      const isOpen = openOwnerCats.has(owner);

      const headerDiv = document.createElement('div');
      headerDiv.className = 'group-header-div';
      headerDiv.innerHTML = `
        <span>${isOpen ? '▼' : '▶'} ${owner}</span>
        <span style="color:#a6a6c0; font-size:0.85rem; font-weight:normal;">${formatCurrency(data.total)}</span>
      `;

      headerDiv.onclick = () => {
        if (isOpen) openOwnerCats.delete(owner);
        else openOwnerCats.add(owner);
        updateDashboardView();
      };

      ownerContainer.appendChild(headerDiv);

      if (isOpen) {
        const detailDiv = document.createElement('div');
        detailDiv.style.background = '#141423';
        detailDiv.style.padding = '8px 12px';
        detailDiv.style.borderRadius = '0 0 6px 6px';
        detailDiv.style.marginBottom = '6px';
        detailDiv.style.marginTop = '-2px';
        detailDiv.style.fontSize = '0.85rem';

        detailDiv.innerHTML = `
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="color: #c3c3d5;">↳ Essenciais</span>
            <span style="color: #f5f5f5; font-weight: 500;">${formatCurrency(data.essencial)}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #c3c3d5;">↳ Lazer e Outros</span>
            <span style="color: #f7c84a; font-weight: 500;">${formatCurrency(data.lazer)}</span>
          </div>
        `;
        ownerContainer.appendChild(detailDiv);
      }
    });

    if (!hasOwnerData) {
      ownerContainer.innerHTML = "<p class='hint small' style='margin-top: 8px;'>Nenhum lançamento para este mês.</p>";
    }
  }
  // ==============================================

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

    // CORREÇÃO: Arredondamento para forçar o zero absoluto e ativar a cor amarela
    const diffCat = Math.round((data.planned - data.actual) * 100) / 100;
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

    // CORREÇÃO: A barra agora sempre existe no fundo, mesmo se os valores forem zero
    let percent = 0;
    if (data.planned > 0) {
      percent = (data.actual / data.planned) * 100;
    } else if (data.actual > 0) {
      percent = 100;
    }

    const progressContainer = document.createElement('div');
    progressContainer.className = 'progress-bar-container';
    const progressFill = document.createElement('div');
    progressFill.className = 'progress-bar-fill';
    progressFill.style.width = Math.min(percent, 100) + '%';

    // Arredondamento seguro para evitar bugs decimais do JavaScript
    const roundedPercent = Math.round(percent * 100) / 100;

    // Verde se não estourou, Amarelo se bateu exato, Vermelho se passou
    if (roundedPercent < 100) progressFill.classList.add('progress-safe');
    else if (roundedPercent === 100) progressFill.classList.add('progress-warning');
    else progressFill.classList.add('progress-danger');

    progressContainer.appendChild(progressFill);
    catContainer.appendChild(progressContainer);

    tdCatName.appendChild(catContainer);

    const tdCatPrev = document.createElement('td');
    tdCatPrev.className = 'numeric';
    tdCatPrev.textContent = formatCurrency(data.planned);

    const tdCatReal = document.createElement('td');
    tdCatReal.className = 'numeric';
    tdCatReal.textContent = formatCurrency(data.actual);

    const tdCatDiff = document.createElement('td');
    // Aplica a cor da Diferença (Amarelo = neutral quando for exatamente zero)
    tdCatDiff.className = 'numeric ' + (diffCat > 0 ? 'positive' : diffCat === 0 ? 'neutral' : 'negative');
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
        // CORREÇÃO: Arredondamento nos itens filhos também
        const diffItem = Math.round((item.planned - item.actual) * 100) / 100;

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
        tdItemDiff.className = 'numeric ' + (diffItem > 0 ? 'positive' : diffItem === 0 ? 'neutral' : 'negative');
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
  const totalDiff = Math.round((sumPlanned - sumActual) * 100) / 100;
  document.getElementById('dashboard-total-planned').textContent = formatCurrency(sumPlanned);
  document.getElementById('dashboard-total-actual').textContent = formatCurrency(sumActual);

  const tdDiffTotal = document.getElementById('dashboard-total-diff');
  tdDiffTotal.textContent = formatCurrency(totalDiff);
  tdDiffTotal.className = 'numeric ' + (totalDiff > 0 ? 'positive' : totalDiff === 0 ? 'neutral' : 'negative');
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

// ===== Inicialização e Autenticação =====

const loginOverlay = document.getElementById('login-overlay');
const formLogin = document.getElementById('form-login');
const btnLogout = document.getElementById('btn-logout');
const btnDoLogin = document.getElementById('btn-do-login');

function syncData(month) {
  if (!month) return;

  FinanceAPI.clearListeners(); // Limpa as conexões abertas do mês anterior

  btnLoadMonth.textContent = 'Sincronizando...';
  btnLoadMonth.disabled = true;

  // 1. Escuta Empresas em tempo real
  FinanceAPI.listenCompanies((comps) => {
    if (comps && Object.keys(comps).length > 0) {
      Object.keys(companyDirectory).forEach((key) => delete companyDirectory[key]);
      Object.assign(companyDirectory, comps);
      updatePlannedChips();
      updateReceiptChips();
    }
  });

  // 2. Escuta Rendas em tempo real
  FinanceAPI.listenIncome(month, (inc) => {
    const idx = incomes.findIndex((i) => i.month === month);
    if (inc) {
      if (idx >= 0) incomes[idx] = { month, ...inc };
      else incomes.push({ month, ...inc });
    }
    loadIncomeToInputs(month);
    refreshAll();
  });

  // 3. Escuta Orçamento Previsto em tempo real
  FinanceAPI.listenPlanned(month, (pItems) => {
    for (let i = plannedItems.length - 1; i >= 0; i--) {
      if (plannedItems[i].month === month) plannedItems.splice(i, 1);
    }
    plannedItems.push(...pItems);
    refreshAll();
  });

  // 4. Escuta Notas Fiscais em tempo real
  FinanceAPI.listenReceipts(month, (rItems) => {
    for (let i = receipts.length - 1; i >= 0; i--) {
      if (receipts[i].date.startsWith(month)) receipts.splice(i, 1);
    }
    receipts.push(...rItems);
    refreshAll();

    // Libera o botão após o primeiro carregamento
    btnLoadMonth.textContent = 'Carregar';
    btnLoadMonth.disabled = false;
  });
}

function initAppUI() {
  const m = getCurrentMonthISO();
  monthInput.value = m;

  selectedPlannedType = getCategories()[0] || '';
  selectedReceiptType = getCategories()[0] || '';

  // Força os inputs a começarem preenchidos com a tag ativa inicial
  plannedCategoryInput.value = selectedPlannedType;
  actualCategoryInput.value = selectedReceiptType;

  // Define a data de hoje como padrão no formulário de Notas Fiscais
  const today = new Date().toISOString().split('T')[0];
  actualDateInput.value = today;

  updatePlannedChips();
  updateReceiptChips();

  syncData(m);
}

// Escuta mudanças no Firebase Auth
FinanceAPI.onAuthStateChanged((user) => {
  if (user) {
    // Logado
    loginOverlay.style.display = 'none';
    btnLogout.style.display = 'block';

    // Inicia a UI agora que estamos autenticados
    initAppUI();

    // O próximo passo será carregar os dados reais do banco aqui.
    console.log('Usuário logado:', user.email);
  } else {
    // Deslogado
    loginOverlay.style.display = 'flex';
    btnLogout.style.display = 'none';
  }
});

formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const pass = document.getElementById('login-password').value;
  const originalText = btnDoLogin.textContent;

  try {
    btnDoLogin.textContent = 'Autenticando...';
    btnDoLogin.disabled = true;
    await FinanceAPI.login(email, pass);
  } catch (error) {
    alert('Erro no login: ' + error.message);
  } finally {
    btnDoLogin.textContent = originalText;
    btnDoLogin.disabled = false;
  }
});

btnLogout.addEventListener('click', async () => {
  await FinanceAPI.logout();
});

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
