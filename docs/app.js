// ===== UI: Notificações e Modais Customizados =====

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, 3000);
}

function showConfirm(message, isDanger = false) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';
    overlay.innerHTML = `
      <div class="custom-modal">
        <p>${message.replace(/\n/g, '<br>')}</p>
        <div class="custom-modal-actions">
          <button class="custom-modal-btn cancel">Cancelar</button>
          <button class="custom-modal-btn ${isDanger ? 'danger' : 'confirm'}">Confirmar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    void overlay.offsetWidth; // Reflow
    overlay.classList.add('active');

    const btnCancel = overlay.querySelector('.cancel');
    const btnConfirm = overlay.querySelector('.confirm, .danger');

    const close = (result) => {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 200);
      resolve(result);
    };

    btnCancel.onclick = () => close(false);
    btnConfirm.onclick = () => close(true);
  });
}

function showPrompt(message, defaultValue = '') {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';
    overlay.innerHTML = `
      <div class="custom-modal">
        <p>${message.replace(/\n/g, '<br>')}</p>
        <input type="text" id="prompt-input" value="${defaultValue}" />
        <div class="custom-modal-actions">
          <button class="custom-modal-btn cancel">Cancelar</button>
          <button class="custom-modal-btn confirm">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('#prompt-input');
    input.focus();
    input.setSelectionRange(0, input.value.length);

    void overlay.offsetWidth; // Reflow
    overlay.classList.add('active');

    const btnCancel = overlay.querySelector('.cancel');
    const btnConfirm = overlay.querySelector('.confirm');

    const close = (result) => {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 200);
      resolve(result);
    };

    btnCancel.onclick = () => close(null);
    btnConfirm.onclick = () => close(input.value);
    input.onkeydown = (e) => {
      if (e.key === 'Enter') close(input.value);
      if (e.key === 'Escape') close(null);
    };
  });
}

// ===== Estado em memória =====

const plannedItems = [];
const receipts = [];
const incomes = [];
let paymentMethods = [];

const openPlannedCats = new Set();
const openReceiptCats = new Set();
const openDashboardCats = new Set();
const openOwnerCats = new Set();

let nextId = 1;
const getNextId = () => nextId++;

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

function getCategories() {
  return Object.keys(companyDirectory);
}

// ===== Utilitários =====

function formatCurrency(value) {
  const n = Number(value) || 0;
  const fixed = n.toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return 'CAD ' + withThousands + ',' + decPart;
}

function parseAmount(str) {
  if (str === null || str === undefined || str === '') return NaN;
  return parseFloat(String(str).replace(',', '.'));
}

function getLocalDateString() {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d - offset).toISOString().split('T')[0];
}

function getCurrentMonthISO() {
  return getLocalDateString().slice(0, 7);
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
const btnTogglePayments = document.getElementById('btn-toggle-payments');
const paymentsPanel = document.getElementById('payments-panel');
const btnToggleReimbursement = document.getElementById('btn-toggle-reimbursement');
const reimbursementPanel = document.getElementById('reimbursement-panel');

btnToggleIncome.addEventListener('click', () => {
  paymentsPanel.style.display = 'none';
  reimbursementPanel.style.display = 'none';
  const isHidden = incomePanel.style.display === 'none';
  incomePanel.style.display = isHidden ? 'block' : 'none';
});

btnTogglePayments.addEventListener('click', () => {
  incomePanel.style.display = 'none';
  reimbursementPanel.style.display = 'none';
  const isHidden = paymentsPanel.style.display === 'none';
  paymentsPanel.style.display = isHidden ? 'block' : 'none';
});

btnToggleReimbursement.addEventListener('click', () => {
  incomePanel.style.display = 'none';
  paymentsPanel.style.display = 'none';
  const isHidden = reimbursementPanel.style.display === 'none';
  reimbursementPanel.style.display = isHidden ? 'block' : 'none';
});

// === LÓGICA DE REEMBOLSO ===
const formReimbursement = document.getElementById('form-reimbursement');
formReimbursement.addEventListener('submit', async (e) => {
  e.preventDefault();
  const date = document.getElementById('reimb-date').value;
  const inputMonth = date.substring(0, 7);
  const currentViewMonth = getCurrentMonth();

  if (inputMonth !== currentViewMonth) {
    return showToast(`A data do reembolso não pertence ao mês selecionado (${currentViewMonth}).`, 'error');
  }

  const category = document.getElementById('reimb-category').value.trim();
  const merchant = document.getElementById('reimb-merchant').value.trim();
  const amount = parseAmount(document.getElementById('reimb-amount').value);
  const owner = document.getElementById('reimb-owner').value;
  const paymentMethodId = document.getElementById('reimb-payment').value;
  const observation = document.getElementById('reimb-observation').value.trim();

  if (!date || !category || !merchant || isNaN(amount) || !paymentMethodId) {
    return showToast('Preencha data, categoria, origem, valor e selecione onde caiu.', 'error');
  }

  const submitBtn = formReimbursement.querySelector('button[type="submit"]');
  submitBtn.textContent = 'Salvando...';
  submitBtn.disabled = true;

  await autoRegisterCompany(category, merchant);

  const itemData = {
    date,
    category,
    merchant,
    amount: -Math.abs(amount),
    owner,
    paymentMethodId,
    observation,
    isReimbursement: true,
  };

  await FinanceAPI.saveReceipt(inputMonth, itemData);

  submitBtn.textContent = 'Salvar Reembolso';
  submitBtn.disabled = false;

  formReimbursement.reset();
  document.getElementById('reimb-date').value = date;
  showToast('Reembolso registrado com sucesso!', 'success');
});

// === LÓGICA DO PAINEL DE CARTÕES ===
const formPayment = document.getElementById('form-payment');
const payTypeSelect = document.getElementById('pay-type');
const payCreditFields = document.getElementById('pay-credit-fields');

payTypeSelect.addEventListener('change', (e) => {
  payCreditFields.style.display = e.target.value === 'credito' ? 'flex' : 'none';
});

let editingPaymentId = null;
const paySubmitBtn = formPayment.querySelector('button[type="submit"]');

formPayment.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('pay-name').value.trim();
  const type = payTypeSelect.value;
  const closing = document.getElementById('pay-closing').value;
  const due = document.getElementById('pay-due').value;

  if (!name) return;

  let updatedMethods = [...paymentMethods];

  if (editingPaymentId) {
    const idx = updatedMethods.findIndex((m) => m.id === editingPaymentId);
    if (idx !== -1) {
      updatedMethods[idx] = {
        id: editingPaymentId,
        name,
        type,
        closing: type === 'credito' ? parseInt(closing) || null : null,
        due: type === 'credito' ? parseInt(due) || null : null,
      };
    }
  } else {
    const newMethod = {
      id: 'pay_' + Date.now(),
      name,
      type,
      closing: type === 'credito' ? parseInt(closing) || null : null,
      due: type === 'credito' ? parseInt(due) || null : null,
    };
    updatedMethods.push(newMethod);
  }

  paySubmitBtn.textContent = 'Salvando...';
  paySubmitBtn.disabled = true;

  await FinanceAPI.savePaymentMethods(updatedMethods);

  resetPaymentForm();
  showToast('Cartão salvo com sucesso!', 'success');
});

function resetPaymentForm() {
  formPayment.reset();
  editingPaymentId = null;
  paySubmitBtn.textContent = 'Salvar Cartão';
  paySubmitBtn.disabled = false;
  payCreditFields.style.display = payTypeSelect.value === 'credito' ? 'flex' : 'none';
}

function startEditPayment(id) {
  const method = paymentMethods.find((m) => m.id === id);
  if (!method) return;

  editingPaymentId = id;
  document.getElementById('pay-name').value = method.name;
  payTypeSelect.value = method.type;

  if (method.type === 'credito') {
    payCreditFields.style.display = 'flex';
    document.getElementById('pay-closing').value = method.closing || '';
    document.getElementById('pay-due').value = method.due || '';
  } else {
    payCreditFields.style.display = 'none';
    document.getElementById('pay-closing').value = '';
    document.getElementById('pay-due').value = '';
  }

  paySubmitBtn.textContent = 'Salvar Alterações';
}

async function deletePaymentMethod(id) {
  if (!(await showConfirm('Excluir este método de pagamento? Lançamentos antigos manterão o registro em texto.', true))) return;
  const updatedMethods = paymentMethods.filter((m) => m.id !== id);
  await FinanceAPI.savePaymentMethods(updatedMethods);
  showToast('Método de pagamento excluído.', 'success');
}

function renderPaymentMethodsList() {
  const listEl = document.getElementById('payments-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  paymentMethods.forEach((method) => {
    const item = document.createElement('div');
    item.className = 'receipt-item';

    let detailText = '';
    if (method.type === 'credito' && method.closing) {
      const dueText = method.due < method.closing ? `Vence dia ${method.due} (mês seg.)` : `Vence dia ${method.due}`;
      detailText = ` • Fecha dia ${method.closing} • ${dueText}`;
    }

    item.innerHTML = `
      <div class="receipt-main">
        <div class="receipt-line">${method.name} <span class="hint small">(${method.type})</span></div>
        <div class="receipt-meta" style="margin-top:2px;">ID: ${method.id}${detailText}</div>
      </div>
      <div class="receipt-right" style="flex-direction: row; gap: 4px; align-items: center;">
        <button class="action-btn" onclick="startEditPayment('${method.id}')">Editar</button>
        <button class="action-btn danger" onclick="deletePaymentMethod('${method.id}')">X</button>
      </div>
    `;
    listEl.appendChild(item);
  });
}

const paymentTypeConfig = {
  credito: { label: 'Cartões de Crédito', icon: '💳 Créd.' },
  debito: { label: 'Cartões de Débito', icon: '💴 Déb.' },
  default: { label: 'Outros Métodos', icon: '🏷️' },
};

function updatePaymentSelects() {
  const selectPlanned = document.getElementById('planned-payment');
  const selectActual = document.getElementById('actual-payment');

  let optionsHtml = `
    <option value="" disabled selected>Selecione o pagamento...</option>
    <option value="dinheiro">💵 Dinheiro</option>
  `;

  const groupedMethods = paymentMethods.reduce((groups, method) => {
    const type = method.type || 'default';
    if (!groups[type]) groups[type] = [];
    groups[type].push(method);
    return groups;
  }, {});

  Object.keys(groupedMethods).forEach((type) => {
    const config = paymentTypeConfig[type] || paymentTypeConfig.default;
    const methodsInGroup = groupedMethods[type];

    if (methodsInGroup.length > 0) {
      optionsHtml += `<optgroup label="${config.icon} ${config.label}">`;
      optionsHtml += methodsInGroup.map((m) => `<option value="${m.id}">${m.name}</option>`).join('');
      optionsHtml += `</optgroup>`;
    }
  });

  if (selectPlanned) {
    const currentVal = selectPlanned.value;
    selectPlanned.innerHTML = optionsHtml;
    if (currentVal) selectPlanned.value = currentVal;
  }

  if (selectActual) {
    const currentVal = selectActual.value;
    selectActual.innerHTML = optionsHtml;
    if (currentVal) selectActual.value = currentVal;
  }

  const selectReimb = document.getElementById('reimb-payment');
  if (selectReimb) {
    const currentVal = selectReimb.value;
    selectReimb.innerHTML = optionsHtml;
    if (currentVal) selectReimb.value = currentVal;
  }

  const selectAnnual = document.getElementById('annual-payment');
  if (selectAnnual) {
    const currentVal = selectAnnual.value;
    selectAnnual.innerHTML = optionsHtml;
    if (currentVal) selectAnnual.value = currentVal;
  }
}

function getPaymentName(id) {
  if (!id || id === 'dinheiro') return '💵 Dinheiro';
  const method = paymentMethods.find((m) => m.id === id);
  if (!method) return 'Desconhecido';

  const config = paymentTypeConfig[method.type] || paymentTypeConfig.default;
  return `${config.icon} ${method.name}`;
}
// ===================================

const summaryIncomeInline = document.getElementById('summary-income-inline');
const summaryExpenseInline = document.getElementById('summary-expense-inline');
const summarySaldoLivre = document.getElementById('summary-saldo-livre');

const summarySaldoPrevisto = document.getElementById('summary-saldo-previsto');
const summarySaldoReal = document.getElementById('summary-saldo-real');
const summaryDiffSaldo = document.getElementById('summary-diff-saldo');

function getCurrentMonth() {
  return monthInput.value;
}

function loadIncomeToInputs(month) {
  let income = incomes.find((i) => i.month === month);

  if (!income) {
    const pastIncomes = incomes.filter((i) => i.month < month).sort((a, b) => b.month.localeCompare(a.month));
    if (pastIncomes.length > 0) {
      income = pastIncomes[0];
    }
  }

  incomeLuanaInput.value = income ? income.luana || 0 : 0;
  incomeGabrielInput.value = income ? income.gabriel || 0 : 0;
}

btnLoadMonth.addEventListener('click', async () => {
  const targetMonth = getCurrentMonth();
  if (!targetMonth) return showToast('Selecione um mês primeiro.', 'error');

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
        let newDate = '';

        if (item.date) {
          const oldDateParts = item.date.split('-');
          const day = oldDateParts.length === 3 ? oldDateParts[2] : '01';
          newDate = `${targetMonth}-${day}`;
        } else if (item.isStatic) {
          newDate = `${targetMonth}-01`;
        }

        const newItem = { ...item, month: targetMonth, date: newDate };
        delete newItem.id;
        await FinanceAPI.savePlanned(targetMonth, newItem);

        if (item.isStatic) {
          const receiptData = {
            date: newDate,
            category: item.category,
            merchant: item.description,
            amount: item.amount,
            owner: item.owner,
            paymentMethodId: item.paymentMethodId || 'dinheiro',
            isStatic: true,
          };
          await FinanceAPI.saveReceipt(targetMonth, receiptData);
        }
      }

      if (fixedItemsToClone.length > 0) {
        showToast(`${fixedItemsToClone.length} contas fixas copiadas de ${prevMonthStr}!`, 'success');
      } else {
        showToast(`Nenhuma conta marcada como "Fixo" encontrada em ${prevMonthStr}.`, 'info');
      }
    } else {
      showToast('Este mês já possui itens. A cópia automática só funciona em meses vazios.', 'error');
    }

    loadIncomeToInputs(targetMonth);
  } catch (error) {
    console.error('Erro ao clonar:', error);
    showToast('Erro ao carregar mês.', 'error');
  } finally {
    btnLoadMonth.textContent = originalText;
    btnLoadMonth.disabled = false;
  }
});

btnSaveIncome.addEventListener('click', async () => {
  const month = getCurrentMonth();
  if (!month) return showToast('Selecione o mês.', 'error');

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
  showToast(`Rendas de ${month} salvas com sucesso!`, 'success');
  refreshAll();
});

function getIncomeTotalForMonth(month) {
  const exact = incomes.find((i) => i.month === month);
  if (exact) return (exact.luana || 0) + (exact.gabriel || 0);
  const past = incomes.filter((i) => i.month < month).sort((a, b) => b.month.localeCompare(a.month));
  return past.length > 0 ? past[0].luana + past[0].gabriel : 0;
}

monthInput.addEventListener('change', () => {
  const newMonth = getCurrentMonth();
  syncData(newMonth);

  const today = getLocalDateString();
  const newDefaultDate = today.startsWith(newMonth) ? today : `${newMonth}-01`;

  if (actualDateInput && !editingReceiptId) {
    actualDateInput.value = newDefaultDate;
  }

  if (plannedDateInput && !editingPlannedId) {
    plannedDateInput.value = newDefaultDate;
  }
});

// ===== Chips de tipos & empresas =====

const plannedTypeChips = document.getElementById('planned-type-chips');
const plannedCompanyChips = document.getElementById('planned-company-chips');
const receiptTypeChips = document.getElementById('receipt-type-chips');
const receiptCompanyChips = document.getElementById('receipt-company-chips');

let selectedPlannedType = getCategories()[0];
let selectedReceiptType = getCategories()[0];
let isEditMode = false;

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

async function handleEditCategory(oldName) {
  const newName = await showPrompt(`Renomear a categoria "${oldName}"?\n\nDeixe em branco e clique em OK para EXCLUIR.`, oldName);
  if (newName === null) return;

  const trimmed = newName.trim();
  if (trimmed === '') {
    if (await showConfirm(`Atenção: Excluir a categoria "${oldName}" vai sumir com todas as empresas dentro dela. Continuar?`, true)) {
      delete companyDirectory[oldName];
      showToast('Categoria excluída.', 'success');
    }
  } else if (trimmed !== oldName) {
    companyDirectory[trimmed] = companyDirectory[oldName];
    delete companyDirectory[oldName];
    if (selectedPlannedType === oldName) selectedPlannedType = trimmed;
    if (selectedReceiptType === oldName) selectedReceiptType = trimmed;
    showToast('Categoria renomeada.', 'success');
  }

  updatePlannedChips();
  updateReceiptChips();
  await FinanceAPI.saveCompanies(companyDirectory);
}

async function handleEditCompany(category, oldName) {
  const newName = await showPrompt(`Renomear a empresa "${oldName}"?\n\nDeixe em branco e clique em OK para EXCLUIR.`, oldName);
  if (newName === null) return;

  const trimmed = newName.trim().toUpperCase();
  if (trimmed === '') {
    if (await showConfirm(`Excluir a empresa "${oldName}"?`, true)) {
      companyDirectory[category] = companyDirectory[category].filter((c) => c !== oldName);
      showToast('Empresa excluída.', 'success');
    }
  } else if (trimmed !== oldName) {
    const idx = companyDirectory[category].indexOf(oldName);
    if (idx !== -1) companyDirectory[category][idx] = trimmed;
    showToast('Empresa renomeada.', 'success');
  }

  updatePlannedChips();
  updateReceiptChips();
  await FinanceAPI.saveCompanies(companyDirectory);
}

function updatePlannedChips() {
  renderTypeChips(plannedTypeChips, selectedPlannedType, (type) => {
    selectedPlannedType = type;
    plannedCategoryInput.value = type;
    plannedDescriptionInput.value = '';
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
    actualMerchantInput.value = '';
    updateReceiptChips();
  });

  renderCompanyChips(receiptCompanyChips, selectedReceiptType, (company) => {
    actualMerchantInput.value = company;
  });

  if (typeof updateAnnualChips === 'function') updateAnnualChips();
}

// ===== Orçamento mensal (custos previstos) =====

const formPlanned = document.getElementById('form-planned');
const plannedDateInput = document.getElementById('planned-date');
const plannedCategoryInput = document.getElementById('planned-category');
const plannedDescriptionInput = document.getElementById('planned-description');
const plannedAmountInput = document.getElementById('planned-amount');
const plannedOwnerSelect = document.getElementById('planned-owner');
const plannedFixedCheckbox = document.getElementById('planned-fixed');
const plannedStaticCheckbox = document.getElementById('planned-static');
const labelPlannedStatic = document.getElementById('label-planned-static');
const plannedSubmitBtn = document.getElementById('planned-submit-btn');

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
  const date = plannedDateInput.value;
  const currentViewMonth = getCurrentMonth();

  const inputMonth = date ? date.substring(0, 7) : currentViewMonth;

  if (date && inputMonth !== currentViewMonth) {
    return showToast(`A data do orçamento não pertence ao mês selecionado (${currentViewMonth}).`, 'error');
  }

  const month = inputMonth;
  const category = plannedCategoryInput.value.trim();
  const description = plannedDescriptionInput.value.trim();
  const amount = parseAmount(plannedAmountInput.value);
  const owner = plannedOwnerSelect.value;
  const paymentMethodId = document.getElementById('planned-payment').value;
  const fixed = plannedFixedCheckbox.checked;
  const isStatic = plannedStaticCheckbox.checked;

  if (isStatic && !date) {
    return showToast('Para itens estáticos (auto-lançar), é obrigatório informar uma data.', 'error');
  }

  if (!category || !description || isNaN(amount) || !paymentMethodId) {
    return showToast('Preencha categoria, descrição, valor e selecione o pagamento.', 'error');
  }

  plannedSubmitBtn.textContent = 'Salvando...';
  plannedSubmitBtn.disabled = true;

  await autoRegisterCompany(category, description);

  let oldItem = null;
  if (editingPlannedId !== null) {
    oldItem = plannedItems.find((p) => p.id === editingPlannedId);
  }

  const itemData = { date, category, description, amount, owner, paymentMethodId, fixed, isStatic, month };
  if (editingPlannedId !== null) itemData.id = editingPlannedId;

  await FinanceAPI.savePlanned(month, itemData);

  if (editingPlannedId === null) {
    if (isStatic) {
      const receiptData = { date: date, category, merchant: description, amount, owner, paymentMethodId, isStatic: true };
      await FinanceAPI.saveReceipt(month, receiptData);
    }
  } else if (oldItem) {
    const linkedReceipt = receipts.find((r) => r.date.startsWith(month) && r.category === oldItem.category && r.merchant === oldItem.description && r.owner === oldItem.owner && r.amount === oldItem.amount && r.isStatic);

    if (linkedReceipt) {
      if (isStatic) {
        const updatedReceipt = {
          id: linkedReceipt.id,
          date: date || linkedReceipt.date,
          category: category,
          merchant: description,
          amount: amount,
          owner: owner,
          paymentMethodId: paymentMethodId,
          isStatic: true,
          isReimbursement: linkedReceipt.isReimbursement || false,
        };
        await FinanceAPI.saveReceipt(month, updatedReceipt);
      } else {
        await FinanceAPI.deleteReceipt(month, linkedReceipt.id);
      }
    } else if (isStatic) {
      const receiptData = { date: date, category, merchant: description, amount, owner, paymentMethodId, isStatic: true };
      await FinanceAPI.saveReceipt(month, receiptData);
    }
  }

  plannedSubmitBtn.textContent = 'Adicionar ao Orçamento';
  plannedSubmitBtn.disabled = false;
  resetPlannedForm();
  showToast('Salvo no orçamento com sucesso!', 'success');
});

function resetPlannedForm() {
  formPlanned.reset();
  editingPlannedId = null;
  plannedSubmitBtn.textContent = 'Adicionar ao Orçamento';

  plannedStaticCheckbox.disabled = true;
  labelPlannedStatic.style.opacity = '0.5';

  selectedPlannedType = getCategories()[0] || '';
  plannedCategoryInput.value = selectedPlannedType;

  const selectedMonth = getCurrentMonth();
  const today = getLocalDateString();
  if (plannedDateInput) {
    plannedDateInput.value = today.startsWith(selectedMonth) ? today : `${selectedMonth}-01`;
  }

  updatePlannedChips();
}

function startEditPlanned(id) {
  const item = plannedItems.find((p) => p.id === id);
  if (!item) return;
  editingPlannedId = id;

  plannedDateInput.value = item.date || '';
  plannedCategoryInput.value = item.category;
  plannedDescriptionInput.value = item.description;
  plannedAmountInput.value = item.amount;
  plannedOwnerSelect.value = item.owner;
  document.getElementById('planned-payment').value = item.paymentMethodId || 'dinheiro';

  plannedFixedCheckbox.checked = item.fixed;
  plannedStaticCheckbox.disabled = !item.fixed;
  labelPlannedStatic.style.opacity = item.fixed ? '1' : '0.5';
  plannedStaticCheckbox.checked = item.isStatic || false;

  if (getCategories().includes(item.category)) {
    selectedPlannedType = item.category;
    updatePlannedChips();
  }

  plannedSubmitBtn.textContent = 'Salvar alterações';
}

async function deletePlanned(id) {
  const p = plannedItems.find((x) => x.id === id);
  if (!p) return;

  const msg = p.isStatic ? `O item "${p.description}" é ESTÁTICO. Excluí-lo aqui também apagará a Nota Fiscal vinculada. Deseja continuar?` : `Excluir o item "${p.description}" do Orçamento?`;

  if (!(await showConfirm(msg, true))) return;

  const month = getCurrentMonth();
  await FinanceAPI.deletePlanned(month, id);

  if (p.isStatic) {
    const receiptToDelete = receipts.find((r) => r.date.startsWith(month) && r.category === p.category && r.merchant === p.description && r.owner === p.owner && r.amount === p.amount && r.isStatic);
    if (receiptToDelete) {
      await FinanceAPI.deleteReceipt(month, receiptToDelete.id);
    }
  }

  if (editingPlannedId === id) resetPlannedForm();
  showToast('Item do orçamento excluído.', 'success');
}

async function deleteReceipt(id) {
  const r = receipts.find((x) => x.id === id);
  if (!r) return;

  const msg = r.isStatic ? `A nota fiscal de "${r.merchant}" é ESTÁTICA. Excluí-la aqui também apagará a previsão no Orçamento. Deseja continuar?` : `Excluir a nota fiscal de "${r.merchant}"?`;

  if (!(await showConfirm(msg, true))) return;

  const month = r.date.substring(0, 7);
  await FinanceAPI.deleteReceipt(month, id);

  if (r.isStatic) {
    const plannedToDelete = plannedItems.find((p) => p.month === month && p.category === r.category && p.description === r.merchant && p.owner === r.owner && p.amount === r.amount && p.isStatic);
    if (plannedToDelete) {
      await FinanceAPI.deletePlanned(month, plannedToDelete.id);
    }
  }

  if (editingReceiptId === id) resetReceiptForm();
  showToast('Nota fiscal excluída.', 'success');
}

// ===== Estado de Ordenação Dinâmica =====
let plannedSortType = 'date';
let plannedSortOrder = 'desc';

let receiptsSortType = 'date';
let receiptsSortOrder = 'desc';

let dashSortType = 'actual';
let dashSortOrder = 'desc';

document.getElementById('sort-planned-type')?.addEventListener('change', (e) => {
  plannedSortType = e.target.value;
  renderPlannedItemsList(getCurrentMonth());
});
document.getElementById('btn-sort-planned-order')?.addEventListener('click', (e) => {
  plannedSortOrder = plannedSortOrder === 'asc' ? 'desc' : 'asc';
  e.target.textContent = plannedSortOrder === 'asc' ? '⬆️' : '⬇️';
  renderPlannedItemsList(getCurrentMonth());
});

document.getElementById('sort-receipts-type')?.addEventListener('change', (e) => {
  receiptsSortType = e.target.value;
  updateReceiptsView();
});
document.getElementById('btn-sort-receipts-order')?.addEventListener('click', (e) => {
  receiptsSortOrder = receiptsSortOrder === 'asc' ? 'desc' : 'asc';
  e.target.textContent = receiptsSortOrder === 'asc' ? '⬆️' : '⬇️';
  updateReceiptsView();
});

document.getElementById('sort-dash-type')?.addEventListener('change', (e) => {
  dashSortType = e.target.value;
  updateDashboardView();
});
document.getElementById('btn-sort-dash-order')?.addEventListener('click', (e) => {
  dashSortOrder = dashSortOrder === 'asc' ? 'desc' : 'asc';
  e.target.textContent = dashSortOrder === 'asc' ? '⬆️' : '⬇️';
  updateDashboardView();
});

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
  items.forEach((p) => openPlannedCats.add(p.category));
  renderPlannedItemsList(month);
});

btnCollapsePlanned.addEventListener('click', () => {
  openPlannedCats.clear();
  renderPlannedItemsList(getCurrentMonth());
});

btnExpandReceipts.addEventListener('click', () => {
  const month = getCurrentMonth();
  if (!month) return;
  const list = receipts.filter((r) => r.date.startsWith(month));
  list.forEach((r) => openReceiptCats.add(r.category));
  updateReceiptsView();
});

btnCollapseReceipts.addEventListener('click', () => {
  openReceiptCats.clear();
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
      const groupItems = grouped[cat].sort((a, b) => {
        let valA, valB;

        if (receiptsSortType === 'amount') {
          valA = a.amount;
          valB = b.amount;
        } else if (receiptsSortType === 'date') {
          valA = a.date;
          valB = b.date;
        } else {
          valA = a.merchant.toLowerCase();
          valB = b.merchant.toLowerCase();
        }

        if (receiptsSortOrder === 'asc') return valA > valB ? 1 : -1;
        return valA < valB ? 1 : -1;
      });
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

          const dateStr = p.date ? `${p.date.split('-').reverse().join('/').substring(0, 5)} • ` : '';
          const payStr = ` • ${getPaymentName(p.paymentMethodId)}`;

          item.innerHTML = `
          <div class="receipt-main">
            <div class="receipt-line">${p.description}</div>
            <div class="receipt-meta">${dateStr}Resp: ${p.owner}${payStr}${p.fixed ? (p.isStatic ? ' • Fixo & Estático' : ' • Fixo') : ''}</div>
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
const actualObservationInput = document.getElementById('actual-observation');
const receiptsList = document.getElementById('receipts-list');

let editingReceiptId = null;

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
    return showToast(`A data da nota não pertence ao mês selecionado (${currentViewMonth}).`, 'error');
  }

  const month = inputMonth;
  const category = actualCategoryInput.value.trim();
  const merchant = actualMerchantInput.value.trim();
  const amount = parseAmount(actualAmountInput.value);
  const owner = actualOwnerSelect.value;
  const paymentMethodId = document.getElementById('actual-payment').value;
  const observation = actualObservationInput.value.trim();

  if (!date || !category || !merchant || isNaN(amount) || !paymentMethodId) {
    return showToast('Preencha data, categoria, nome, valor e selecione o pagamento.', 'error');
  }

  actualSubmitBtn.textContent = 'Salvando...';
  actualSubmitBtn.disabled = true;

  await autoRegisterCompany(category, merchant);

  let oldReceipt = null;
  if (editingReceiptId !== null) {
    oldReceipt = receipts.find((r) => r.id === editingReceiptId);
  }

  const isStatic = oldReceipt ? oldReceipt.isStatic || false : false;
  const isReimb = oldReceipt ? oldReceipt.isReimbursement || false : false;

  const finalAmount = isReimb ? -Math.abs(amount) : amount;

  const itemData = {
    date,
    category,
    merchant,
    amount: finalAmount,
    owner,
    paymentMethodId,
    observation,
    isStatic: isStatic,
    isReimbursement: isReimb,
  };

  if (editingReceiptId !== null) itemData.id = editingReceiptId;

  await FinanceAPI.saveReceipt(month, itemData);

  if (oldReceipt && oldReceipt.isStatic) {
    const linkedPlanned = plannedItems.find((p) => p.month === month && p.category === oldReceipt.category && p.description === oldReceipt.merchant && p.owner === oldReceipt.owner && p.amount === oldReceipt.amount && p.isStatic);

    if (linkedPlanned) {
      const updatedPlanned = {
        id: linkedPlanned.id,
        month: linkedPlanned.month,
        fixed: linkedPlanned.fixed,
        isStatic: true,
        date: date,
        category: category,
        description: merchant,
        amount: finalAmount,
        owner: owner,
        paymentMethodId: paymentMethodId,
      };
      await FinanceAPI.savePlanned(month, updatedPlanned);
    }
  }

  actualSubmitBtn.textContent = 'Salvar Nota Fiscal';
  actualSubmitBtn.disabled = false;
  resetReceiptForm();
  showToast('Nota fiscal salva com sucesso!', 'success');
});

function resetReceiptForm() {
  formActual.reset();
  editingReceiptId = null;
  actualSubmitBtn.textContent = 'Salvar Nota Fiscal';

  selectedReceiptType = getCategories()[0] || '';
  actualCategoryInput.value = selectedReceiptType;
  actualMerchantInput.value = '';
  actualObservationInput.value = '';

  const selectedMonth = getCurrentMonth();
  const today = getLocalDateString();
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
  document.getElementById('actual-payment').value = r.paymentMethodId || 'dinheiro';
  actualObservationInput.value = r.observation || '';

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
      const groupItems = grouped[cat].sort((a, b) => {
        let valA = a[receiptsSortType] || '';
        let valB = b[receiptsSortType] || '';
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return receiptsSortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return receiptsSortOrder === 'asc' ? 1 : -1;
        return 0;
      });
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

          const obsHtml = r.observation ? `<div style="font-size: 0.75rem; color: #a6a6c0; margin-top: 2px;">↳ ${r.observation}</div>` : '';
          const payStr = ` • ${getPaymentName(r.paymentMethodId)}`;

          const isReimb = r.isReimbursement || r.amount < 0;
          const amountColor = isReimb ? '#62c462' : '#f5f5f5';
          const reimbBadge = isReimb ? ' <span style="color:#62c462; font-size:0.7rem; font-weight:bold;">(Reembolso)</span>' : '';

          const btnReembolsoHtml = !isReimb ? `<button class="action-btn" style="color: #62c462; border: 1px solid rgba(98, 196, 98, 0.3);" onclick="startReimbursement('${r.id}')" title="Reembolsar esta nota">🔄</button>` : '';

          item.innerHTML = `
          <div class="receipt-main">
            <div class="receipt-line">${r.merchant} • ${r.category}${reimbBadge}</div>
            ${obsHtml}
            <div class="receipt-meta" style="margin-top: 2px;">${r.date.split('-').reverse().join('/')} • ${r.owner}${payStr}${r.isStatic ? ' • Estático' : ''}</div>
          </div>
          <div class="receipt-right">
            <div class="receipt-amount" style="color: ${amountColor};">${formatCurrency(r.amount)}</div>
            <div class="receipt-actions">
              ${btnReembolsoHtml}
              <button class="action-btn" onclick="startEditReceipt('${r.id}')">Editar</button>
              <button class="action-btn danger" onclick="deleteReceipt('${r.id}')">Excluir</button>
            </div>
          </div>
        `;
          receiptsList.appendChild(item);
        });
      }
    });

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
  const totalPlanned = plannedItems.filter((p) => p.month === month).reduce((s, p) => s + p.amount, 0);
  const totalActual = receipts.filter((r) => r.date.startsWith(month)).reduce((s, r) => s + r.amount, 0);

  const saldoPrevisto = totalIncome - totalPlanned;
  const saldoReal = totalIncome - totalActual;

  document.getElementById('summary-income-inline').textContent = formatCurrency(totalIncome);

  const elExpense = document.getElementById('summary-expense-inline');
  elExpense.textContent = formatCurrency(totalActual);
  document.getElementById('summary-planned-expense').textContent = formatCurrency(totalPlanned).replace('CAD ', '');
  elExpense.className = totalActual > totalPlanned ? 'status-danger' : 'status-warning';

  const elLivre = document.getElementById('summary-saldo-livre');
  elLivre.textContent = formatCurrency(saldoReal);
  document.getElementById('summary-saldo-previsto').textContent = formatCurrency(saldoPrevisto).replace('CAD ', '');
  elLivre.className = saldoReal >= saldoPrevisto ? 'status-success' : 'status-danger';

  renderPlannedItemsList(month);
}

function initAppUI() {
  const m = getCurrentMonthISO();
  monthInput.value = m;

  selectedPlannedType = getCategories()[0] || '';
  selectedReceiptType = getCategories()[0] || '';

  plannedCategoryInput.value = selectedPlannedType;
  actualCategoryInput.value = selectedReceiptType;

  const today = new Date().toISOString().split('T')[0];
  actualDateInput.value = today.startsWith(m) ? today : `${m}-01`;

  updatePlannedChips();
  updateReceiptChips();

  syncData(m);
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

  const totalIncome = getIncomeTotalForMonth(month);

  if (ownerContainer) {
    const categoriasEssenciais = ['Contas', 'Supermercado', 'Transporte', 'Combustível', 'Saúde', 'Casa', 'Pets', 'Educação', 'Cuidados pessoais'];

    let totalReal = 0;
    let totEss = 0,
      gabEss = 0,
      luaEss = 0,
      ambEss = 0;
    let totLaz = 0,
      gabLaz = 0,
      luaLaz = 0,
      ambLaz = 0;
    let gabTotal = 0,
      luaTotal = 0,
      ambTotal = 0;

    receiptsForMonth.forEach((r) => {
      const owner = r.owner || 'Ambos';
      totalReal += r.amount;

      if (owner === 'Gabriel') gabTotal += r.amount;
      else if (owner === 'Luana') luaTotal += r.amount;
      else ambTotal += r.amount;

      if (categoriasEssenciais.includes(r.category)) {
        totEss += r.amount;
        if (owner === 'Gabriel') gabEss += r.amount;
        else if (owner === 'Luana') luaEss += r.amount;
        else ambEss += r.amount;
      } else {
        totLaz += r.amount;
        if (owner === 'Gabriel') gabLaz += r.amount;
        else if (owner === 'Luana') luaLaz += r.amount;
        else ambLaz += r.amount;
      }
    });

    if (totalIncome === 0 && totalReal === 0) {
      ownerContainer.innerHTML = "<p class='hint small' style='margin-top: 8px;'>Nenhum dado para este mês.</p>";
    } else {
      const baseBarWidth = Math.max(totalIncome, totalReal);
      const freeReal = totalIncome - totalReal;

      const pEss = baseBarWidth > 0 ? (totEss / baseBarWidth) * 100 : 0;
      const pLaz = baseBarWidth > 0 ? (totLaz / baseBarWidth) * 100 : 0;

      const tEss = totalIncome > 0 ? ((totEss / totalIncome) * 100).toFixed(0) : 0;
      const tLaz = totalIncome > 0 ? ((totLaz / totalIncome) * 100).toFixed(0) : 0;

      const pGastoTotal = baseBarWidth > 0 ? (totalReal / baseBarWidth) * 100 : 0;
      const pLivreTotal = baseBarWidth > 0 ? Math.max((freeReal / baseBarWidth) * 100, 0) : 0;

      const isDetailsOpen = window.isConsumptionDetailsOpen || false;

      window.toggleOwnerCat = function (owner) {
        if (openOwnerCats.has(owner)) openOwnerCats.delete(owner);
        else openOwnerCats.add(owner);
        updateDashboardView();
      };

      let html = `
        <div style="margin-bottom: 20px; padding: 4px;">
          
          <div style="cursor: pointer; padding-bottom: ${isDetailsOpen ? '16px' : '0'}; border-bottom: ${isDetailsOpen ? '1px solid rgba(255,255,255,0.05)' : 'none'}; transition: all 0.2s ease;" onclick="window.isConsumptionDetailsOpen = !${isDetailsOpen}; updateDashboardView();">
            <div style="margin-bottom: 6px; text-align: center;">
              <span style="font-weight: 600; font-size: 0.95rem; color: #62c462;">
                <span style="font-size: 0.75rem; vertical-align: middle; display: inline-block; width: 14px; text-align: left;">${isDetailsOpen ? '▼' : '▶'}</span> Renda Total: ${formatCurrency(totalIncome)}
              </span>
            </div>
            
            <div style="display: flex; height: 14px; border-radius: 7px; overflow: hidden; margin-bottom: 4px; background: #27273a; border: 1px solid #35354a;">
              ${pEss > 0 ? `<div style="width: ${pEss}%; background: #f7c84a;" title="Essenciais: ${formatCurrency(totEss)}"></div>` : ''}
              ${pLaz > 0 ? `<div style="width: ${pLaz}%; background: #ff7b7b;" title="Lazer e Outros: ${formatCurrency(totLaz)}"></div>` : ''}
            </div>

            <div style="display: flex; width: 100%;">
              <div style="width: ${pGastoTotal}%; border-top: 2px dashed #ff7b7b;"></div>
              ${freeReal > 0 ? `<div style="width: ${pLivreTotal}%; border-top: 2px solid #62c462;"></div>` : ''}
            </div>
            <div style="display: flex; justify-content: space-between; width: 100%; margin-bottom: 8px; font-size: 0.8rem; padding-top: 4px; gap: 8px;">
              <span style="color: #ff7b7b; font-weight: 600; white-space: nowrap;">Gasto: ${formatCurrency(totalReal)}</span>
              ${
                freeReal > 0
                  ? `<span style="color: #62c462; font-weight: 600; white-space: nowrap; text-align: right;">Livre: ${formatCurrency(freeReal)}</span>`
                  : freeReal < 0
                    ? `<span style="color: #ff7b7b; font-weight: 600; white-space: nowrap; text-align: right;">Estouro: ${formatCurrency(freeReal)}</span>`
                    : ''
              }
            </div>

            <div style="display: flex; gap: 16px; font-size: 0.75rem; color: #a6a6c0; flex-wrap: wrap; align-items: center; justify-content: center; margin-bottom: ${isDetailsOpen ? '0' : '8px'};">
              ${totEss > 0 ? `<span><strong style="color: #f7c84a;">■</strong> Essenciais: <span style="color:#f5f5f5">${formatCurrency(totEss)}</span> <span style="opacity:0.6; font-size:0.65rem">(${tEss}%)</span></span>` : ''}
              ${totLaz > 0 ? `<span><strong style="color: #ff7b7b;">■</strong> Lazer: <span style="color:#f5f5f5">${formatCurrency(totLaz)}</span> <span style="opacity:0.6; font-size:0.65rem">(${tLaz}%)</span></span>` : ''}
            </div>
          </div>

          <div style="display: ${isDetailsOpen ? 'block' : 'none'}; margin-top: 16px; margin-bottom: 12px; padding-left: 12px; border-left: 2px solid #35354a; animation: fadeIn 0.15s ease-out;">
            <div style="margin-bottom: 16px;">
              <span style="font-weight: 500; font-size: 0.85rem; color: #c3c3d5;">↳ Detalhamento de Responsáveis</span>
            </div>
      `;

      const ownersArray = [
        { name: 'Gabriel', total: gabTotal, ess: gabEss, laz: gabLaz },
        { name: 'Luana', total: luaTotal, ess: luaEss, laz: luaLaz },
        { name: 'Ambos', total: ambTotal, ess: ambEss, laz: ambLaz },
      ];

      ownersArray.forEach((owner) => {
        if (owner.total === 0) return;
        const isOpen = openOwnerCats.has(owner.name);

        html += `
          <div class="group-header-div" style="display: block; padding: 12px; margin-top: 8px;" onclick="window.toggleOwnerCat('${owner.name}')">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 600; color: #fddf7b;">${isOpen ? '▼' : '▶'} ${owner.name}</span>
              <span style="font-size: 0.95rem; color: #f5f5f5;">${formatCurrency(owner.total)}</span>
            </div>
          </div>
        `;

        if (isOpen) {
          html += `
            <div style="background: #141423; padding: 8px 12px; border-radius: 0 0 6px 6px; margin-bottom: 6px; margin-top: -2px; font-size: 0.85rem;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span style="color: #c3c3d5;">↳ Essenciais</span>
                <span style="color: #f5f5f5; font-weight: 500;">${formatCurrency(owner.ess)}</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #c3c3d5;">↳ Lazer e Outros</span>
                <span style="color: #f7c84a; font-weight: 500;">${formatCurrency(owner.laz)}</span>
              </div>
            </div>
          `;
        }
      });

      html += `
          </div>
        </div>
      `;

      ownerContainer.innerHTML = html;
    }
  }

  const mapCat = {};

  plannedForMonth.forEach((p) => {
    if (!mapCat[p.category]) mapCat[p.category] = { planned: 0, actual: 0, items: new Map() };
    mapCat[p.category].planned += p.amount;

    const key = makeKey(p.category, p.description);
    if (!mapCat[p.category].items.has(key)) {
      mapCat[p.category].items.set(key, { name: p.description, planned: 0, actual: 0, obsList: [], owners: new Set(), maxDate: p.date || '' });
    }
    const item = mapCat[p.category].items.get(key);
    item.planned += p.amount;
    if (p.owner) item.owners.add(p.owner);
    if (p.date && (!item.maxDate || p.date > item.maxDate)) item.maxDate = p.date;
  });

  receiptsForMonth.forEach((r) => {
    if (!mapCat[r.category]) mapCat[r.category] = { planned: 0, actual: 0, items: new Map() };
    mapCat[r.category].actual += r.amount;

    const key = makeKey(r.category, r.merchant);
    if (!mapCat[r.category].items.has(key)) {
      mapCat[r.category].items.set(key, { name: r.merchant, planned: 0, actual: 0, obsList: [], owners: new Set(), maxDate: r.date || '' });
    }
    const item = mapCat[r.category].items.get(key);
    item.actual += r.amount;
    if (r.owner) item.owners.add(r.owner);
    if (r.date && (!item.maxDate || r.date > item.maxDate)) item.maxDate = r.date;

    const obsText = r.observation ? r.observation.trim() : 'Sem observação';
    const ownerName = r.owner || 'Ambos';

    const existingObs = item.obsList.find((o) => o.text.toLowerCase() === obsText.toLowerCase() && o.owner === ownerName);

    if (existingObs) {
      existingObs.amount += r.amount;
      existingObs.owners.add(ownerName);
      existingObs.transactions.push(r);
    } else {
      item.obsList.push({ text: obsText, amount: r.amount, owner: ownerName, owners: new Set([ownerName]), transactions: [r] });
    }
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

    const diffCat = Math.round((data.planned - data.actual) * 100) / 100;
    const isOpen = openDashboardCats.has(cat);

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

    const roundedPercent = Math.round(percent * 100) / 100;

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
    tdCatDiff.className = 'numeric ' + (diffCat > 0 ? 'positive' : diffCat === 0 ? 'neutral' : 'negative');
    tdCatDiff.textContent = formatCurrency(diffCat);

    trCat.appendChild(tdCatName);
    trCat.appendChild(tdCatPrev);
    trCat.appendChild(tdCatReal);
    trCat.appendChild(tdCatDiff);
    tbody.appendChild(trCat);

    if (isOpen) {
      const items = Array.from(data.items.values()).sort((a, b) => {
        let valA, valB;
        if (dashSortType === 'diff') {
          valA = Math.round((a.planned - a.actual) * 100) / 100;
          valB = Math.round((b.planned - b.actual) * 100) / 100;
        } else if (dashSortType === 'date') {
          valA = a.maxDate || '';
          valB = b.maxDate || '';
        } else {
          valA = a[dashSortType];
          valB = b[dashSortType];
        }

        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return dashSortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return dashSortOrder === 'asc' ? 1 : -1;
        return 0;
      });
      items.forEach((item) => {
        const diffItem = Math.round((item.planned - item.actual) * 100) / 100;

        const trItem = document.createElement('tr');
        trItem.className = 'dashboard-detail-row';

        const tdItemName = document.createElement('td');

        const obsArray = item.obsList || [];
        let obsHtml = '';

        const isGenericObs = (text) => {
          const t = text.trim().toLowerCase();
          return t === 'sem observação' || t === '-' || t === '';
        };

        const hasGroupedTransactions = obsArray.some((o) => o.transactions && o.transactions.length > 1);

        const shouldRenderObs = obsArray.length > 1 || (obsArray.length === 1 && !isGenericObs(obsArray[0].text)) || hasGroupedTransactions;
        let datesArray = [];
        let totalTxCount = 0;

        (item.obsList || []).forEach((obs) => {
          (obs.transactions || []).forEach((t) => {
            totalTxCount++;
            if (t.date) {
              const shortDate = t.date.split('-').reverse().join('/').substring(0, 5);
              if (!datesArray.includes(shortDate)) {
                datesArray.push(shortDate);
              }
            }
          });
        });

        datesArray.sort((a, b) => b.localeCompare(a));

        const ownersArray = Array.from(item.owners || []);
        const ownersText = ownersArray.length > 0 ? `(${ownersArray.join(', ')})` : '';

        const datesText = totalTxCount > 1 ? '' : datesArray.join(', ');

        const metaText = [ownersText, datesText].filter(Boolean).join(' • ');

        if (shouldRenderObs) {
          let allTransactions = [];

          obsArray.forEach((o) => {
            const textToDisplay = isGenericObs(o.text) ? 'Sem observação' : o.text;
            if (o.transactions && o.transactions.length > 0) {
              o.transactions.forEach((t) => {
                allTransactions.push({
                  date: t.date,
                  amount: t.amount,
                  text: textToDisplay,
                  owner: t.owner || 'Ambos',
                  paymentMethodId: t.paymentMethodId,
                  isReimbursement: t.isReimbursement || t.amount < 0,
                });
              });
            }
          });

          allTransactions.sort((a, b) => b.date.localeCompare(a.date));

          const obsLines = allTransactions
            .map((t) => {
              const dateStr = t.date ? `${t.date.split('-').reverse().join('/').substring(0, 5)}` : '';
              const payStr = getPaymentName(t.paymentMethodId);

              const isReimb = t.isReimbursement;
              const amountColor = isReimb ? '#62c462' : '#c3c3d5';
              const reimbBadge = isReimb ? ' <span style="color:#62c462; font-size:0.7rem; font-weight:bold;">(Reemb.)</span>' : '';

              return `
                <div style="margin-top: 8px; margin-bottom: 8px; border-left: 2px solid #27273a; padding-left: 8px;">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 4px;">
                    <span style="color: #c3c3d5; font-size: 0.8rem; line-height: 1.3;">${t.text}${reimbBadge}</span>
                    <span style="color: ${amountColor}; font-size: 0.75rem; font-weight: 600; white-space: nowrap; margin-left: 4px;">${formatCurrency(t.amount)}</span>
                  </div>
                  <div style="font-size: 0.7rem; color: #8e8eab; margin-top: 3px; display: flex; flex-wrap: wrap; gap: 4px;">
                    <span>(${t.owner})</span>
                    <span>• ${payStr}</span>
                    ${dateStr ? `<span>• ${dateStr}</span>` : ''}
                  </div>
                </div>`;
            })
            .join('');

          const totalItems = allTransactions.length;

          tdItemName.innerHTML = `
            <details style="cursor: pointer; margin: 2px 0;">
              <summary style="outline: none; user-select: none; color: #fddf7b;">
                <div style="display: inline-block;">
                  <span style="color: #f5f5f5;">${item.name}</span>
                  <span style="font-size: 0.6rem; background: rgba(253, 223, 123, 0.15); color: #fddf7b; padding: 2px 6px; border-radius: 6px; margin-left: 4px; border: 1px solid rgba(253, 223, 123, 0.3); white-space: nowrap; vertical-align: middle;">${totalItems} itens</span>
                </div>
                <div style="font-size: 0.72rem; color: #8e8eab; margin-top: 2px; line-height: 1.3;">${metaText}</div>
              </summary>
              <div style="margin-top: 6px; margin-bottom: 4px;">
                ${obsLines}
              </div>
            </details>
          `;
        } else {
          let singleTx = null;
          if (obsArray.length > 0 && obsArray[0].transactions && obsArray[0].transactions.length > 0) {
            singleTx = obsArray[0].transactions[0];
          }

          let reimbBadge = '';
          let payStr = '';
          if (singleTx) {
            const isReimb = singleTx.isReimbursement || singleTx.amount < 0;
            if (isReimb) reimbBadge = ' <span style="color:#62c462; font-size:0.7rem; font-weight:bold; margin-left: 4px;">(Reemb.)</span>';
            payStr = getPaymentName(singleTx.paymentMethodId);
          }

          const singleMetaText = [ownersText, datesArray.join(', '), payStr].filter(Boolean).join(' • ');

          tdItemName.innerHTML = `
            <div style="color: #f5f5f5;">${item.name}${reimbBadge}</div>
            <div style="font-size: 0.72rem; color: #8e8eab; margin-top: 2px; line-height: 1.3;">${singleMetaText}</div>
          `;
        }

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
          top: 25,
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

let historyDebounceTimer = null;

function updateHistoricalChart() {
  if (!chartHistoryCanvas) return;

  clearTimeout(historyDebounceTimer);
  historyDebounceTimer = setTimeout(async () => {
    try {
      const db = window.db;
      const familyId = window.FinanceAPI.familyId;

      const mesesSnap = await db.collection('familias').doc(familyId).collection('meses').get();
      let allMonthsData = [];

      for (const doc of mesesSnap.docs) {
        const monthStr = doc.id;
        if (!/^\d{4}-\d{2}$/.test(monthStr)) continue;

        const incData = doc.data();
        const income = (incData.luana || 0) + (incData.gabriel || 0);

        const notasSnap = await doc.ref.collection('notas_fiscais').get();
        let expense = 0;
        notasSnap.forEach((n) => {
          expense += n.data().amount || 0;
        });

        allMonthsData.push({ month: monthStr, income, expense });
      }

      if (allMonthsData.length === 0) {
        if (historyChart) historyChart.destroy();
        return;
      }

      allMonthsData.sort((a, b) => a.month.localeCompare(b.month));

      let displayData = allMonthsData;
      const limit = historyMonthsSelect.value;
      if (limit !== 'all') {
        displayData = displayData.slice(-parseInt(limit));
      }

      const labels = [];
      const monthlyBalances = [];
      let selectedPeriodTotal = 0;

      displayData.forEach((d) => {
        const bal = d.income - d.expense;
        labels.push(d.month);
        monthlyBalances.push(bal);
        selectedPeriodTotal += bal;
      });

      const totalEl = document.getElementById('history-total-accumulated');
      if (totalEl) {
        totalEl.textContent = 'Total: ' + formatCurrency(selectedPeriodTotal);
        totalEl.className = selectedPeriodTotal >= 0 ? 'positive' : 'negative';
      }

      if (historyChart) {
        historyChart.destroy();
      }

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
            padding: { top: 25, bottom: 10 },
          },
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true } },
        },
      });
    } catch (error) {
      console.error('Erro ao buscar histórico do banco:', error);
    }
  }, 400);
}

// ===== Dashboard de Cartões de Crédito =====
function updateCreditCardsDashboard() {
  const month = getCurrentMonth();
  const container = document.getElementById('credit-cards-dashboard-list');
  const cardWrapper = document.getElementById('card-credit-cards');

  if (!container || !cardWrapper || !month) return;

  const creditCards = paymentMethods.filter((m) => m.type === 'credito');

  if (creditCards.length === 0) {
    cardWrapper.style.display = 'none';
    return;
  }

  const [year, m] = month.split('-');
  const prevDate = new Date(year, parseInt(m) - 2, 1);
  const prevMonthStr = prevDate.getFullYear() + '-' + String(prevDate.getMonth() + 1).padStart(2, '0');

  const currentMonthReceipts = receipts.filter((r) => r.date.startsWith(month));
  const prevMonthReceipts = receipts.filter((r) => r.date.startsWith(prevMonthStr));

  let hasAnySpending = false;
  let html = '';

  creditCards.forEach((card) => {
    let currentInvoice = 0;
    let nextInvoice = 0;
    let monthSpend = 0;

    const cardCurrentReceipts = currentMonthReceipts.filter((r) => r.paymentMethodId === card.id);
    cardCurrentReceipts.forEach((r) => {
      monthSpend += r.amount;
      const rDay = parseInt(r.date.split('-')[2]);

      if (card.closing && rDay > card.closing) {
        nextInvoice += r.amount;
      } else {
        currentInvoice += r.amount;
      }
    });

    const cardPrevReceipts = prevMonthReceipts.filter((r) => r.paymentMethodId === card.id);
    cardPrevReceipts.forEach((r) => {
      const rDay = parseInt(r.date.split('-')[2]);
      if (card.closing && rDay > card.closing) {
        currentInvoice += r.amount;
      }
    });

    const visualTotal = currentInvoice + nextInvoice;

    if (visualTotal > 0 || monthSpend > 0) {
      hasAnySpending = true;
      const pCurrent = visualTotal > 0 ? (currentInvoice / visualTotal) * 100 : 0;
      const pNext = visualTotal > 0 ? (nextInvoice / visualTotal) * 100 : 0;

      html += `
        <div style="background: linear-gradient(145deg, #1a1a2e, #12121c); border: 1px solid #35354a; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="background: rgba(253, 223, 123, 0.1); color: #fddf7b; padding: 6px; border-radius: 8px; font-size: 1.1rem; border: 1px solid rgba(253, 223, 123, 0.2);">💳</span>
              <div>
                <div style="font-weight: 600; color: #f5f5f5; font-size: 0.95rem;">${card.name}</div>
                <div style="font-size: 0.72rem; color: #a6a6c0;">Fecha dia ${card.closing || '?'} • Vence dia ${card.due || '?'}</div>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 0.72rem; color: #a6a6c0;">Gasto no Mês</div>
              <div style="font-weight: 700; color: #fddf7b; font-size: 1.05rem;">${formatCurrency(monthSpend)}</div>
            </div>
          </div>
          
          ${
            card.closing
              ? `
          <div style="display: flex; height: 6px; border-radius: 3px; overflow: hidden; background: #0b0b10; margin-top: 4px; border: 1px solid #27273a;">
            ${pCurrent > 0 ? `<div style="width: ${pCurrent}%; background: #62c462;" title="Fatura Atual"></div>` : ''}
            ${pNext > 0 ? `<div style="width: ${pNext}%; background: #f7c84a;" title="Próxima Fatura"></div>` : ''}
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: #a6a6c0; margin-top: 2px;">
            <span><strong style="color: #62c462;">■</strong> Fatura Atual: <span style="color: #f5f5f5;">${formatCurrency(currentInvoice)}</span></span>
            <span><strong style="color: #f7c84a;">■</strong> Próx. Fatura: <span style="color: #f5f5f5;">${formatCurrency(nextInvoice)}</span></span>
          </div>
          `
              : ''
          }
        </div>
      `;
    }
  });

  if (hasAnySpending) {
    container.innerHTML = html;
    cardWrapper.style.display = 'block';
  } else {
    cardWrapper.style.display = 'none';
  }
}

// === Função de Reembolso Rápido (Espelhamento) ===
function startReimbursement(id) {
  const r = receipts.find((x) => x.id === id);
  if (!r) return;

  document.getElementById('income-panel').style.display = 'none';
  document.getElementById('payments-panel').style.display = 'none';
  document.getElementById('reimbursement-panel').style.display = 'block';

  document.getElementById('reimb-date').value = r.date;
  document.getElementById('reimb-category').value = r.category;
  document.getElementById('reimb-merchant').value = r.merchant;
  document.getElementById('reimb-amount').value = Math.abs(r.amount);
  document.getElementById('reimb-owner').value = r.owner || 'Ambos';
  document.getElementById('reimb-payment').value = r.paymentMethodId || 'dinheiro';

  document.getElementById('reimb-observation').value = `Reembolso ref. à nota de ${r.date.split('-').reverse().join('/').substring(0, 5)}`;

  window.scrollTo({ top: 0, behavior: 'smooth' });
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
  updateCreditCardsDashboard();
  updateChartsView();
  updateHistoricalChart();
  checkAnnualAlerts();
}

// ===== Inicialização e Autenticação =====

const loginOverlay = document.getElementById('login-overlay');
const formLogin = document.getElementById('form-login');
const btnLogout = document.getElementById('btn-logout');
const btnDoLogin = document.getElementById('btn-do-login');

function syncData(month) {
  if (!month) return;

  FinanceAPI.clearListeners();

  btnLoadMonth.textContent = 'Sincronizando...';
  btnLoadMonth.disabled = true;

  FinanceAPI.listenPaymentMethods((methods) => {
    paymentMethods = methods || [];
    renderPaymentMethodsList();
    updatePaymentSelects();
  });

  FinanceAPI.listenCompanies((comps) => {
    if (comps && Object.keys(comps).length > 0) {
      Object.keys(companyDirectory).forEach((key) => delete companyDirectory[key]);
      Object.assign(companyDirectory, comps);
      updatePlannedChips();
      updateReceiptChips();
    }
  });

  FinanceAPI.listenIncome(month, (inc) => {
    const idx = incomes.findIndex((i) => i.month === month);
    if (inc) {
      if (idx >= 0) incomes[idx] = { month, ...inc };
      else incomes.push({ month, ...inc });
    }
    loadIncomeToInputs(month);
    refreshAll();
  });

  FinanceAPI.listenPlanned(month, (pItems) => {
    for (let i = plannedItems.length - 1; i >= 0; i--) {
      if (plannedItems[i].month === month) plannedItems.splice(i, 1);
    }
    plannedItems.push(...pItems);
    refreshAll();
  });

  FinanceAPI.listenReceipts(month, (rItems) => {
    for (let i = receipts.length - 1; i >= 0; i--) {
      if (receipts[i].date.startsWith(month)) receipts.splice(i, 1);
    }
    receipts.push(...rItems);
    refreshAll();

    btnLoadMonth.textContent = 'Carregar';
    btnLoadMonth.disabled = false;
  });

  FinanceAPI.listenAnnualEvents((events) => {
    annualEvents = events || [];
    renderAnnualList();
    checkAnnualAlerts();
  });
}

function bufferToBase64URL(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const char of bytes) str += String.fromCharCode(char);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64URLToBuffer(base64URL) {
  const base64 = base64URL.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (base64.length % 4)) % 4;
  const str = atob(base64.padEnd(base64.length + padLen, '='));
  const buffer = new ArrayBuffer(str.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return buffer;
}

async function registerBiometrics(userEmail) {
  if (!window.PublicKeyCredential) return;

  try {
    const options = {
      challenge: new Uint8Array(32),
      rp: { name: 'Controle Financeiro', id: window.location.hostname },
      user: { id: new Uint8Array(16), name: userEmail, displayName: userEmail },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },
        { alg: -257, type: 'public-key' },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
      timeout: 60000,
    };

    const credential = await navigator.credentials.create({ publicKey: options });
    localStorage.setItem('biometricCredentialId', bufferToBase64URL(credential.rawId));
    console.log('Biometria cadastrada com sucesso.');
  } catch (err) {
    console.warn('Registro biométrico ignorado ou falhou:', err);
  }
}

async function verifyBiometrics() {
  const credIdStr = localStorage.getItem('biometricCredentialId');
  if (!credIdStr) return true;

  const biometricOverlay = document.getElementById('biometric-overlay');
  biometricOverlay.style.display = 'flex';

  try {
    const options = {
      challenge: new Uint8Array(32),
      allowCredentials: [{ id: base64URLToBuffer(credIdStr), type: 'public-key' }],
      userVerification: 'required',
      timeout: 60000,
    };

    await navigator.credentials.get({ publicKey: options });
    biometricOverlay.style.display = 'none';
    return true;
  } catch (err) {
    console.error('Falha na biometria:', err);
    return false;
  }
}

document.getElementById('btn-unlock-biometrics')?.addEventListener('click', verifyBiometrics);

FinanceAPI.onAuthStateChanged(async (user) => {
  const userDisplay = document.getElementById('user-display');
  const biometricOverlay = document.getElementById('biometric-overlay');
  const globalLoader = document.getElementById('global-loader');

  if (globalLoader) {
    globalLoader.style.opacity = '0';
    setTimeout(() => (globalLoader.style.display = 'none'), 300);
  }

  if (user) {
    loginOverlay.style.display = 'none';
    btnLogout.style.display = 'block';
    if (userDisplay) {
      let nome = user.displayName;
      if (!nome) {
        const emailLower = user.email.toLowerCase();
        if (emailLower.includes('gabriel')) nome = 'Gabriel';
        else if (emailLower.includes('luana')) nome = 'Luana';
        else nome = user.email.split('@')[0];
      }
      userDisplay.textContent = `👤 ${nome}`;
    }

    const hasBiometrics = localStorage.getItem('biometricCredentialId');

    if (!hasBiometrics) {
      await registerBiometrics(user.email);
    } else {
      const unlocked = await verifyBiometrics();
      if (!unlocked) return;
    }

    initAppUI();
    console.log('Usuário logado e verificado:', user.email);
  } else {
    loginOverlay.style.display = 'flex';
    btnLogout.style.display = 'none';
    if (userDisplay) userDisplay.textContent = '';
    if (biometricOverlay) biometricOverlay.style.display = 'none';
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
    showToast('Erro no login: ' + error.message, 'error');
  } finally {
    btnDoLogin.textContent = originalText;
    btnDoLogin.disabled = false;
  }
});

btnLogout.addEventListener('click', async () => {
  await FinanceAPI.logout();
});

// ===== PLANEJAMENTO ANUAL (LÓGICA) =====
let annualEvents = [];
let editingAnnualId = null;

const formAnnual = document.getElementById('form-annual');
const annualNameInput = document.getElementById('annual-name');
const annualCategoryInput = document.getElementById('annual-category');
const annualDateInput = document.getElementById('annual-date');
const annualAmountInput = document.getElementById('annual-amount');
const annualOwnerSelect = document.getElementById('annual-owner');
const annualPaymentSelect = document.getElementById('annual-payment');
const annualObservationInput = document.getElementById('annual-observation');
const annualSubmitBtn = document.getElementById('annual-submit-btn');
const annualItemsList = document.getElementById('annual-items-list');

let selectedAnnualType = '';
const annualTypeChips = document.getElementById('annual-type-chips');
const annualCompanyChips = document.getElementById('annual-company-chips');

function updateAnnualChips() {
  if (!annualTypeChips || !annualCompanyChips) return;
  renderTypeChips(annualTypeChips, selectedAnnualType, (type) => {
    selectedAnnualType = type;
    annualCategoryInput.value = type;
    annualNameInput.value = '';
    updateAnnualChips();
  });
  renderCompanyChips(annualCompanyChips, selectedAnnualType, (company) => {
    annualNameInput.value = company;
  });
}

if (annualCategoryInput) {
  annualCategoryInput.addEventListener('input', (e) => {
    selectedAnnualType = e.target.value.trim();
    updateAnnualChips();
  });
}

if (formAnnual) {
  formAnnual.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = annualNameInput.value.trim();
    const category = annualCategoryInput.value.trim();
    const dateVal = annualDateInput.value;
    const monthTarget = dateVal ? dateVal.split('-')[1] : '';
    const dayTarget = dateVal ? dateVal.split('-')[2] : '';
    const amount = parseAmount(annualAmountInput.value);
    const owner = annualOwnerSelect.value;
    const paymentMethodId = annualPaymentSelect.value;
    const observation = annualObservationInput.value.trim();

    if (!name || !category || !monthTarget || !dayTarget || isNaN(amount) || !paymentMethodId) {
      return showToast('Preencha todos os campos obrigatórios.', 'error');
    }

    annualSubmitBtn.textContent = 'Salvando...';
    annualSubmitBtn.disabled = true;

    await autoRegisterCompany(category, name);

    const itemData = { name, category, monthTarget, dayTarget, amount, owner, paymentMethodId, observation };
    if (editingAnnualId) itemData.id = editingAnnualId;

    await FinanceAPI.saveAnnualEvent(itemData);

    annualSubmitBtn.textContent = 'Salvar Evento Anual';
    annualSubmitBtn.disabled = false;
    resetAnnualForm();
    showToast('Evento anual salvo com sucesso!', 'success');
  });
}

function resetAnnualForm() {
  formAnnual.reset();
  editingAnnualId = null;
  annualSubmitBtn.textContent = 'Salvar Evento Anual';

  selectedAnnualType = getCategories()[0] || '';
  if (annualCategoryInput) annualCategoryInput.value = selectedAnnualType;
  if (annualObservationInput) annualObservationInput.value = '';
  updateAnnualChips();
}

function startEditAnnual(id) {
  const item = annualEvents.find((a) => a.id === id);
  if (!item) return;

  editingAnnualId = id;
  annualNameInput.value = item.name;
  annualCategoryInput.value = item.category;

  const dummyYear = new Date().getFullYear();
  const safeDay = item.dayTarget ? String(item.dayTarget).padStart(2, '0') : '01';
  annualDateInput.value = `${dummyYear}-${item.monthTarget}-${safeDay}`;

  annualAmountInput.value = item.amount;
  annualOwnerSelect.value = item.owner;
  annualPaymentSelect.value = item.paymentMethodId || 'dinheiro';
  annualObservationInput.value = item.observation || '';
  annualSubmitBtn.textContent = 'Salvar Alterações';

  if (getCategories().includes(item.category)) {
    selectedAnnualType = item.category;
    updateAnnualChips();
  }

  document.querySelector('.nav-btn[data-view="annual"]').click();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteAnnual(id) {
  if (!(await showConfirm('Excluir este evento do planejamento anual?', true))) return;
  await FinanceAPI.deleteAnnualEvent(id);
  if (editingAnnualId === id) resetAnnualForm();
  showToast('Evento excluído.', 'success');
}

function renderAnnualList() {
  if (!annualItemsList) return;
  annualItemsList.innerHTML = '';

  if (annualEvents.length === 0) {
    annualItemsList.innerHTML = '<p class="hint">Nenhum evento anual cadastrado.</p>';
    return;
  }

  const sorted = [...annualEvents].sort((a, b) => a.monthTarget.localeCompare(b.monthTarget));
  const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  sorted.forEach((item) => {
    const el = document.createElement('div');
    el.className = 'receipt-item';
    const diaText = item.dayTarget ? ` (Dia ${item.dayTarget})` : '';
    const monthLabel = monthNames[parseInt(item.monthTarget) - 1] + diaText;

    const payStr = ` • ${getPaymentName(item.paymentMethodId)}`;
    const obsHtml = item.observation ? `<div style="font-size: 0.75rem; color: #a6a6c0; margin-top: 2px;">↳ ${item.observation}</div>` : '';

    el.innerHTML = `
      <div class="receipt-main">
        <div class="receipt-line">${item.name} • <span style="color:#fddf7b">[Mês: ${monthLabel}]</span></div>
        ${obsHtml}
        <div class="receipt-meta" style="margin-top:2px;">${item.category} • Resp: ${item.owner}${payStr}</div>
      </div>
      <div class="receipt-right">
        <div class="receipt-amount">${formatCurrency(item.amount)}</div>
        <div class="receipt-actions">
          <button class="action-btn" onclick="startEditAnnual('${item.id}')">Editar</button>
          <button class="action-btn danger" onclick="deleteAnnual('${item.id}')">Excluir</button>
        </div>
      </div>
    `;
    annualItemsList.appendChild(el);
  });
}

// === Sistema de Alerta no Orçamento ===
function checkAnnualAlerts() {
  const currentMonthStr = getCurrentMonth();
  if (!currentMonthStr) return;

  const currentMonthNum = currentMonthStr.split('-')[1];

  const pendingEvents = annualEvents.filter((ev) => {
    if (ev.monthTarget !== currentMonthNum) return false;

    const alreadyPlanned = plannedItems.some((p) => p.month === currentMonthStr && p.description.toLowerCase() === ev.name.toLowerCase());
    return !alreadyPlanned;
  });

  const container = document.getElementById('annual-alert-container');
  const listEl = document.getElementById('annual-alert-list');
  const navBtnAnnual = document.querySelector('.nav-btn[data-view="annual"]');

  if (!container || !listEl) return;

  if (pendingEvents.length === 0) {
    container.style.display = 'none';
    if (navBtnAnnual) navBtnAnnual.innerHTML = '🔔';
    return;
  }

  if (navBtnAnnual) {
    navBtnAnnual.innerHTML = `🔔 <span style="background: #ff7b7b; color: #12121c; border-radius: 50%; padding: 2px 6px; font-size: 0.7rem; font-weight: bold; margin-left: 4px;">${pendingEvents.length}</span>`;
  }

  container.style.display = 'block';
  listEl.innerHTML = '';

  pendingEvents.forEach((ev) => {
    const el = document.createElement('div');
    el.style.display = 'flex';
    el.style.justifyContent = 'space-between';
    el.style.alignItems = 'center';
    el.style.background = '#151524';
    el.style.padding = '8px 12px';
    el.style.borderRadius = '8px';
    el.style.border = '1px solid rgba(247, 200, 74, 0.3)';

    el.innerHTML = `
      <div>
        <div style="font-weight: 600; font-size: 0.9rem; color: #f5f5f5;">${ev.name} (Dia ${ev.dayTarget || '01'})</div>
        <div style="font-size: 0.75rem; color: #a6a6c0;">Previsto: ${formatCurrency(ev.amount)} • ${ev.owner}</div>
      </div>
      <button class="btn-primary small" style="margin: 0; padding: 6px 12px; font-size: 0.8rem;" onclick="launchAnnualToBudget('${ev.id}', '${currentMonthStr}')">Lançar no Orçamento</button>
    `;
    listEl.appendChild(el);
  });
}

window.launchAnnualToBudget = async function (eventId, targetMonthStr) {
  const ev = annualEvents.find((e) => e.id === eventId);
  if (!ev) return;

  const diaFormatado = ev.dayTarget ? String(ev.dayTarget).padStart(2, '0') : '01';
  const fullDateStr = `${targetMonthStr}-${diaFormatado}`;
  const formattedDateBr = `${diaFormatado}/${targetMonthStr.split('-')[1]}/${targetMonthStr.split('-')[0]}`;

  if (!(await showConfirm(`Deseja lançar "${ev.name}" no orçamento do dia ${formattedDateBr} com valor de ${formatCurrency(ev.amount)}?`))) return;

  const itemData = {
    date: fullDateStr,
    category: ev.category,
    description: ev.name,
    amount: ev.amount,
    owner: ev.owner,
    paymentMethodId: ev.paymentMethodId || 'dinheiro',
    observation: ev.observation || '',
    fixed: false,
    isStatic: false,
    month: targetMonthStr,
  };

  await FinanceAPI.savePlanned(targetMonthStr, itemData);
  showToast('Lançado com sucesso no Orçamento!', 'success');
};

// ===== PWA e Service Worker =====

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch((err) => console.error('Falha no Service Worker:', err));
  });
}

let deferredPrompt;
const installBanner = document.getElementById('install-banner');
const btnInstall = document.getElementById('btn-install');
const btnCloseInstall = document.getElementById('btn-close-install');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
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
