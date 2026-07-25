// ===== UI: Notificações e Modais Customizados =====

let lastReadHistory = null;
let unsubscribeLogs = null;

async function logActivity(action, details) {
  if (!window.FinanceAPI || !window.FinanceAPI.familyId) return;
  const user = window.auth && window.auth.currentUser ? window.auth.currentUser.displayName || window.auth.currentUser.email.split('@')[0] : 'Usuário';

  try {
    await window.db.collection('familias').doc(window.FinanceAPI.familyId).collection('logs').add({
      user,
      action,
      details,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('Erro ao salvar log:', err);
  }
}

async function deleteLog(logId) {
  if (!(await showConfirm('Deseja excluir este registro do histórico?', true))) return;
  try {
    await window.db.collection('familias').doc(window.FinanceAPI.familyId).collection('logs').doc(logId).delete();
    showToast('Log excluído.', 'success');
  } catch (err) {
    showToast('Erro ao excluir log.', 'error');
  }
}

function listenToLogs() {
  if (!window.FinanceAPI || !window.FinanceAPI.familyId) return;
  const currentUser = window.auth && window.auth.currentUser ? window.auth.currentUser.displayName || window.auth.currentUser.email.split('@')[0] : 'Usuário';
  const prefsRef = window.db.collection('familias').doc(window.FinanceAPI.familyId).collection('user_prefs').doc(currentUser);

  // Busca a última vez que o usuário visualizou o painel
  prefsRef.get().then((doc) => {
    lastReadHistory = doc.exists && doc.data().lastRead ? doc.data().lastRead.toMillis() : 0;

    if (unsubscribeLogs) unsubscribeLogs();

    // Mantém escuta ativa nos últimos 30 logs para gerar notificações e atualizar lista
    unsubscribeLogs = window.db
      .collection('familias')
      .doc(window.FinanceAPI.familyId)
      .collection('logs')
      .orderBy('timestamp', 'desc')
      .limit(30)
      .onSnapshot((snap) => {
        let unreadCount = 0;
        const list = document.getElementById('history-list');
        const overlay = document.getElementById('history-overlay');
        const isOverlayOpen = overlay && overlay.style.display === 'flex';

        if (isOverlayOpen && list) list.innerHTML = '';

        if (snap.empty && isOverlayOpen && list) {
          list.innerHTML = '<p class="hint" style="text-align: center;">Nenhuma atividade recente.</p>';
          return;
        }

        snap.forEach((docSnap) => {
          const data = docSnap.data();
          const logId = docSnap.id;
          const logTime = data.timestamp ? data.timestamp.toMillis() : Date.now();

          // Incrementa badge apenas se o log for novo E feito pelo outro usuário
          if (logTime > lastReadHistory && data.user !== currentUser) {
            unreadCount++;
          }

          if (isOverlayOpen && list) {
            const date = data.timestamp ? data.timestamp.toDate().toLocaleString('pt-BR') : 'Agora';
            const el = document.createElement('div');
            el.className = 'receipt-item';

            let actionColor = '#f5f5f5';
            if (data.action === 'Adicionou') actionColor = '#62c462';
            else if (data.action === 'Editou') actionColor = '#f7c84a';
            else if (data.action === 'Excluiu') actionColor = '#ff7b7b';

            el.innerHTML = `
              <div class="receipt-main" style="width: 100%;">
                <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: #a6a6c0; margin-bottom: 4px;">
                  <span>${data.user}</span>
                  <span>${date}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: flex-end;">
                  <div class="receipt-line" style="white-space: normal; line-height: 1.4; flex: 1;">
                    <span style="color: ${actionColor}; font-weight: 600; font-size: 0.8rem; margin-right: 4px;">[${data.action}]</span>
                    <span style="font-size: 0.85rem; color: #f5f5f5;">${data.details}</span>
                  </div>
                  <button class="action-btn danger" style="padding: 4px 8px; margin-left: 8px;" onclick="deleteLog('${logId}')" title="Excluir log">🗑️</button>
                </div>
              </div>
            `;
            list.appendChild(el);
          }
        });

        const badge = document.getElementById('history-badge');
        if (badge) {
          if (unreadCount > 0) {
            badge.textContent = unreadCount;
            badge.style.display = 'block';
          } else {
            badge.style.display = 'none';
          }
        }
      });
  });
}

document.getElementById('btn-history')?.addEventListener('click', async () => {
  const overlay = document.getElementById('history-overlay');
  const list = document.getElementById('history-list');
  overlay.style.display = 'flex';
  list.innerHTML = '<p class="hint" style="text-align: center; margin-top: 20px;">Carregando...</p>';

  const currentUser = window.auth && window.auth.currentUser ? window.auth.currentUser.displayName || window.auth.currentUser.email.split('@')[0] : 'Usuário';
  const prefsRef = window.db.collection('familias').doc(window.FinanceAPI.familyId).collection('user_prefs').doc(currentUser);

  // Zera as notificações registrando o clique no banco
  await prefsRef.set({ lastRead: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  lastReadHistory = Date.now();

  const badge = document.getElementById('history-badge');
  if (badge) badge.style.display = 'none';

  listenToLogs();
});

document.getElementById('btn-close-history')?.addEventListener('click', () => {
  document.getElementById('history-overlay').style.display = 'none';
});

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
const openOwnerCats = new Set(['Gabriel', 'Luana', 'Ambos']);
const openOwnerExpenseGroups = new Set();

let nextId = 1;
const getNextId = () => nextId++;

const companyDirectory = {
  Transporte: ['STM', 'UBER'],
  Supermercado: ['MARCHE SA', 'WALMART', 'SUPER C', 'MAXI', 'MARCHE DOMAINE', 'IGA', 'COSTCO', 'PROVIGO', 'SAQ', 'MARCHE BRESILIEN', 'BULKBARN', 'METRO', 'ADONIS', 'T&T', 'KIMPHAY', 'MERCADO'],
  Contas: ['HIPOTECA', 'LUZ', 'VIRGEM', 'IPTU', 'TAXA MUNICIPAL', 'CONDÔMINO', 'CARTÃO CRÉDITO', 'CARTÃO ZOO', 'H. EXTR. ANUAL', 'VIDEOTRON'],
  Eventos: ['MOOSE BAWR', 'YATAI', 'POTAGER MONT-ROUGE', 'BIXI', 'AIRBNB', 'ESTACIONAMENTO', 'ZOO', 'CENTRE BELL', 'CINEMA'],
  'Jantar fora': ['CAFÉ', 'TIM HORTONS', 'PRESOTEA', 'KETTLEMANS BAGEL', 'SUSHI', 'BOSTON', 'PIZZA', 'LA CAGE', 'THE KEG', 'SUBWAY', 'REFEITÓRIO DESJARDINS', 'RESTAURANTE'],
  Lojas: ['CDN TIRE', 'SHEIN', 'DOLLARAMA', 'AMAZON', 'MINISO', 'URBAN PLANET', 'JOGOS ONLINE', 'HP', 'ZARA', 'WINNERS', 'ARDENE', 'IKEA', 'AVIZOO'],
  Assinaturas: ['MICROSOFT', 'NETFLIX', 'ICI TOUT TELE', 'MY FAMILY', 'DISNEY', 'AMAZON PRIME', 'HBO', 'APPLE TV', 'CHATGPT', 'YOUTUBE', 'SPOTIFY'],
  Combustível: ['PETRO CANADA', 'COSTCO GASOLINA', 'ESSO'],
  'Cuidados pessoais': ['CABELO', 'UNHA', 'PHARMAPRIX', 'JEAN COUTO', 'ACADEMIA', 'REMÉDIO', 'MASSAGEM', 'MÉDICO', 'VETERINÁRIO'],
};

function compareFinancialNames(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'pt-BR', { sensitivity: 'base', numeric: true });
}

function normalizeCompanyNameKey(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('pt-BR');
}

function getUniqueCompanyNames(items = []) {
  const seen = new Set();
  return items.reduce((unique, item) => {
    const name = String(item || '').trim();
    const key = normalizeCompanyNameKey(name);
    if (!key || seen.has(key)) return unique;
    seen.add(key);
    unique.push(name);
    return unique;
  }, []);
}

function normalizeCompanyDirectorySnapshot(directory = {}) {
  const normalizedDirectory = {};
  let changed = false;

  Object.entries(directory).forEach(([category, items]) => {
    const originalItems = Array.isArray(items) ? items : [];
    const uniqueItems = getUniqueCompanyNames(originalItems);
    normalizedDirectory[category] = uniqueItems;
    if (uniqueItems.length !== originalItems.length || uniqueItems.some((item, index) => item !== originalItems[index])) changed = true;
  });

  return { normalizedDirectory, changed };
}

function getCategories() {
  return Object.keys(companyDirectory).sort(compareFinancialNames);
}

// ===== Utilitários =====

let isPrivacyMode = false;

function formatCurrency(value, isIncome = false) {
  // Passa a ocultar de forma cirúrgica apenas os dados classificados como renda
  if (isPrivacyMode && isIncome) return 'CAD ••••';
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

const BIWEEKLY_MONTHLY_FACTOR = 26 / 12;

function convertBiweeklyToMonthly(amount) {
  return Math.round(amount * BIWEEKLY_MONTHLY_FACTOR * 100) / 100;
}

function getLocalDateString() {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d - offset).toISOString().split('T')[0];
}

function getCurrentMonthISO() {
  return getLocalDateString().slice(0, 7);
}

function makeKey(category, description, owner = 'Ambos') {
  return (category || '').trim().toLowerCase() + '||' + (description || '').trim().toLowerCase() + '||' + (owner || 'Ambos').trim().toLowerCase();
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
const incomeLuanaBiweeklyCheckbox = document.getElementById('income-luana-biweekly');
const incomeGabrielBiweeklyCheckbox = document.getElementById('income-gabriel-biweekly');
const incomeLuanaBiweeklyPreview = document.getElementById('income-luana-biweekly-preview');
const incomeGabrielBiweeklyPreview = document.getElementById('income-gabriel-biweekly-preview');
const btnSaveIncome = document.getElementById('btn-save-income');
const btnLoadMonth = document.getElementById('btn-load-month');
const btnToggleIncome = document.getElementById('btn-toggle-income');
const incomePanel = document.getElementById('income-panel');
const btnTogglePayments = document.getElementById('btn-toggle-payments');
const paymentsPanel = document.getElementById('payments-panel');
const btnToggleReimbursement = document.getElementById('btn-toggle-reimbursement');
const reimbursementPanel = document.getElementById('reimbursement-panel');

function updateIncomeBiweeklyPreview(input, checkbox, preview) {
  if (!input || !checkbox || !preview) return;

  const sourceAmount = parseAmount(input.value);
  const canPreview = checkbox.checked && Number.isFinite(sourceAmount);
  preview.classList.toggle('visible', canPreview);
  preview.innerHTML = canPreview
    ? `Renda mensal considerada: <strong>${formatCurrency(Math.abs(convertBiweeklyToMonthly(sourceAmount)))}</strong> <span>(26 pagamentos ÷ 12 meses)</span>`
    : '';
}

function updateIncomeBiweeklyPreviews() {
  updateIncomeBiweeklyPreview(incomeLuanaInput, incomeLuanaBiweeklyCheckbox, incomeLuanaBiweeklyPreview);
  updateIncomeBiweeklyPreview(incomeGabrielInput, incomeGabrielBiweeklyCheckbox, incomeGabrielBiweeklyPreview);
}

incomeLuanaInput?.addEventListener('input', updateIncomeBiweeklyPreviews);
incomeGabrielInput?.addEventListener('input', updateIncomeBiweeklyPreviews);
incomeLuanaBiweeklyCheckbox?.addEventListener('change', updateIncomeBiweeklyPreviews);
incomeGabrielBiweeklyCheckbox?.addEventListener('change', updateIncomeBiweeklyPreviews);

window.updateToggleButtonsState = function (activeBtn) {
  const btns = [btnToggleIncome, btnTogglePayments, btnToggleReimbursement];
  btns.forEach((btn) => {
    if (btn) {
      btn.style.background = '';
      btn.style.color = '';
      btn.style.fontWeight = '';
    }
  });
  if (activeBtn) {
    activeBtn.style.background = '#fddf7b';
    activeBtn.style.color = '#12121c';
    activeBtn.style.fontWeight = 'bold';
  }
};

btnToggleIncome.addEventListener('click', () => {
  paymentsPanel.style.display = 'none';
  reimbursementPanel.style.display = 'none';
  const isHidden = incomePanel.style.display === 'none';
  incomePanel.style.display = isHidden ? 'block' : 'none';
  window.updateToggleButtonsState(isHidden ? btnToggleIncome : null);
});

btnTogglePayments.addEventListener('click', () => {
  incomePanel.style.display = 'none';
  reimbursementPanel.style.display = 'none';
  const isHidden = paymentsPanel.style.display === 'none';
  paymentsPanel.style.display = isHidden ? 'block' : 'none';
  window.updateToggleButtonsState(isHidden ? btnTogglePayments : null);
});

btnToggleReimbursement.addEventListener('click', () => {
  incomePanel.style.display = 'none';
  paymentsPanel.style.display = 'none';
  const isHidden = reimbursementPanel.style.display === 'none';
  reimbursementPanel.style.display = isHidden ? 'block' : 'none';
  window.updateToggleButtonsState(isHidden ? btnToggleReimbursement : null);
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
  logActivity('Adicionou', `Reembolso: ${merchant} - ${formatCurrency(Math.abs(amount))}`);

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
  logActivity(editingPaymentId ? 'Editou' : 'Adicionou', `Cartão/Método: ${name}`);

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
  const methodToDelete = paymentMethods.find((m) => m.id === id);
  const updatedMethods = paymentMethods.filter((m) => m.id !== id);
  await FinanceAPI.savePaymentMethods(updatedMethods);
  if (methodToDelete) logActivity('Excluiu', `Cartão/Método: ${methodToDelete.name}`);
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
const summaryFreeProjectionToggle = document.getElementById('summary-free-projection-toggle');

let isFreeProjectionExpanded = false;

function toggleFreeProjectionDetails() {
  if (!summaryFreeProjectionToggle || summaryFreeProjectionToggle.getAttribute('aria-disabled') === 'true') return;
  isFreeProjectionExpanded = !isFreeProjectionExpanded;
  updateGlobalSummaries();
}

summaryFreeProjectionToggle?.addEventListener('click', toggleFreeProjectionDetails);
summaryFreeProjectionToggle?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    toggleFreeProjectionDetails();
  }
});

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

  const luanaIsBiweekly = Boolean(income?.luanaIsBiweekly);
  const gabrielIsBiweekly = Boolean(income?.gabrielIsBiweekly);

  incomeLuanaBiweeklyCheckbox.checked = luanaIsBiweekly;
  incomeGabrielBiweeklyCheckbox.checked = gabrielIsBiweekly;
  incomeLuanaInput.value = income ? (luanaIsBiweekly ? income.luanaBiweeklyAmount ?? Math.round(((income.luana || 0) / BIWEEKLY_MONTHLY_FACTOR) * 100) / 100 : income.luana || 0) : 0;
  incomeGabrielInput.value = income ? (gabrielIsBiweekly ? income.gabrielBiweeklyAmount ?? Math.round(((income.gabriel || 0) / BIWEEKLY_MONTHLY_FACTOR) * 100) / 100 : income.gabriel || 0) : 0;
  updateIncomeBiweeklyPreviews();
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
            staticSyncId: newItem.staticSyncId,
          };
          if (item.isBiweeklyConverted) {
            receiptData.isBiweeklyConverted = true;
            receiptData.biweeklyAmount = item.biweeklyAmount;
            receiptData.biweeklyMonthlyAmount = item.amount;
          }
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

  const luanaSourceAmount = parseAmount(incomeLuanaInput.value) || 0;
  const gabrielSourceAmount = parseAmount(incomeGabrielInput.value) || 0;
  const luanaIsBiweekly = Boolean(incomeLuanaBiweeklyCheckbox?.checked);
  const gabrielIsBiweekly = Boolean(incomeGabrielBiweeklyCheckbox?.checked);
  const luana = luanaIsBiweekly ? convertBiweeklyToMonthly(luanaSourceAmount) : luanaSourceAmount;
  const gabriel = gabrielIsBiweekly ? convertBiweeklyToMonthly(gabrielSourceAmount) : gabrielSourceAmount;
  const conversionData = {
    luanaIsBiweekly,
    gabrielIsBiweekly,
    luanaBiweeklyAmount: luanaIsBiweekly ? luanaSourceAmount : null,
    gabrielBiweeklyAmount: gabrielIsBiweekly ? gabrielSourceAmount : null,
  };

  btnSaveIncome.textContent = 'Salvando...';
  btnSaveIncome.disabled = true;

  await FinanceAPI.saveIncome(month, luana, gabriel, conversionData);
  logActivity('Editou', `Rendas de ${month} - Luana: CAD ${luana} / Gabriel: CAD ${gabriel}`);

  const index = incomes.findIndex((i) => i.month === month);
  if (index !== -1) {
    incomes[index] = { month, luana, gabriel, ...conversionData };
  } else {
    incomes.push({ month, luana, gabriel, ...conversionData });
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

function changeMonthBy(offset) {
  const current = monthInput.value;
  if (!current) return;

  const [year, month] = current.split('-').map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  const newYear = date.getFullYear();
  const newMonth = String(date.getMonth() + 1).padStart(2, '0');

  monthInput.value = `${newYear}-${newMonth}`;
  monthInput.dispatchEvent(new Event('change'));
}

document.getElementById('btn-prev-month')?.addEventListener('click', (e) => {
  e.preventDefault();
  changeMonthBy(-1);
});

document.getElementById('btn-next-month')?.addEventListener('click', (e) => {
  e.preventDefault();
  changeMonthBy(1);
});

document.getElementById('btn-home-month')?.addEventListener('click', (e) => {
  e.preventDefault();
  const todayMonth = getCurrentMonthISO();
  // Só recarrega se o mês selecionado for diferente do mês atual
  if (monthInput.value !== todayMonth) {
    monthInput.value = todayMonth;
    monthInput.dispatchEvent(new Event('change'));
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
const COMPANY_FAVORITE_SEPARATOR = '\u001f';
const favoriteCompanyKeys = new Set();
let companyDragState = null;
let companyDragSuppressClickUntil = 0;

function makeCompanyFavoriteKey(category, company) {
  return `${category}${COMPANY_FAVORITE_SEPARATOR}${company}`;
}

function getMatchingCompanyFavoriteKeys(category, company) {
  const companyKey = normalizeCompanyNameKey(company);
  return [...favoriteCompanyKeys].filter((key) => {
    const [favoriteCategory, favoriteCompany] = key.split(COMPANY_FAVORITE_SEPARATOR);
    return favoriteCategory === category && normalizeCompanyNameKey(favoriteCompany) === companyKey;
  });
}

function isFavoriteCompany(category, company) {
  return getMatchingCompanyFavoriteKeys(category, company).length > 0;
}

async function toggleFavoriteCompany(category, company) {
  const key = makeCompanyFavoriteKey(category, company);
  const matchingKeys = getMatchingCompanyFavoriteKeys(category, company);
  const wasFavorite = matchingKeys.length > 0;
  if (wasFavorite) matchingKeys.forEach((matchingKey) => favoriteCompanyKeys.delete(matchingKey));
  else favoriteCompanyKeys.add(key);

  updatePlannedChips();
  updateReceiptChips();

  try {
    await FinanceAPI.saveCompanyFavorites([...favoriteCompanyKeys].sort(compareFinancialNames));
  } catch (error) {
    if (wasFavorite) matchingKeys.forEach((matchingKey) => favoriteCompanyKeys.add(matchingKey));
    else favoriteCompanyKeys.delete(key);
    updatePlannedChips();
    updateReceiptChips();
    showToast('Não foi possível atualizar o favorito.', 'error');
  }
}

function clearCompanyDragTarget(state) {
  if (state.target) state.target.classList.remove('is-company-drag-over');
  state.target = null;
}

function updateCompanyDragPosition(state, clientX, clientY) {
  if (!state.active) return;

  const maxLeft = Math.max(window.innerWidth - state.ghost.offsetWidth - 8, 8);
  const maxTop = Math.max(window.innerHeight - state.ghost.offsetHeight - 8, 8);
  state.ghost.style.left = `${Math.min(clientX + 12, maxLeft)}px`;
  state.ghost.style.top = `${Math.min(clientY + 12, maxTop)}px`;

  const target = document.elementFromPoint(clientX, clientY)?.closest('[data-company-drop-category]') || null;
  if (target !== state.target) {
    clearCompanyDragTarget(state);
    state.target = target;
    if (state.target) state.target.classList.add('is-company-drag-over');
  }
}

function startCompanyDrag(state, clientX, clientY) {
  if (companyDragState !== state) return;
  state.active = true;
  state.sourceElement.classList.add('company-chip-dragging-source');
  document.body.classList.add('company-chip-drag-active');

  const rect = state.sourceElement.getBoundingClientRect();
  state.ghost = state.sourceElement.cloneNode(true);
  state.ghost.className = 'chip chip-company company-chip-drag-ghost';
  state.ghost.style.width = `${rect.width}px`;
  state.ghost.querySelectorAll('button').forEach((button) => button.remove());
  document.body.appendChild(state.ghost);
  if (navigator.vibrate) navigator.vibrate(20);
  updateCompanyDragPosition(state, clientX, clientY);
}

function cleanupCompanyDrag(state) {
  clearTimeout(state.pressTimer);
  clearCompanyDragTarget(state);
  state.sourceElement?.classList.remove('company-chip-dragging-source');
  state.ghost?.remove();
  document.body.classList.remove('company-chip-drag-active');
  if (companyDragState === state) companyDragState = null;
}

async function moveCompanyToCategory(company, sourceCategory, targetCategory) {
  if (!company || !targetCategory || sourceCategory === targetCategory) return;

  const companyKey = normalizeCompanyNameKey(company);
  const targetAlreadyContainsCompany = (companyDirectory[targetCategory] || []).some((item) => normalizeCompanyNameKey(item) === companyKey);
  const mergeNotice = targetAlreadyContainsCompany ? '\n\nA empresa já existe no destino; os dois registros serão unificados.' : '';
  const confirmed = await showConfirm(
    `Mover "${company}" de "${sourceCategory}" para "${targetCategory}"?${mergeNotice}\n\nIsso altera apenas a lista de empresas. Lançamentos já cadastrados não serão modificados.`,
  );
  if (!confirmed) return;

  const sourceBackup = [...(companyDirectory[sourceCategory] || [])];
  const targetBackup = [...(companyDirectory[targetCategory] || [])];
  const favoriteBackup = new Set(favoriteCompanyKeys);

  companyDirectory[sourceCategory] = sourceBackup.filter((item) => normalizeCompanyNameKey(item) !== companyKey);
  if (!targetAlreadyContainsCompany) companyDirectory[targetCategory] = [...targetBackup, company];
  const favoritesChanged = remapFavoriteCompanies(sourceCategory, targetCategory, company, company);

  updatePlannedChips();
  updateReceiptChips();

  try {
    await FinanceAPI.saveCompanies(companyDirectory);
    if (favoritesChanged) await FinanceAPI.saveCompanyFavorites([...favoriteCompanyKeys].sort(compareFinancialNames));
    logActivity('Moveu', `Empresa: ${company} • ${sourceCategory} → ${targetCategory}`);
    showToast(`${company} movida para ${targetCategory}.`, 'success');
  } catch (error) {
    companyDirectory[sourceCategory] = sourceBackup;
    companyDirectory[targetCategory] = targetBackup;
    favoriteCompanyKeys.clear();
    favoriteBackup.forEach((key) => favoriteCompanyKeys.add(key));
    updatePlannedChips();
    updateReceiptChips();
    showToast('Não foi possível mover a empresa.', 'error');
  }
}

function enableCompanyChipDrag(chip, category, company) {
  chip.title = 'Pressione e arraste para mudar de categoria';
  chip.addEventListener('contextmenu', (event) => event.preventDefault());
  chip.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.company-favorite-button')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (companyDragState) return;

    const state = {
      company,
      sourceCategory: category,
      sourceElement: chip,
      active: false,
      target: null,
      ghost: null,
      lastX: event.clientX,
      lastY: event.clientY,
    };
    companyDragState = state;
    state.pressTimer = setTimeout(() => startCompanyDrag(state, state.lastX, state.lastY), event.pointerType === 'mouse' ? 140 : 380);

    const onPointerMove = (moveEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return;
      state.lastX = moveEvent.clientX;
      state.lastY = moveEvent.clientY;
      if (state.active) {
        moveEvent.preventDefault();
        updateCompanyDragPosition(state, moveEvent.clientX, moveEvent.clientY);
      }
    };

    const finishDrag = (finishEvent) => {
      if (finishEvent.pointerId !== event.pointerId) return;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', cancelDrag);

      if (state.active) updateCompanyDragPosition(state, finishEvent.clientX, finishEvent.clientY);
      const targetCategory = state.target?.dataset.companyDropCategory || null;
      const wasActive = state.active;
      cleanupCompanyDrag(state);
      if (wasActive) companyDragSuppressClickUntil = Date.now() + 450;
      if (wasActive && targetCategory && targetCategory !== state.sourceCategory) {
        moveCompanyToCategory(state.company, state.sourceCategory, targetCategory);
      }
    };

    const cancelDrag = (cancelEvent) => {
      if (cancelEvent.pointerId !== event.pointerId) return;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', cancelDrag);
      cleanupCompanyDrag(state);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', cancelDrag);
  });
}

function renderTypeChips(container, selectedType, onSelect) {
  container.innerHTML = '';
  const categories = getCategories();

  categories.forEach((type) => {
    const chip = document.createElement('div');
    chip.className = 'chip' + (type === selectedType ? ' active' : '') + (isEditMode ? ' edit-mode' : '');
    chip.dataset.companyDropCategory = type;
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
  const companies = getUniqueCompanyNames(companyDirectory[type] || []).sort((a, b) => {
    const favoriteDifference = Number(isFavoriteCompany(type, b)) - Number(isFavoriteCompany(type, a));
    return favoriteDifference || compareFinancialNames(a, b);
  });

  if (!companies.length && !isEditMode) {
    const span = document.createElement('span');
    span.className = 'hint small';
    span.textContent = 'Nenhuma empresa cadastrada para este tipo ainda. Digite abaixo para adicionar.';
    container.appendChild(span);
    return;
  }

  let filterInput = null;
  if (companies.length >= 5) {
    const filterWrap = document.createElement('div');
    filterWrap.className = 'company-chip-filter-wrap';
    filterWrap.innerHTML = '<span aria-hidden="true">⌕</span>';
    filterInput = document.createElement('input');
    filterInput.type = 'search';
    filterInput.className = 'company-chip-filter';
    filterInput.placeholder = 'Filtrar empresas...';
    filterInput.setAttribute('aria-label', `Filtrar empresas de ${type}`);
    filterWrap.appendChild(filterInput);
    container.appendChild(filterWrap);
  }

  const renderedChips = [];
  companies.forEach((name) => {
    const chip = document.createElement('div');
    const isFavorite = isFavoriteCompany(type, name);
    chip.className = 'chip chip-company' + (isEditMode ? ' edit-mode' : '') + (isFavorite ? ' is-favorite' : '');
    chip.dataset.filterText = normalizeSearchText(name);

    const dragHandle = document.createElement('span');
    dragHandle.className = 'company-drag-handle';
    dragHandle.textContent = '⠿';
    dragHandle.setAttribute('aria-hidden', 'true');
    chip.appendChild(dragHandle);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'company-chip-name';
    nameSpan.textContent = name;
    chip.appendChild(nameSpan);

    if (!isEditMode) {
      const favoriteButton = document.createElement('button');
      favoriteButton.type = 'button';
      favoriteButton.className = 'company-favorite-button';
      favoriteButton.textContent = isFavorite ? '★' : '☆';
      favoriteButton.title = isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
      favoriteButton.setAttribute('aria-label', `${isFavorite ? 'Remover' : 'Adicionar'} ${name} ${isFavorite ? 'dos' : 'aos'} favoritos`);
      favoriteButton.setAttribute('aria-pressed', String(isFavorite));
      favoriteButton.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleFavoriteCompany(type, name);
      });
      chip.appendChild(favoriteButton);
    }

    chip.addEventListener('click', () => {
      if (Date.now() < companyDragSuppressClickUntil) return;
      if (isEditMode) handleEditCompany(type, name);
      else {
        container.querySelectorAll('.chip-company.active').forEach((companyChip) => companyChip.classList.remove('active'));
        chip.classList.add('active');
        onSelectCompany(name);
      }
    });
    enableCompanyChipDrag(chip, type, name);
    container.appendChild(chip);
    renderedChips.push(chip);
  });

  const noResults = document.createElement('span');
  noResults.className = 'company-filter-empty hint small';
  noResults.textContent = 'Nenhuma empresa encontrada.';
  noResults.hidden = true;
  container.appendChild(noResults);

  filterInput?.addEventListener('input', () => {
    const term = normalizeSearchText(filterInput.value);
    let visibleCount = 0;
    renderedChips.forEach((chip) => {
      const isVisible = !term || chip.dataset.filterText.includes(term);
      chip.classList.toggle('is-filtered-out', !isVisible);
      if (isVisible) visibleCount++;
    });
    noResults.hidden = visibleCount > 0;
  });
}

function getExistingCategoryName(value) {
  const normalizedValue = normalizeSearchText(value);
  if (!normalizedValue) return '';
  return getCategories().find((category) => normalizeSearchText(category) === normalizedValue) || '';
}

function updateAutoCreateNotice(categoryInputId, companyInputId, categoryNoticeId, companyNoticeId) {
  const categoryInput = document.getElementById(categoryInputId);
  const companyInput = document.getElementById(companyInputId);
  const categoryNotice = document.getElementById(categoryNoticeId);
  const companyNotice = document.getElementById(companyNoticeId);
  if (!categoryInput || !companyInput || !categoryNotice || !companyNotice) return;

  const categoryValue = categoryInput.value.trim();
  const companyValue = companyInput.value.trim();
  const existingCategory = getExistingCategoryName(categoryValue);
  const isNewCategory = Boolean(categoryValue && !existingCategory);
  const categoryCompanies = existingCategory ? companyDirectory[existingCategory] || [] : [];
  const isNewCompany = Boolean(companyValue && !categoryCompanies.some((company) => normalizeSearchText(company) === normalizeSearchText(companyValue)));

  categoryNotice.textContent = isNewCategory ? '✦ Nova categoria — será criada ao salvar' : '';
  categoryNotice.classList.toggle('visible', isNewCategory);
  companyNotice.textContent = isNewCompany ? '✦ Nova empresa — será criada ao salvar' : '';
  companyNotice.classList.toggle('visible', isNewCompany);
}

function updateAutoCreateNotices() {
  updateAutoCreateNotice('planned-category', 'planned-description', 'planned-category-create-notice', 'planned-company-create-notice');
  updateAutoCreateNotice('actual-category', 'actual-merchant', 'actual-category-create-notice', 'actual-company-create-notice');
  updateAutoCreateNotice('annual-category', 'annual-name', 'annual-category-create-notice', 'annual-company-create-notice');
}

document.addEventListener('input', (event) => {
  if (['planned-category', 'planned-description', 'actual-category', 'actual-merchant', 'annual-category', 'annual-name'].includes(event.target.id)) updateAutoCreateNotices();
});

function remapFavoriteCompanies(oldCategory, newCategory = null, oldCompany = null, newCompany = null) {
  let changed = false;
  [...favoriteCompanyKeys].forEach((key) => {
    const [category, company] = key.split(COMPANY_FAVORITE_SEPARATOR);
    if (category !== oldCategory || (oldCompany !== null && normalizeCompanyNameKey(company) !== normalizeCompanyNameKey(oldCompany))) return;

    favoriteCompanyKeys.delete(key);
    if (newCategory !== null) favoriteCompanyKeys.add(makeCompanyFavoriteKey(newCategory, newCompany ?? company));
    changed = true;
  });
  return changed;
}

async function handleEditCategory(oldName) {
  const newName = await showPrompt(`Renomear a categoria "${oldName}"?\n\nDeixe em branco e clique em OK para EXCLUIR.`, oldName);
  if (newName === null) return;

  const trimmed = newName.trim();
  let favoritesChanged = false;
  if (trimmed === '') {
    if (await showConfirm(`Atenção: Excluir a categoria "${oldName}" vai sumir com todas as empresas dentro dela. Continuar?`, true)) {
      delete companyDirectory[oldName];
      favoritesChanged = remapFavoriteCompanies(oldName);
      showToast('Categoria excluída.', 'success');
    }
  } else if (trimmed !== oldName) {
    companyDirectory[trimmed] = companyDirectory[oldName];
    delete companyDirectory[oldName];
    favoritesChanged = remapFavoriteCompanies(oldName, trimmed);
    if (selectedPlannedType === oldName) selectedPlannedType = trimmed;
    if (selectedReceiptType === oldName) selectedReceiptType = trimmed;
    showToast('Categoria renomeada.', 'success');
  }

  updatePlannedChips();
  updateReceiptChips();
  await FinanceAPI.saveCompanies(companyDirectory);
  if (favoritesChanged) await FinanceAPI.saveCompanyFavorites([...favoriteCompanyKeys].sort(compareFinancialNames));
}

async function handleEditCompany(category, oldName) {
  const newName = await showPrompt(`Renomear a empresa "${oldName}"?\n\nDeixe em branco e clique em OK para EXCLUIR.`, oldName);
  if (newName === null) return;

  const trimmed = newName.trim().toUpperCase();
  let favoritesChanged = false;
  if (trimmed === '') {
    if (await showConfirm(`Excluir a empresa "${oldName}"?`, true)) {
      const oldCompanyKey = normalizeCompanyNameKey(oldName);
      companyDirectory[category] = companyDirectory[category].filter((company) => normalizeCompanyNameKey(company) !== oldCompanyKey);
      favoritesChanged = remapFavoriteCompanies(category, null, oldName);
      showToast('Empresa excluída.', 'success');
    }
  } else if (trimmed !== oldName) {
    const oldCompanyKey = normalizeCompanyNameKey(oldName);
    const newCompanyKey = normalizeCompanyNameKey(trimmed);
    const remainingCompanies = companyDirectory[category].filter((company) => normalizeCompanyNameKey(company) !== oldCompanyKey);
    if (!remainingCompanies.some((company) => normalizeCompanyNameKey(company) === newCompanyKey)) remainingCompanies.push(trimmed);
    companyDirectory[category] = remainingCompanies;
    favoritesChanged = remapFavoriteCompanies(category, category, oldName, trimmed);
    showToast('Empresa renomeada.', 'success');
  }

  updatePlannedChips();
  updateReceiptChips();
  await FinanceAPI.saveCompanies(companyDirectory);
  if (favoritesChanged) await FinanceAPI.saveCompanyFavorites([...favoriteCompanyKeys].sort(compareFinancialNames));
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
    updateAutoCreateNotices();
  });
  updateAutoCreateNotices();
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
    updateAutoCreateNotices();
  });

  if (typeof updateAnnualChips === 'function') updateAnnualChips();
  updateAutoCreateNotices();
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
const plannedBiweeklyCheckbox = document.getElementById('planned-biweekly');
const plannedBiweeklyPreview = document.getElementById('planned-biweekly-preview');
const labelPlannedStatic = document.getElementById('label-planned-static');
const plannedSubmitBtn = document.getElementById('planned-submit-btn');
function updateBiweeklyConversionPreview() {
  if (!plannedBiweeklyPreview || !plannedBiweeklyCheckbox) return;

  const sourceAmount = parseAmount(plannedAmountInput.value);
  const canPreview = plannedBiweeklyCheckbox.checked && Number.isFinite(sourceAmount);
  plannedBiweeklyPreview.classList.toggle('visible', canPreview);
  plannedBiweeklyPreview.innerHTML = canPreview
    ? `No orçamento mensal: <strong>${formatCurrency(Math.abs(convertBiweeklyToMonthly(sourceAmount)))}</strong> <span>(26 pagamentos ÷ 12 meses)</span>`
    : '';
}

plannedAmountInput.addEventListener('input', updateBiweeklyConversionPreview);
plannedBiweeklyCheckbox?.addEventListener('change', updateBiweeklyConversionPreview);

function closeOptionHelpPopovers(exceptControl = null) {
  document.querySelectorAll('.option-control.is-help-open').forEach((control) => {
    if (control === exceptControl) return;
    control.classList.remove('is-help-open');
    control.querySelector('.option-help-button')?.setAttribute('aria-expanded', 'false');
  });
}

document.addEventListener('click', (event) => {
  const helpButton = event.target.closest('.option-help-button');
  if (helpButton) {
    event.preventDefault();
    event.stopPropagation();
    const control = helpButton.closest('.option-control');
    const willOpen = !control.classList.contains('is-help-open');
    closeOptionHelpPopovers(control);
    control.classList.toggle('is-help-open', willOpen);
    helpButton.setAttribute('aria-expanded', String(willOpen));
    return;
  }

  if (!event.target.closest('.option-help-popover')) closeOptionHelpPopovers();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeOptionHelpPopovers();
});

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

  const companyKey = normalizeCompanyNameKey(n);
  if (!companyDirectory[t].some((company) => normalizeCompanyNameKey(company) === companyKey)) {
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
  const sourceAmount = parseAmount(plannedAmountInput.value);
  const isBiweeklyConverted = Boolean(plannedBiweeklyCheckbox?.checked);
  const amount = isBiweeklyConverted ? convertBiweeklyToMonthly(sourceAmount) : sourceAmount;
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

  const syncId = oldItem && oldItem.staticSyncId ? oldItem.staticSyncId : `sync_${Date.now()}`;

  const itemData = { date, category, description, amount, owner, paymentMethodId, fixed, isStatic, month };
  if (isBiweeklyConverted) {
    itemData.isBiweeklyConverted = true;
    itemData.biweeklyAmount = sourceAmount;
  }
  if (isStatic) itemData.staticSyncId = syncId;
  if (editingPlannedId !== null) itemData.id = editingPlannedId;

  await FinanceAPI.savePlanned(month, itemData);
  logActivity(editingPlannedId ? 'Editou' : 'Adicionou', `Previsto: ${description} - ${formatCurrency(amount)}`);

  if (editingPlannedId === null) {
    if (isStatic) {
      const receiptData = { date: date, category, merchant: description, amount, owner, paymentMethodId, isStatic: true, staticSyncId: syncId };
      if (isBiweeklyConverted) {
        receiptData.isBiweeklyConverted = true;
        receiptData.biweeklyAmount = sourceAmount;
        receiptData.biweeklyMonthlyAmount = amount;
      }
      await FinanceAPI.saveReceipt(month, receiptData);
    }
  } else if (oldItem) {
    const linkedReceipt = receipts.find((r) => {
      if (r.staticSyncId && oldItem.staticSyncId) return r.staticSyncId === oldItem.staticSyncId;
      return r.date.startsWith(month) && r.category === oldItem.category && r.merchant === oldItem.description && r.owner === oldItem.owner && r.amount === oldItem.amount && r.isStatic;
    });

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
          staticSyncId: syncId,
        };
        if (isBiweeklyConverted) {
          updatedReceipt.isBiweeklyConverted = true;
          updatedReceipt.biweeklyAmount = sourceAmount;
          updatedReceipt.biweeklyMonthlyAmount = amount;
        }
        await FinanceAPI.saveReceipt(month, updatedReceipt);
      } else {
        await FinanceAPI.deleteReceipt(month, linkedReceipt.id);
      }
    } else if (isStatic) {
      const receiptData = { date: date, category, merchant: description, amount, owner, paymentMethodId, isStatic: true, staticSyncId: syncId };
      if (isBiweeklyConverted) {
        receiptData.isBiweeklyConverted = true;
        receiptData.biweeklyAmount = sourceAmount;
        receiptData.biweeklyMonthlyAmount = amount;
      }
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
  updateBiweeklyConversionPreview();

  selectedPlannedType = getCategories()[0] || '';
  plannedCategoryInput.value = selectedPlannedType;

  const selectedMonth = getCurrentMonth();
  const today = getLocalDateString();
  if (plannedDateInput) {
    plannedDateInput.value = today.startsWith(selectedMonth) ? today : `${selectedMonth}-01`;
  }

  updatePlannedChips();
}

function renderBiweeklyConversionBadge(item) {
  if (!item?.isBiweeklyConverted) return '';

  const sourceAmount = item.biweeklyAmount ?? Math.round(((item.amount ?? item.planned ?? 0) / BIWEEKLY_MONTHLY_FACTOR) * 100) / 100;
  const monthlyAmount = item.biweeklyMonthlyAmount ?? item.amount ?? item.planned ?? convertBiweeklyToMonthly(sourceAmount);
  const explanation = `Bisemanal: ${formatCurrency(Math.abs(sourceAmount))} → mensal: ${formatCurrency(Math.abs(monthlyAmount))}`;
  return ` <span class="biweekly-conversion-badge" title="${explanation}" aria-label="${explanation}">Bis. → mensal</span>`;
}

function startEditPlanned(id) {
  const item = plannedItems.find((p) => p.id === id);
  if (!item) return;
  editingPlannedId = id;

  plannedDateInput.value = item.date || '';
  plannedCategoryInput.value = item.category;
  plannedDescriptionInput.value = item.description;
  plannedBiweeklyCheckbox.checked = Boolean(item.isBiweeklyConverted);
  plannedAmountInput.value = item.isBiweeklyConverted ? item.biweeklyAmount ?? Math.round((item.amount / BIWEEKLY_MONTHLY_FACTOR) * 100) / 100 : item.amount;
  updateBiweeklyConversionPreview();
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
  logActivity('Excluiu', `Previsto: ${p.description} - ${formatCurrency(Math.abs(p.amount))}`);

  if (p.isStatic) {
    const receiptToDelete = receipts.find((r) => {
      if (r.staticSyncId && p.staticSyncId) return r.staticSyncId === p.staticSyncId;
      return r.date.startsWith(month) && r.category === p.category && r.merchant === p.description && r.owner === p.owner && r.amount === p.amount && r.isStatic;
    });
    if (receiptToDelete) {
      await FinanceAPI.deleteReceipt(month, receiptToDelete.id);
    }
  }

  if (editingPlannedId === id) resetPlannedForm();
  showToast('Item do orçamento excluído.', 'success');
}

window.startLaunchToReal = function (id) {
  const p = plannedItems.find((x) => x.id === id);
  if (!p) return;

  // Salva o ID do item previsto para fazer o vínculo exato
  window.currentLaunchPlannedId = id;

  // Troca para a aba de Lançamento Real (Notas)
  document.querySelector('.nav-btn[data-view="receipts"]').click();

  // Preenche o formulário com os dados do orçamento
  actualDateInput.value = p.date || `${p.month}-01`;
  actualCategoryInput.value = p.category;
  actualMerchantInput.value = p.description;
  actualAmountInput.value = Math.abs(p.amount);
  actualOwnerSelect.value = p.owner || 'Ambos';
  document.getElementById('actual-payment').value = p.paymentMethodId || 'dinheiro';
  actualObservationInput.value = p.observation || ''; // Linha adicionada para trazer a observação

  // Marca o checkbox sozinho se for uma entrada
  const isIncomeCheck = document.getElementById('actual-is-income');
  if (isIncomeCheck) isIncomeCheck.checked = p.amount < 0 || p.isIncome;

  // Atualiza as tags (chips) visuais
  if (getCategories().includes(p.category)) {
    selectedReceiptType = p.category;
    updateReceiptChips();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
  showToast('Confirme os dados e clique em Salvar Nota Fiscal.', 'info');
};

async function deleteReceipt(id) {
  const r = receipts.find((x) => x.id === id);
  if (!r) return;

  const msg = r.isStatic ? `A nota fiscal de "${r.merchant}" é ESTÁTICA. Excluí-la aqui também apagará a previsão no Orçamento. Deseja continuar?` : `Excluir a nota fiscal de "${r.merchant}"?`;

  if (!(await showConfirm(msg, true))) return;

  const month = r.date.substring(0, 7);
  await FinanceAPI.deleteReceipt(month, id);
  logActivity('Excluiu', `Real/Nota: ${r.merchant} - ${formatCurrency(Math.abs(r.amount))}`);

  if (r.isStatic) {
    const plannedToDelete = plannedItems.find((p) => {
      if (p.staticSyncId && r.staticSyncId) return p.staticSyncId === r.staticSyncId;
      return p.month === month && p.category === r.category && p.description === r.merchant && p.owner === r.owner && p.amount === r.amount && p.isStatic;
    });
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
let plannedSearchTerm = '';

let receiptsSortType = 'date';
let receiptsSortOrder = 'desc';
let receiptsSearchTerm = '';

let dashSortType = 'date'; // Sincronizado com o HTML
let dashSortOrder = 'desc';

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function matchesFinancialSearch(item, term, descriptionField) {
  const normalizedTerm = normalizeSearchText(term);
  if (!normalizedTerm) return true;

  const searchableText = [item.category, item[descriptionField], item.owner].map(normalizeSearchText).join(' ');
  if (searchableText.includes(normalizedTerm)) return true;

  const digits = normalizedTerm.replace(/\D/g, '');
  const amountDigits = [item.amount, item.biweeklyAmount]
    .filter((amount) => Number.isFinite(Number(amount)))
    .map((amount) => Math.abs(Number(amount)).toFixed(2).replace(/\D/g, ''));
  return digits.length > 0 && amountDigits.some((amount) => amount.includes(digits));
}

document.getElementById('search-planned')?.addEventListener('input', (event) => {
  plannedSearchTerm = event.target.value;
  renderPlannedItemsList(getCurrentMonth());
});

document.getElementById('search-receipts')?.addEventListener('input', (event) => {
  receiptsSearchTerm = event.target.value;
  updateReceiptsView();
});

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
  const allItems = plannedItems.filter((p) => p.month === month);
  const isSearching = Boolean(normalizeSearchText(plannedSearchTerm));
  const items = allItems.filter((p) => matchesFinancialSearch(p, plannedSearchTerm, 'description'));

  if (!items.length) {
    plannedItemsList.innerHTML = isSearching ? "<p class='hint'>Nenhum resultado encontrado.</p>" : "<p class='hint'>Nenhum item de orçamento cadastrado para este mês.</p>";
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

        // Corrigido para usar as variáveis do orçamento (plannedSortType) e o campo correto (.description)
        if (plannedSortType === 'amount') {
          valA = a.amount;
          valB = b.amount;
        } else if (plannedSortType === 'date') {
          valA = a.date || '';
          valB = b.date || '';
        } else {
          valA = (a.description || '').toLowerCase();
          valB = (b.description || '').toLowerCase();
        }

        if (plannedSortOrder === 'asc') return valA > valB ? 1 : -1;
        return valA < valB ? 1 : -1;
      });
      const isOpen = isSearching || openPlannedCats.has(cat);
      const catTotal = groupItems.reduce((acc, curr) => acc + curr.amount, 0);

      // Verifica se há pelo menos 1 item nesta categoria que seja EVENTO (Anual ou Situacional) e esteja pendente
      const hasPendingInGroup = groupItems.some((p) => {
        const isEvent = p.linkedAnnualId || p.category === 'Eventos';
        if (!isEvent) return false;

        const isLaunched = receipts.some((r) => {
          if (r.linkedPlannedId) return r.linkedPlannedId === p.id;
          return r.date.startsWith(month) && r.category === p.category && r.merchant.toLowerCase() === p.description.toLowerCase() && r.owner === p.owner && Math.abs(r.amount) === Math.abs(p.amount);
        });
        return !isLaunched;
      });

      const hasEvent = groupItems.some((p) => p.linkedAnnualId || p.category === 'Eventos');
      const headerDiv = document.createElement('div');
      headerDiv.className = 'group-header-div';

      // Aplica o fundo e borda amarela se houver pendência
      if (hasPendingInGroup) {
        headerDiv.style.background = 'linear-gradient(90deg, rgba(247, 200, 74, 0.15) 0%, #1a1a2e 100%)';
        headerDiv.style.borderLeft = '4px solid #f7c84a';
      }

      const catBadge = hasEvent
        ? ' <span style="background: rgba(253, 223, 123, 0.15); color: #fddf7b; padding: 2px 6px; border-radius: 6px; font-size: 0.65rem; border: 1px solid rgba(253, 223, 123, 0.3); margin-left: 6px; vertical-align: middle;">Evento</span>'
        : '';

      headerDiv.innerHTML = `
      <span style="color: #f5f5f5; display: flex; align-items: center;"><span class="toggle-icon">${isOpen ? '▼' : '▶'}</span> ${cat}${catBadge}</span>
      <span style="color:#a6a6c0; font-size:0.85rem; font-weight:normal;">${formatCurrency(catTotal)}</span>
    `;

      headerDiv.onclick = () => {
        if (isSearching) return;
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
          const obsHtml = p.observation ? `<div style="font-size: 0.75rem; color: #a6a6c0; margin-top: 2px;">↳ ${p.observation}</div>` : '';
          const isEventItem = p.linkedAnnualId || p.category === 'Eventos';
          const annualBadge = isEventItem
            ? ' <span style="background: rgba(253, 223, 123, 0.15); color: #fddf7b; padding: 2px 6px; border-radius: 6px; font-size: 0.65rem; border: 1px solid rgba(253, 223, 123, 0.3); margin-left: 6px; vertical-align: middle;">Evento</span>'
            : '';
          const biweeklyBadge = renderBiweeklyConversionBadge(p);

          // Checa se este item específico já foi pago/recebido no mês
          const isLaunched = receipts.some((r) => {
            if (r.linkedPlannedId) return r.linkedPlannedId === p.id;
            return r.date.startsWith(month) && r.category === p.category && r.merchant.toLowerCase() === p.description.toLowerCase() && r.owner === p.owner && Math.abs(r.amount) === Math.abs(p.amount);
          });

          const isIncome = p.amount < 0;
          const amountColor = isIncome ? '#62c462' : '#ff7b7b';
          // Repassa a validação da categoria atual do laço
          const displayAmount = isIncome ? `+ ${formatCurrency(Math.abs(p.amount), cat.toLowerCase() === 'salário')}` : `- ${formatCurrency(Math.abs(p.amount), cat.toLowerCase() === 'salário')}`;
          const incomeBadge = isIncome ? ' <span style="color:#62c462; font-size:0.7rem; font-weight:bold; margin-left: 4px;">(Entrada)</span>' : '';

          // Mostra o "+" amarelo apenas se estiver pendente E for um evento (Anual ou Situacional)
          const btnLaunchHtml = !isLaunched && isEventItem ? `<button class="action-btn" style="color: #f7c84a; border: 1px solid rgba(247, 200, 74, 0.3);" onclick="startLaunchToReal('${p.id}')" title="Lançar no Real">➕</button>` : '';

          item.innerHTML = `
          <div class="receipt-main">
            <div class="receipt-line">${p.description}${annualBadge}${incomeBadge}${biweeklyBadge}</div>
            ${obsHtml}
            <div class="receipt-meta" style="margin-top: 2px;">${dateStr}Resp: ${p.owner}${payStr}${p.fixed ? (p.isStatic ? ' • Fixo & Estático' : ' • Fixo') : ''}</div>
          </div>
          <div class="receipt-right">
            <div class="receipt-amount" style="color: ${amountColor};">${displayAmount}</div>
            <div class="receipt-actions">
              ${btnLaunchHtml}
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
  footerDiv.innerHTML = `<span>${isSearching ? 'TOTAL ENCONTRADO' : 'TOTAL PREVISTO'}</span><span>${formatCurrency(grandTotal)}</span>`;
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

  const receiptBeingEdited = editingReceiptId !== null ? receipts.find((receipt) => receipt.id === editingReceiptId) : null;
  if (receiptBeingEdited && isReceiptEditLockedByBudget(receiptBeingEdited)) {
    showLockedReceiptMessage();
    resetReceiptForm();
    return;
  }

  actualSubmitBtn.textContent = 'Salvando...';
  actualSubmitBtn.disabled = true;

  await autoRegisterCompany(category, merchant);

  let oldReceipt = null;
  if (editingReceiptId !== null) {
    oldReceipt = receipts.find((r) => r.id === editingReceiptId);
  }

  const isStatic = oldReceipt ? oldReceipt.isStatic || false : false;
  const isIncomeChecked = document.getElementById('actual-is-income')?.checked || false;
  const isReimb = oldReceipt ? oldReceipt.isReimbursement || false : false;

  // Se o usuário marcou "Entrada", garantimos que isReimbursement seja false
  const finalIsReimbursement = isReimb && !isIncomeChecked;
  const finalAmount = isReimb || isIncomeChecked ? -Math.abs(amount) : Math.abs(amount);
  const launchedPlannedItem = window.currentLaunchPlannedId ? plannedItems.find((planned) => planned.id === window.currentLaunchPlannedId) : null;
  const biweeklySource = launchedPlannedItem || oldReceipt;

  const itemData = {
    date,
    category,
    merchant,
    amount: finalAmount,
    owner,
    paymentMethodId,
    observation,
    isStatic: isStatic,
    isReimbursement: finalIsReimbursement,
  };

  if (biweeklySource?.isBiweeklyConverted) {
    itemData.isBiweeklyConverted = true;
    itemData.biweeklyAmount = biweeklySource.biweeklyAmount;
    itemData.biweeklyMonthlyAmount = biweeklySource.biweeklyMonthlyAmount ?? biweeklySource.amount;
  }

  if (oldReceipt && oldReceipt.staticSyncId) {
    itemData.staticSyncId = oldReceipt.staticSyncId;
  }

  if (oldReceipt && oldReceipt.linkedPlannedId) {
    itemData.linkedPlannedId = oldReceipt.linkedPlannedId;
  }

  // Se o lançamento veio pelo botão +, salva o vínculo forte
  if (window.currentLaunchPlannedId) {
    itemData.linkedPlannedId = window.currentLaunchPlannedId;
    window.currentLaunchPlannedId = null; // Limpa a variável após usar
  }

  if (editingReceiptId !== null) itemData.id = editingReceiptId;

  await FinanceAPI.saveReceipt(month, itemData);
  logActivity(editingReceiptId ? 'Editou' : 'Adicionou', `Real: ${merchant} - ${formatCurrency(finalAmount)}`);

  if (oldReceipt && oldReceipt.isStatic) {
    const linkedPlanned = plannedItems.find((p) => {
      if (p.staticSyncId && oldReceipt.staticSyncId) return p.staticSyncId === oldReceipt.staticSyncId;
      return p.month === month && p.category === oldReceipt.category && p.description === oldReceipt.merchant && p.owner === oldReceipt.owner && p.amount === oldReceipt.amount && p.isStatic;
    });

    if (linkedPlanned) {
      const updatedPlanned = {
        ...linkedPlanned,
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
        staticSyncId: oldReceipt.staticSyncId || linkedPlanned.staticSyncId,
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

  const isIncomeCheck = document.getElementById('actual-is-income');
  if (isIncomeCheck) isIncomeCheck.checked = false;

  // Garante que o vínculo não vaze para lançamentos manuais
  window.currentLaunchPlannedId = null;

  const selectedMonth = getCurrentMonth();
  const today = getLocalDateString();
  actualDateInput.value = today.startsWith(selectedMonth) ? today : `${selectedMonth}-01`;

  updateReceiptChips();
}

function isReceiptEditLockedByBudget(receipt) {
  // Estático sempre nasce de um item também marcado como Fixo. Fixos comuns,
  // lançados manualmente no Real, continuam editáveis para registrar o valor efetivo.
  return Boolean(receipt?.isStatic);
}

function showLockedReceiptMessage() {
  showToast('Este lançamento é fixo e estático, só pode ser alterado em Orçamento.', 'info');
}

function renderReceiptBiweeklyBadge(receipt) {
  if (receipt?.isBiweeklyConverted) return renderBiweeklyConversionBadge(receipt);

  const linkedPlanned = plannedItems.find(
    (planned) =>
      (receipt?.linkedPlannedId && planned.id === receipt.linkedPlannedId) ||
      (receipt?.staticSyncId && planned.staticSyncId === receipt.staticSyncId),
  );
  return renderBiweeklyConversionBadge(linkedPlanned);
}

function startEditReceipt(id) {
  const r = receipts.find((x) => x.id === id);
  if (!r) return;

  if (isReceiptEditLockedByBudget(r)) {
    showLockedReceiptMessage();
    return;
  }

  editingReceiptId = id;

  actualDateInput.value = r.date;
  actualCategoryInput.value = r.category;
  actualMerchantInput.value = r.merchant;

  actualAmountInput.value = Math.abs(r.amount);
  const isIncomeCheck = document.getElementById('actual-is-income');
  if (isIncomeCheck) isIncomeCheck.checked = r.amount < 0 && !r.isReimbursement;

  actualOwnerSelect.value = r.owner;
  document.getElementById('actual-payment').value = r.paymentMethodId || 'dinheiro';
  actualObservationInput.value = r.observation || '';

  if (getCategories().includes(r.category)) {
    selectedReceiptType = r.category;
    updateReceiptChips();
  }

  actualSubmitBtn.textContent = 'Salvar alterações';
}

function renderFinancialFlowBadges(entry) {
  const incomeBadge = entry.hasActualIncome ? '<span class="financial-flow-badge is-income">Entrada</span>' : '';
  const reimbursementBadge = entry.hasReimbursement ? '<span class="financial-flow-badge is-reimbursement">Reembolso</span>' : '';
  return `${incomeBadge}${reimbursementBadge}`;
}

function isReceiptFromEvent(receipt) {
  if (receipt.category === 'Eventos') return true;
  if (!receipt.linkedPlannedId) return false;

  const linkedPlanned = plannedItems.find((planned) => planned.id === receipt.linkedPlannedId);
  return Boolean(linkedPlanned && (linkedPlanned.linkedAnnualId || linkedPlanned.category === 'Eventos'));
}

function renderFinancialEventBadge() {
  return '<span class="financial-event-badge">Evento</span>';
}

function updateReceiptsView() {
  const month = getCurrentMonth();
  receiptsList.innerHTML = '';
  if (!month) return;

  const allReceipts = receipts.filter((r) => r.date.startsWith(month));
  const isSearching = Boolean(normalizeSearchText(receiptsSearchTerm));
  const list = allReceipts.filter((r) => matchesFinancialSearch(r, receiptsSearchTerm, 'merchant'));

  if (!list.length) {
    receiptsList.innerHTML = isSearching ? "<p class='hint'>Nenhum resultado encontrado.</p>" : "<p class='hint'>Nenhum lançamento para este mês.</p>";
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
      const isOpen = isSearching || openReceiptCats.has(cat);
      const catTotal = groupItems.reduce((acc, curr) => acc + curr.amount, 0);
      const flowBadges = renderFinancialFlowBadges({
        hasActualIncome: groupItems.some((receipt) => receipt.amount < 0 && !receipt.isReimbursement),
        hasReimbursement: groupItems.some((receipt) => receipt.isReimbursement),
      });
      const eventBadge = groupItems.some((receipt) => isReceiptFromEvent(receipt)) ? renderFinancialEventBadge() : '';

      const headerDiv = document.createElement('div');
      headerDiv.className = 'group-header-div';

      const isCatIncome = catTotal < 0;
      // Aplica a condicional do grupo para filtrar a visualização se for o grupo Salário
      const displayedCatTotal = isCatIncome ? `+ ${formatCurrency(Math.abs(catTotal), cat.toLowerCase() === 'salário')}` : formatCurrency(catTotal, cat.toLowerCase() === 'salário');

      headerDiv.innerHTML = `
      <span class="receipt-group-title" style="color: #f5f5f5;"><span class="toggle-icon">${isOpen ? '▼' : '▶'}</span> ${cat}${eventBadge}${flowBadges}</span>
      <span class="receipt-group-total" style="color:#a6a6c0; font-size:0.85rem; font-weight:normal;">${displayedCatTotal}</span>
    `;

      headerDiv.onclick = () => {
        if (isSearching) return;
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

          const isIncomeOrReimb = r.isReimbursement || r.amount < 0;
          const amountColor = isIncomeOrReimb ? '#62c462' : '#ff7b7b';
          // Repassa a validação da categoria atual do laço
          const displayAmount = isIncomeOrReimb ? `+ ${formatCurrency(Math.abs(r.amount), cat.toLowerCase() === 'salário')}` : `- ${formatCurrency(Math.abs(r.amount), cat.toLowerCase() === 'salário')}`;
          const flowBadge = renderFinancialFlowBadges({
            hasActualIncome: r.amount < 0 && !r.isReimbursement,
            hasReimbursement: r.isReimbursement,
          });
          const eventBadge = isReceiptFromEvent(r) ? renderFinancialEventBadge() : '';
          const biweeklyBadge = renderReceiptBiweeklyBadge(r);
          const editActionHtml = isReceiptEditLockedByBudget(r)
            ? `<button class="action-btn" onclick="showLockedReceiptMessage()" title="Este lançamento é fixo e estático">🔒 Orçamento</button>`
            : `<button class="action-btn" onclick="startEditReceipt('${r.id}')">Editar</button>`;

          const btnReembolsoHtml = !isIncomeOrReimb ? `<button class="action-btn" style="color: #62c462; border: 1px solid rgba(98, 196, 98, 0.3);" onclick="startReimbursement('${r.id}')" title="Reembolsar esta nota">🔄</button>` : '';

          item.innerHTML = `
          <div class="receipt-main">
            <div class="receipt-line">${r.merchant} • ${r.category}${biweeklyBadge}${eventBadge}${flowBadge}</div>
            ${obsHtml}
            <div class="receipt-meta" style="margin-top: 2px;">${r.date.split('-').reverse().join('/')} • ${r.owner}${payStr}${r.isStatic ? ' • Fixo & Estático' : ''}</div>
          </div>
          <div class="receipt-right">
            <div class="receipt-amount" style="color: ${amountColor};">${displayAmount}</div>
            <div class="receipt-actions">
              ${btnReembolsoHtml}
              ${editActionHtml}
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
  footerDiv.innerHTML = `<span>${isSearching ? 'TOTAL ENCONTRADO' : 'TOTAL REAL ACUMULADO'}</span><span>${formatCurrency(grandTotal)}</span>`;
  receiptsList.appendChild(footerDiv);
}

// ===== Resumo Global =====

// Um custo fixo não estático só entra no Real quando for efetivamente lançado.
// Enquanto isso, ele precisa continuar reservado para que o "Livre" não pareça maior
// do que o valor realmente disponível. Itens estáticos ficam de fora pois já foram
// espelhados automaticamente nas Notas.
function getPendingFixedExpenses(month) {
  // Um mês já encerrado não deve continuar reservando valores: nele, o Livre
  // representa o resultado real final. A projeção vale apenas no mês atual e futuros.
  if (month < getCurrentMonthISO()) return [];

  const fixedByCategory = new Map();

  // Usa a mesma leitura do comparativo Orçamento x Real: previsto e realizado
  // são agrupados pela categoria, mesmo que os nomes dos estabelecimentos variem.
  plannedItems
    .filter((item) => item.month === month && item.fixed && !item.isStatic && item.amount > 0)
    .forEach((item) => {
      if (!fixedByCategory.has(item.category)) {
        fixedByCategory.set(item.category, { category: item.category, amount: 0, dates: [], hasUndatedItem: false });
      }

      const group = fixedByCategory.get(item.category);
      group.amount += item.amount;
      if (item.date && item.date.startsWith(month)) group.dates.push(item.date);
      else group.hasUndatedItem = true;
    });

  return Array.from(fixedByCategory.values())
    .map((group) => {
      const actualAmount = receipts.filter((receipt) => receipt.date.startsWith(month) && receipt.amount > 0 && !receipt.isReimbursement && receipt.category === group.category).reduce((total, receipt) => total + receipt.amount, 0);
      const remainingAmount = Math.max(group.amount - actualAmount, 0);
      const sortedDates = group.dates.sort();
      return {
        category: group.category,
        description: group.category,
        amount: group.amount,
        actualAmount,
        remainingAmount,
        date: group.hasUndatedItem ? '' : sortedDates[sortedDates.length - 1] || '',
      };
    })
    .filter((item) => item.remainingAmount > 0.005);
}

function getPendingFixedProjectionEnd(month, pendingItems) {
  const datedItems = pendingItems.map((item) => item.date).filter((date) => date && date.startsWith(month));

  // Sem uma data definida, a reserva vale até o fim do mês selecionado.
  if (datedItems.length !== pendingItems.length) {
    const [year, monthNumber] = month.split('-').map(Number);
    const lastDay = new Date(year, monthNumber, 0).getDate();
    return `${month}-${String(lastDay).padStart(2, '0')}`;
  }

  const sortedDates = datedItems.sort();
  return sortedDates[sortedDates.length - 1];
}

function formatShortDate(date) {
  return date.split('-').reverse().slice(0, 2).join('/');
}

function renderFreeProjectionDetails(month, pendingItems, projectedBalance) {
  const details = document.getElementById('summary-fixed-details');
  const freeCard = document.querySelector('.dash-item-free');
  const arrow = document.getElementById('summary-free-projection-arrow');
  const afterFixed = document.getElementById('summary-free-after-fixed');
  const hasPendingItems = pendingItems.length > 0;

  if (!summaryFreeProjectionToggle || !details || !freeCard || !arrow) return;

  if (!hasPendingItems) isFreeProjectionExpanded = false;

  summaryFreeProjectionToggle.classList.toggle('is-available', hasPendingItems);
  summaryFreeProjectionToggle.setAttribute('aria-disabled', String(!hasPendingItems));
  summaryFreeProjectionToggle.setAttribute('aria-expanded', String(hasPendingItems && isFreeProjectionExpanded));
  arrow.textContent = isFreeProjectionExpanded ? '▼' : '▶';
  if (afterFixed) {
    afterFixed.textContent = hasPendingItems ? `Após fixos: ${formatCurrency(projectedBalance)}` : '';
    afterFixed.classList.toggle('visible', hasPendingItems);
  }

  if (!hasPendingItems || !isFreeProjectionExpanded) {
    details.innerHTML = '';
    details.classList.remove('visible');
    freeCard.classList.remove('is-expanded');
    return;
  }

  const projectionEnd = getPendingFixedProjectionEnd(month, pendingItems);
  const rows = [...pendingItems]
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .map((item) => {
      const percent = (item.actualAmount / item.amount) * 100;
      const visualPercent = Math.min(percent, 100);
      const roundedPercent = Math.round(percent * 100) / 100;
      const progressClass = roundedPercent < 100 ? 'progress-safe' : roundedPercent === 100 ? 'progress-warning' : 'progress-danger';
      const differenceAmount = Math.round((item.amount - item.actualAmount) * 100) / 100;
      const differenceClass = differenceAmount > 0 ? 'positive' : differenceAmount === 0 ? 'neutral' : 'negative';
      const actualDisplay = item.actualAmount === 0 ? formatCurrency(0) : `- ${formatCurrency(item.actualAmount)}`;
      return `
        <tr>
          <td class="dash-fixed-name">
            <span>${escapeCardDetail(item.description)}</span>
            <div class="dash-fixed-progress"><span class="${progressClass}" style="width: ${visualPercent}%;"></span></div>
          </td>
          <td>${formatCurrency(item.amount)}</td>
          <td class="dash-fixed-real ${item.actualAmount === 0 ? 'is-zero' : ''}">${actualDisplay}</td>
          <td class="dash-fixed-difference ${differenceClass}">${formatCurrency(differenceAmount)}</td>
        </tr>`;
    })
    .join('');

  details.innerHTML = `
    <div class="dash-free-details-title">Fixos pendentes até ${formatShortDate(projectionEnd)}</div>
    <table class="dash-fixed-table">
      <thead><tr><th>Fixo</th><th>Prev.</th><th>Real</th><th>Diferença</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  details.classList.add('visible');
  freeCard.classList.add('is-expanded');
}

function updateGlobalSummaries() {
  const month = getCurrentMonth();
  if (!month) return;

  // Renda Base (Seu salário fixo cadastrado)
  const baseIncome = getIncomeTotalForMonth(month);

  // Cálculo Previsto
  let pExp = 0; // Gastos (+)
  let pExtraInc = 0; // Entradas/Eventos Previstos (-)
  plannedItems
    .filter((p) => p.month === month)
    .forEach((p) => {
      if (p.amount > 0) pExp += p.amount;
      else pExtraInc += Math.abs(p.amount);
    });

  // Cálculo Real
  let rExp = 0; // Gastos Reais (+)
  let rReimb = 0; // Reembolsos (-) -> Vai abater o gasto
  let rExtraInc = 0; // Entradas Reais (-) -> Vai somar na renda

  receipts
    .filter((r) => r.date.startsWith(month))
    .forEach((r) => {
      if (r.amount > 0) {
        rExp += r.amount;
      } else if (r.isReimbursement) {
        rReimb += Math.abs(r.amount);
      } else {
        rExtraInc += Math.abs(r.amount);
      }
    });

  // Gasto Líquido (Abate apenas os Reembolsos)
  const netPlannedExpense = pExp;
  const netActualExpense = rExp - rReimb;

  // Renda Total (Salário Base + Entradas de Eventos/Avulsas)
  const totalIncomePlanned = baseIncome + pExtraInc;
  const totalIncomeReal = baseIncome + rExtraInc;

  const saldoPrevisto = totalIncomePlanned - netPlannedExpense;
  const saldoReal = totalIncomeReal - netActualExpense;
  const pendingFixedItems = getPendingFixedExpenses(month);
  const pendingFixedExpense = pendingFixedItems.reduce((total, item) => total + item.remainingAmount, 0);
  const saldoAfterPendingFixed = saldoReal - pendingFixedExpense;

  /// UI - Renda (Mostra a Renda Total real) - Identificado como true para o modo seletivo
  document.getElementById('summary-income-inline').textContent = formatCurrency(totalIncomeReal, true);

  // UI - Gasto (Gasto Líquido: Gastos - Reembolsos)
  const elExpense = document.getElementById('summary-expense-inline');
  elExpense.textContent = formatCurrency(netActualExpense);
  document.getElementById('summary-planned-expense').textContent = formatCurrency(netPlannedExpense).replace('CAD ', '');
  elExpense.className = netActualExpense > totalIncomeReal ? 'status-danger' : netActualExpense > netPlannedExpense ? 'status-warning' : 'status-success';

  // UI - Livre: mantém Real e Previsto; os fixos pendentes aparecem no detalhe expansível.
  const elLivre = document.getElementById('summary-saldo-livre');
  elLivre.textContent = formatCurrency(saldoReal);
  const plannedBalanceEl = document.getElementById('summary-saldo-previsto');
  if (plannedBalanceEl) plannedBalanceEl.textContent = formatCurrency(saldoPrevisto).replace('CAD ', '');
  elLivre.className = saldoReal < 0 ? 'status-danger' : saldoReal < saldoPrevisto ? 'status-warning' : 'status-success';

  renderFreeProjectionDetails(month, pendingFixedItems, saldoAfterPendingFixed);

  renderPlannedItemsList(month);
}

// Função nova para pré-carregar rendas e evitar bug da virada de mês
async function preloadAllIncomes() {
  try {
    const snap = await window.db.collection('familias').doc(FinanceAPI.familyId).collection('meses').get();
    snap.forEach((doc) => {
      // Pega apenas documentos no formato de mês (ex: 2026-04)
      if (/^\d{4}-\d{2}$/.test(doc.id)) {
        const data = doc.data();
        if (data.luana !== undefined || data.gabriel !== undefined) {
          const exists = incomes.find((i) => i.month === doc.id);
          if (!exists) {
            incomes.push({ month: doc.id, luana: data.luana || 0, gabriel: data.gabriel || 0 });
          }
        }
      }
    });
    // Atualiza a tela assim que tiver o histórico em mãos
    loadIncomeToInputs(getCurrentMonth());
    refreshAll();
  } catch (e) {
    console.error('Erro ao pré-carregar rendas do histórico:', e);
  }
}

async function initAppUI() {
  // Trava de segurança: aguarda o ID da família ser carregado antes de buscar os dados
  let retries = 0;
  while (!FinanceAPI.familyId && retries < 20) {
    await new Promise((r) => setTimeout(r, 100));
    retries++;
  }

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

  // Busca todo o histórico de rendas ANTES de sincronizar o mês atual
  try {
    const snap = await window.db.collection('familias').doc(FinanceAPI.familyId).collection('meses').get();
    snap.forEach((doc) => {
      if (/^\d{4}-\d{2}$/.test(doc.id)) {
        const data = doc.data();
        if (data.luana !== undefined || data.gabriel !== undefined) {
          const exists = incomes.find((i) => i.month === doc.id);
          if (!exists) {
            incomes.push({ month: doc.id, luana: data.luana || 0, gabriel: data.gabriel || 0 });
          }
        }
      }
    });
  } catch (e) {
    console.error('Erro ao pré-carregar rendas:', e);
  }

  syncData(m);
  listenToLogs();
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

  if (ownerContainer) {
    const categoriasEssenciais = ['Contas', 'Supermercado', 'Transporte', 'Combustível', 'Saúde', 'Casa', 'Pets', 'Educação', 'Cuidados pessoais'];

    let rExtraInc = 0; // Armazena entradas/saldos extras do mês
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
      const isEssencial = categoriasEssenciais.includes(r.category);

      if (r.amount > 0) {
        // 1. Gasto Real Normal
        if (isEssencial) {
          totEss += r.amount;
          if (owner === 'Gabriel') {
            gabEss += r.amount;
            gabTotal += r.amount;
          } else if (owner === 'Luana') {
            luaEss += r.amount;
            luaTotal += r.amount;
          } else {
            ambEss += r.amount;
            ambTotal += r.amount;
          }
        } else {
          totLaz += r.amount;
          if (owner === 'Gabriel') {
            gabLaz += r.amount;
            gabTotal += r.amount;
          } else if (owner === 'Luana') {
            luaLaz += r.amount;
            luaTotal += r.amount;
          } else {
            ambLaz += r.amount;
            ambTotal += r.amount;
          }
        }
      } else if (r.isReimbursement) {
        // 2. Reembolso Real: Abate direto do grupo e do responsável
        const absAmt = Math.abs(r.amount);
        if (isEssencial) {
          totEss -= absAmt;
          if (owner === 'Gabriel') {
            gabEss -= absAmt;
            gabTotal -= absAmt;
          } else if (owner === 'Luana') {
            luaEss -= absAmt;
            luaTotal -= absAmt;
          } else {
            ambEss -= absAmt;
            ambTotal -= absAmt;
          }
        } else {
          totLaz -= absAmt;
          if (owner === 'Gabriel') {
            gabLaz -= absAmt;
            gabTotal -= absAmt;
          } else if (owner === 'Luana') {
            luaLaz -= absAmt;
            luaTotal -= absAmt;
          } else {
            ambLaz -= absAmt;
            ambTotal -= absAmt;
          }
        }
      } else {
        // 3. Entrada: computa na receita total do card
        rExtraInc += Math.abs(r.amount);
      }
    });

    // Recalcula a Renda Real Total e o Gasto Líquido perfeitamente
    const totalIncome = getIncomeTotalForMonth(month) + rExtraInc;
    const totalReal = totEss + totLaz;

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
      const pendingFixedExpense = getPendingFixedExpenses(month).reduce((total, item) => total + item.remainingAmount, 0);
      const freeAfterFixed = freeReal - pendingFixedExpense;
      const visibleFreeTotal = Math.max(freeReal, 0);
      const visiblePendingFixed = Math.min(pendingFixedExpense, visibleFreeTotal);
      const visibleFreeAfterFixed = Math.max(freeAfterFixed, 0);
      const gabrielPercentOfIncome = baseBarWidth > 0 ? (Math.max(gabTotal, 0) / baseBarWidth) * 100 : 0;
      const luanaPercentOfIncome = baseBarWidth > 0 ? (Math.max(luaTotal, 0) / baseBarWidth) * 100 : 0;
      const bothPercentOfIncome = baseBarWidth > 0 ? (Math.max(ambTotal, 0) / baseBarWidth) * 100 : 0;
      const gabrielShareOfExpense = totalReal > 0 ? Math.max((gabTotal / totalReal) * 100, 0) : 0;
      const luanaShareOfExpense = totalReal > 0 ? Math.max((luaTotal / totalReal) * 100, 0) : 0;
      const bothShareOfExpense = totalReal > 0 ? Math.max((ambTotal / totalReal) * 100, 0) : 0;
      const pendingFixedPercentOfIncome = baseBarWidth > 0 ? (visiblePendingFixed / baseBarWidth) * 100 : 0;
      const afterFixedPercentOfIncome = baseBarWidth > 0 ? (visibleFreeAfterFixed / baseBarWidth) * 100 : 0;
      const getOwnerComposition = (essential, leisure) => {
        const positiveEssential = Math.max(essential, 0);
        const positiveLeisure = Math.max(leisure, 0);
        const total = positiveEssential + positiveLeisure;
        return {
          essential: total > 0 ? (positiveEssential / total) * 100 : 0,
          leisure: total > 0 ? (positiveLeisure / total) * 100 : 0,
        };
      };
      const gabrielComposition = getOwnerComposition(gabEss, gabLaz);
      const luanaComposition = getOwnerComposition(luaEss, luaLaz);
      const bothComposition = getOwnerComposition(ambEss, ambLaz);
      const overviewExpenseComposition = getOwnerComposition(totEss, totLaz);

      const isDetailsOpen = window.isConsumptionDetailsOpen || false;

      window.toggleOwnerCat = function (owner) {
        if (openOwnerCats.has(owner)) openOwnerCats.delete(owner);
        else openOwnerCats.add(owner);
        updateDashboardView();
      };

      window.toggleOwnerExpenseGroup = function (owner, group) {
        const key = `${owner}|${group}`;
        if (openOwnerExpenseGroups.has(key)) openOwnerExpenseGroups.delete(key);
        else openOwnerExpenseGroups.add(key);
        updateDashboardView();
      };

      let html = `
        <div style="margin-bottom: 20px; padding: 4px;">
          
          <div style="cursor: pointer; padding-bottom: ${isDetailsOpen ? '16px' : '0'}; border-bottom: ${isDetailsOpen ? '1px solid rgba(255,255,255,0.05)' : 'none'}; transition: all 0.2s ease;" onclick="window.isConsumptionDetailsOpen = !${isDetailsOpen}; updateDashboardView();">
            <div style="margin-bottom: 6px; text-align: center;">
              <span style="font-weight: 600; font-size: 0.95rem; color: #62c462;">
                
                Renda Total: ${formatCurrency(totalIncome, true)}
              </span>
            </div>
            
            <div class="income-overview-bar">
              ${
                pGastoTotal > 0
                  ? `<div class="overview-expense" style="width: ${pGastoTotal}%;" title="Gasto: ${formatCurrency(totalReal)}">
                      ${totEss > 0 ? `<i class="overview-essential" style="width: ${overviewExpenseComposition.essential}%;" title="Essenciais: ${formatCurrency(totEss)}"></i>` : ''}
                      ${totLaz > 0 ? `<i class="overview-leisure" style="width: ${overviewExpenseComposition.leisure}%;" title="Lazer e Outros: ${formatCurrency(totLaz)}"></i>` : ''}
                    </div>`
                  : ''
              }
              ${pendingFixedPercentOfIncome > 0 ? `<div class="overview-pending" style="width: ${pendingFixedPercentOfIncome}%;" title="Fixos pendentes: ${formatCurrency(pendingFixedExpense)}"></div>` : ''}
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
              ${pendingFixedExpense > 0 ? `<span><strong class="overview-pending-key" aria-hidden="true"></strong> Fixos: <span class="overview-pending-value">${formatCurrency(pendingFixedExpense)}</span></span>` : ''}
            </div>
            ${
              !isDetailsOpen
                ? `<div class="consumption-closed-preview">
                    <span>Gabriel ${gabrielShareOfExpense.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>
                    <span>Luana ${luanaShareOfExpense.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>
                    <span>Ambos ${bothShareOfExpense.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>
                    <strong>Ver detalhes ▼</strong>
                  </div>`
                : ''
            }
          </div>

          <div class="owner-breakdown-section" style="display: ${isDetailsOpen ? 'block' : 'none'};">
            <div class="owner-breakdown-toggle owner-breakdown-heading">
              <span>Gastos por responsável</span>
              <small>Gabriel, Luana e Ambos</small>
            </div>
            <div class="owner-breakdown-content">
              <div class="owner-scale-caption">Mesma escala da Renda Total</div>
              <div class="income-breakdown-bar" title="Renda total: ${formatCurrency(totalIncome, true)}">
                ${gabrielPercentOfIncome > 0 ? `<span class="income-owner-segment" style="width: ${gabrielPercentOfIncome}%" title="Gabriel: ${formatCurrency(gabTotal)}"><i class="is-essential" style="width: ${gabrielComposition.essential}%"></i><i class="is-leisure" style="width: ${gabrielComposition.leisure}%"></i></span>` : ''}
                ${luanaPercentOfIncome > 0 ? `<span class="income-owner-segment" style="width: ${luanaPercentOfIncome}%" title="Luana: ${formatCurrency(luaTotal)}"><i class="is-essential" style="width: ${luanaComposition.essential}%"></i><i class="is-leisure" style="width: ${luanaComposition.leisure}%"></i></span>` : ''}
                ${bothPercentOfIncome > 0 ? `<span class="income-owner-segment" style="width: ${bothPercentOfIncome}%" title="Ambos: ${formatCurrency(ambTotal)}"><i class="is-essential" style="width: ${bothComposition.essential}%"></i><i class="is-leisure" style="width: ${bothComposition.leisure}%"></i></span>` : ''}
                ${pendingFixedPercentOfIncome > 0 ? `<span class="is-pending" style="width: ${pendingFixedPercentOfIncome}%" title="Fixos pendentes: ${formatCurrency(pendingFixedExpense)}"></span>` : ''}
                ${afterFixedPercentOfIncome > 0 ? `<span class="is-available" style="width: ${afterFixedPercentOfIncome}%" title="Após fixos: ${formatCurrency(freeAfterFixed)}"></span>` : ''}
              </div>
              <div class="income-breakdown-segment-labels">
                ${gabrielPercentOfIncome > 0 ? `<span style="width: ${gabrielPercentOfIncome}%"><b>Gabriel</b><abbr>G</abbr></span>` : ''}
                ${luanaPercentOfIncome > 0 ? `<span style="width: ${luanaPercentOfIncome}%"><b>Luana</b><abbr>L</abbr></span>` : ''}
                ${bothPercentOfIncome > 0 ? `<span style="width: ${bothPercentOfIncome}%"><b>Ambos</b><abbr>A</abbr></span>` : ''}
                ${pendingFixedPercentOfIncome > 0 ? `<span class="is-pending" style="width: ${pendingFixedPercentOfIncome}%"><b>Fixos</b><abbr>F</abbr><small>${formatCurrency(pendingFixedExpense)}</small></span>` : ''}
                ${afterFixedPercentOfIncome > 0 ? `<span class="is-available ${freeAfterFixed < 0 ? 'is-negative' : ''}" style="width: ${afterFixedPercentOfIncome}%"><b>Após fixos</b><abbr>AF</abbr><small>${formatCurrency(freeAfterFixed)}</small></span>` : ''}
              </div>
              <div class="income-breakdown-mobile-legend">
                ${gabrielPercentOfIncome > 0 ? '<span><b>G</b> Gabriel</span>' : ''}
                ${luanaPercentOfIncome > 0 ? '<span><b>L</b> Luana</span>' : ''}
                ${bothPercentOfIncome > 0 ? '<span><b>A</b> Ambos</span>' : ''}
                ${pendingFixedPercentOfIncome > 0 ? '<span class="is-pending"><b>F</b> Fixos</span>' : ''}
                ${afterFixedPercentOfIncome > 0 ? '<span class="is-available"><b>AF</b> Após fixos</span>' : ''}
              </div>
      `;

      const ownersArray = [
        { name: 'Gabriel', total: gabTotal, ess: gabEss, laz: gabLaz, share: gabrielShareOfExpense },
        { name: 'Luana', total: luaTotal, ess: luaEss, laz: luaLaz, share: luanaShareOfExpense },
        { name: 'Ambos', total: ambTotal, ess: ambEss, laz: ambLaz, share: bothShareOfExpense },
      ];

      const renderOwnerExpenseItems = (ownerName, essentialGroup) => {
        const items = receiptsForMonth
          .filter((receipt) => {
            const receiptOwner = receipt.owner || 'Ambos';
            const isExpenseMovement = receipt.amount > 0 || receipt.isReimbursement;
            return receiptOwner === ownerName && isExpenseMovement && categoriasEssenciais.includes(receipt.category) === essentialGroup;
          })
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        if (!items.length) return '<div class="owner-expense-empty">Nenhum lançamento neste grupo.</div>';

        return items
          .map((receipt) => {
            const isReimbursement = receipt.isReimbursement;
            const amountText = `${isReimbursement ? '+' : '-'} ${formatCurrency(Math.abs(receipt.amount))}`;
            const observation = receipt.observation ? `<small>↳ ${escapeCardDetail(receipt.observation)}</small>` : '';
            const merchant = receipt.merchant || 'Sem nome';
            const category = receipt.category || 'Sem categoria';
            const receiptDate = receipt.date ? receipt.date.split('-').reverse().join('/') : 'Sem data';
            return `<div class="owner-expense-item">
              <span><b>${escapeCardDetail(merchant)}</b><em>${escapeCardDetail(category)} · ${receiptDate}</em>${observation}</span>
              <strong class="${isReimbursement ? 'positive' : 'negative'}">${amountText}</strong>
            </div>`;
          })
          .join('');
      };

      ownersArray.forEach((owner) => {
        if (owner.total === 0) return;
        const isOpen = openOwnerCats.has(owner.name);
        const ownerShareText = owner.share.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
        const essentialKey = `${owner.name}|essential`;
        const leisureKey = `${owner.name}|leisure`;
        const isEssentialOpen = openOwnerExpenseGroups.has(essentialKey);
        const isLeisureOpen = openOwnerExpenseGroups.has(leisureKey);

        html += `
          <button type="button" class="owner-summary-card ${isOpen ? 'is-open' : ''}" onclick="window.toggleOwnerCat('${owner.name}')" aria-expanded="${isOpen}">
            <span class="owner-summary-line">
              <span class="owner-summary-name"><span class="toggle-icon">${isOpen ? '▼' : '▶'}</span> ${owner.name}</span>
              <span class="owner-summary-values"><strong>${formatCurrency(owner.total)}</strong><small>${ownerShareText}% do gasto</small></span>
            </span>
          </button>
        `;

        if (isOpen) {
          html += `
            <div class="owner-summary-details">
              <button type="button" class="owner-expense-toggle" onclick="window.toggleOwnerExpenseGroup('${owner.name}', 'essential')" aria-expanded="${isEssentialOpen}">
                <span><span class="toggle-icon">${isEssentialOpen ? '▼' : '▶'}</span><i class="is-essential"></i> Essenciais</span>
                <strong>${formatCurrency(owner.ess)}</strong>
              </button>
              ${isEssentialOpen ? `<div class="owner-expense-items">${renderOwnerExpenseItems(owner.name, true)}</div>` : ''}
              <button type="button" class="owner-expense-toggle" onclick="window.toggleOwnerExpenseGroup('${owner.name}', 'leisure')" aria-expanded="${isLeisureOpen}">
                <span><span class="toggle-icon">${isLeisureOpen ? '▼' : '▶'}</span><i class="is-leisure"></i> Lazer e Outros</span>
                <strong>${formatCurrency(owner.laz)}</strong>
              </button>
              ${isLeisureOpen ? `<div class="owner-expense-items">${renderOwnerExpenseItems(owner.name, false)}</div>` : ''}
            </div>
          `;
        }
      });

      html += `
            </div>
          </div>
        </div>
      `;

      ownerContainer.innerHTML = html;
    }
  }

  const mapCat = {};

  plannedForMonth.forEach((p) => {
    if (!mapCat[p.category]) mapCat[p.category] = { planned: 0, actual: 0, items: new Map(), hasReimbursement: false, hasActualIncome: false };
    mapCat[p.category].planned += p.amount;

    const key = makeKey(p.category, p.description, p.owner);
    if (!mapCat[p.category].items.has(key)) {
      mapCat[p.category].items.set(key, { name: p.description, planned: 0, actual: 0, obsList: [], owners: new Set(), maxDate: p.date || '', isAnnual: false, annualEventsData: [], hasReimbursement: false, hasActualIncome: false, isBiweeklyConverted: false, biweeklyAmount: 0 });
    }
    const item = mapCat[p.category].items.get(key);
    item.planned += p.amount;
    if (p.isBiweeklyConverted) {
      item.isBiweeklyConverted = true;
      item.biweeklyAmount += p.biweeklyAmount ?? p.amount / BIWEEKLY_MONTHLY_FACTOR;
    }
    if (p.owner) item.owners.add(p.owner);
    if (p.date && (!item.maxDate || p.date > item.maxDate)) item.maxDate = p.date;
    if (p.linkedAnnualId) {
      item.isAnnual = true;
      item.annualEventsData.push({
        obs: p.observation ? p.observation.trim().toLowerCase() : '',
        amount: p.amount,
      });
    }
  });

  receiptsForMonth.forEach((r) => {
    if (!mapCat[r.category]) mapCat[r.category] = { planned: 0, actual: 0, items: new Map(), hasReimbursement: false, hasActualIncome: false };
    mapCat[r.category].actual += r.amount;
    if (r.isReimbursement) mapCat[r.category].hasReimbursement = true;
    if (r.amount < 0 && !r.isReimbursement) mapCat[r.category].hasActualIncome = true;

    const key = makeKey(r.category, r.merchant, r.owner);
    if (!mapCat[r.category].items.has(key)) {
      mapCat[r.category].items.set(key, { name: r.merchant, planned: 0, actual: 0, obsList: [], owners: new Set(), maxDate: r.date || '', isAnnual: false, annualObs: new Set(), hasReimbursement: false, hasActualIncome: false });
    }
    const item = mapCat[r.category].items.get(key);
    item.actual += r.amount;
    if (r.isReimbursement) item.hasReimbursement = true;
    if (r.amount < 0 && !r.isReimbursement) item.hasActualIncome = true;
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

    // Detecta se a linha atual processada corresponde à categoria protegida de salário
    const isSalarioCat = cat.toLowerCase() === 'salário';

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

    const hasEvent = Array.from(data.items.values()).some((item) => item.isAnnual);
    const isUnbudgetedExpense = data.planned === 0 && data.actual > 0;
    const isUnplannedCredit = data.planned === 0 && data.actual < 0 && (data.hasActualIncome || data.hasReimbursement);
    const catTitle = document.createElement('span');
    catTitle.className = 'dashboard-category-title';
    catTitle.style.display = 'flex';
    catTitle.style.alignItems = 'center';
    const catBadge = hasEvent ? ' <span style="background: rgba(253, 223, 123, 0.15); color: #fddf7b; padding: 2px 6px; border-radius: 6px; font-size: 0.65rem; border: 1px solid rgba(253, 223, 123, 0.3); margin-left: 6px;">Evento</span>' : '';
    const flowBadges = renderFinancialFlowBadges(data);
    catTitle.innerHTML = `<span class="toggle-icon">${isOpen ? '▼' : '▶'}</span> ${cat}${catBadge}${flowBadges}`;
    catContainer.appendChild(catTitle);

    let percent = 0;
    if (data.planned > 0) {
      percent = (data.actual / data.planned) * 100;
    } else if (isUnbudgetedExpense) {
      percent = 100;
    }

    const progressContainer = document.createElement('div');
    progressContainer.className = 'progress-bar-container';
    const progressFill = document.createElement('div');
    progressFill.className = 'progress-bar-fill';
    progressFill.style.width = Math.max(0, Math.min(percent, 100)) + '%';

    const roundedPercent = Math.round(percent * 100) / 100;

    if (isUnbudgetedExpense) progressFill.classList.add('progress-danger');
    else if (roundedPercent <= 75) progressFill.classList.add('progress-safe');
    else if (roundedPercent <= 100) progressFill.classList.add('progress-warning');
    else progressFill.classList.add('progress-danger');

    let usageText = null;
    if (isUnbudgetedExpense) {
      trCat.classList.add('is-unbudgeted', 'budget-critical');
      const unbudgetedBadge = document.createElement('span');
      unbudgetedBadge.className = 'budget-unbudgeted-badge';
      unbudgetedBadge.textContent = 'Não orçado';
      catTitle.appendChild(unbudgetedBadge);

      usageText = document.createElement('span');
      usageText.className = 'progress-usage-text is-unbudgeted';
      usageText.textContent = 'Gasto sem previsão';
    } else if (data.planned > 0 && data.actual >= 0) {
      if (roundedPercent > 100) {
        trCat.classList.add('is-over-budget', 'budget-critical');
        const overBudgetBadge = document.createElement('span');
        overBudgetBadge.className = 'budget-over-badge';
        overBudgetBadge.textContent = 'Estourado';
        catTitle.appendChild(overBudgetBadge);
      } else if (roundedPercent > 75) {
        trCat.classList.add('is-warning');
      }

      usageText = document.createElement('span');
      usageText.className = 'progress-usage-text';
      usageText.textContent = `${roundedPercent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% usado`;
    }

    progressContainer.appendChild(progressFill);
    if (!isUnplannedCredit) catContainer.appendChild(progressContainer);
    if (usageText) catContainer.appendChild(usageText);

    tdCatName.appendChild(catContainer);

    const tdCatPrev = document.createElement('td');
    tdCatPrev.className = 'numeric';
    const isCatPrevIncome = data.planned < 0;
    tdCatPrev.style.color = data.planned === 0 ? '#f5f5f5' : isCatPrevIncome ? '#62c462' : '#f5f5f5';
    tdCatPrev.textContent = data.planned === 0 ? formatCurrency(0, isSalarioCat) : isCatPrevIncome ? `+ ${formatCurrency(Math.abs(data.planned), isSalarioCat)}` : formatCurrency(data.planned, isSalarioCat);

    const tdCatReal = document.createElement('td');
    tdCatReal.className = 'numeric';
    const isCatIncome = data.actual < 0;
    tdCatReal.style.color = data.actual === 0 ? '#f5f5f5' : isCatIncome ? '#62c462' : '#ff7b7b';
    tdCatReal.textContent = data.actual === 0 ? formatCurrency(0, isSalarioCat) : isCatIncome ? `+ ${formatCurrency(Math.abs(data.actual), isSalarioCat)}` : `- ${formatCurrency(Math.abs(data.actual), isSalarioCat)}`;

    const tdCatDiff = document.createElement('td');
    tdCatDiff.className = 'numeric ' + (diffCat > 0 ? 'positive' : diffCat === 0 ? 'neutral' : 'negative');
    tdCatDiff.textContent = formatCurrency(diffCat, isSalarioCat);

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
        const itemBiweeklyBadge = renderBiweeklyConversionBadge(item);

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
                  isReimbursement: t.isReimbursement || false, // Respeita o banco de dados
                });
              });
            }
          });

          allTransactions.sort((a, b) => b.date.localeCompare(a.date));

          let hasRenderedAnnualChild = false;

          const obsLines = allTransactions
            .map((t) => {
              const dateStr = t.date ? `${t.date.split('-').reverse().join('/').substring(0, 5)}` : '';
              const payStr = getPaymentName(t.paymentMethodId);

              const isIncomeOrReimb = t.isReimbursement || t.amount < 0;
              const amountColor = isIncomeOrReimb ? '#62c462' : '#ff7b7b';
              // Protege os balões internos de observações expandidas
              const displayAmount = isIncomeOrReimb ? `+ ${formatCurrency(Math.abs(t.amount), isSalarioCat)}` : `- ${formatCurrency(Math.abs(t.amount), isSalarioCat)}`;

              let reimbBadge = '';
              if (t.isReimbursement) reimbBadge = ' <span style="color:#62c462; font-size:0.7rem; font-weight:bold;">(Reemb.)</span>';
              else if (t.amount < 0) reimbBadge = ' <span style="color:#62c462; font-size:0.7rem; font-weight:bold;">(Entrada)</span>';

              let isTxAnnual = false;
              if (item.annualEventsData && item.annualEventsData.length > 0) {
                const txt = isGenericObs(t.text) ? '' : t.text.toLowerCase();
                isTxAnnual = item.annualEventsData.some((ev) => {
                  if (ev.obs && txt && ev.obs === txt) return true; // Bateu por texto
                  if (ev.amount === t.amount) return true; // Bateu por valor exato
                  return false;
                });
                if (isTxAnnual) {
                  hasRenderedAnnualChild = true;
                }
              }
              const txAnnualBadge = isTxAnnual
                ? ' <span style="background: rgba(253, 223, 123, 0.15); color: #fddf7b; padding: 2px 6px; border-radius: 6px; font-size: 0.65rem; border: 1px solid rgba(253, 223, 123, 0.3); margin-left: 6px; vertical-align: middle;">Evento</span>'
                : '';

              return `
                <div class="dashboard-transaction-detail" style="margin-top: 8px; margin-bottom: 8px; border-left: 2px solid #27273a; padding-left: 8px;">
                  <div class="dashboard-transaction-main" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 4px;">
                    <span class="dashboard-transaction-note" style="color: #c3c3d5; font-size: 0.8rem; line-height: 1.3;">${t.text}${reimbBadge}${txAnnualBadge}</span>
                    <span class="dashboard-transaction-amount" style="color: ${amountColor}; font-size: 0.75rem; font-weight: 600; white-space: nowrap; margin-left: 4px;">${displayAmount}</span>
                  </div>
                  <div class="dashboard-transaction-meta" style="font-size: 0.7rem; color: #8e8eab; margin-top: 3px; display: flex; flex-wrap: wrap; gap: 4px;">
                    <span>(${t.owner})</span>
                    <span>• ${payStr}</span>
                    ${dateStr ? `<span>• ${dateStr}</span>` : ''}
                  </div>
                </div>`;
            })
            .join('');

          const totalItems = allTransactions.length;
          const parentAnnualBadge =
            item.isAnnual && !hasRenderedAnnualChild
              ? ' <span style="background: rgba(253, 223, 123, 0.15); color: #fddf7b; padding: 2px 6px; border-radius: 6px; font-size: 0.65rem; border: 1px solid rgba(253, 223, 123, 0.3); margin-left: 6px; vertical-align: middle;">Evento</span>'
              : '';
          const itemFlowBadges = renderFinancialFlowBadges(item);

          tdItemName.innerHTML = `
            <details style="cursor: pointer; margin: 2px 0;">
              <summary style="outline: none; user-select: none; color: #fddf7b;">
                <div style="display: inline-block;">
                  <span style="color: #f5f5f5;">${item.name}</span>${parentAnnualBadge}${itemFlowBadges}${itemBiweeklyBadge}
                  <span style="font-size: 0.6rem; background: rgba(74, 144, 226, 0.15); color: #4a90e2; padding: 2px 6px; border-radius: 6px; margin-left: 4px; border: 1px solid rgba(74, 144, 226, 0.3); white-space: nowrap; vertical-align: middle;">${totalItems} itens</span>
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

          let payStr = '';
          if (singleTx) {
            payStr = getPaymentName(singleTx.paymentMethodId);
          }

          const singleMetaText = [ownersText, datesArray.join(', '), payStr].filter(Boolean).join(' • ');
          const parentAnnualBadge = item.isAnnual
            ? ' <span style="background: rgba(253, 223, 123, 0.15); color: #fddf7b; padding: 2px 6px; border-radius: 6px; font-size: 0.65rem; border: 1px solid rgba(253, 223, 123, 0.3); margin-left: 6px; vertical-align: middle;">Evento</span>'
            : '';
          const itemFlowBadges = renderFinancialFlowBadges(item);

          tdItemName.innerHTML = `
            <div style="color: #f5f5f5;">${item.name}${parentAnnualBadge}${itemFlowBadges}${itemBiweeklyBadge}</div>
            <div style="font-size: 0.72rem; color: #8e8eab; margin-top: 2px; line-height: 1.3;">${singleMetaText}</div>
          `;
        }

        const tdItemPrev = document.createElement('td');
        tdItemPrev.className = 'numeric';
        const isItemPrevIncome = item.planned < 0;
        tdItemPrev.style.color = item.planned === 0 ? '#f5f5f5' : isItemPrevIncome ? '#62c462' : '#f5f5f5';
        // Aplica a flag de categoria para proteger os sub-itens do Salário
        tdItemPrev.textContent = item.planned === 0 ? formatCurrency(0, isSalarioCat) : isItemPrevIncome ? `+ ${formatCurrency(Math.abs(item.planned), isSalarioCat)}` : formatCurrency(item.planned, isSalarioCat);

        const tdItemReal = document.createElement('td');
        tdItemReal.className = 'numeric';
        const isItemIncome = item.actual < 0;
        tdItemReal.style.color = item.actual === 0 ? '#f5f5f5' : isItemIncome ? '#62c462' : '#ff7b7b';
        tdItemReal.textContent = item.actual === 0 ? formatCurrency(0, isSalarioCat) : isItemIncome ? `+ ${formatCurrency(Math.abs(item.actual), isSalarioCat)}` : `- ${formatCurrency(Math.abs(item.actual), isSalarioCat)}`;

        const tdItemDiff = document.createElement('td');
        tdItemDiff.className = 'numeric ' + (diffItem > 0 ? 'positive' : diffItem === 0 ? 'neutral' : 'negative');
        tdItemDiff.textContent = formatCurrency(diffItem, isSalarioCat);

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

  const totalActualEl = document.getElementById('dashboard-total-actual');
  const isSumIncome = sumActual < 0;
  totalActualEl.style.color = sumActual === 0 ? '#f5f5f5' : isSumIncome ? '#62c462' : '#ff7b7b';
  totalActualEl.textContent = sumActual === 0 ? formatCurrency(0) : isSumIncome ? `+ ${formatCurrency(Math.abs(sumActual))}` : `- ${formatCurrency(Math.abs(sumActual))}`;

  const tdDiffTotal = document.getElementById('dashboard-total-diff');
  tdDiffTotal.textContent = formatCurrency(totalDiff);
  tdDiffTotal.className = 'numeric ' + (totalDiff > 0 ? 'positive' : totalDiff === 0 ? 'neutral' : 'negative');
}

// ===== Gráficos (Chart.js) =====

let categoriesChart = null;
const chartsCanvas = document.getElementById('chart-categories');

function formatChartValueLabel(value) {
  const valueInCents = Math.round(Number(value) * 100) / 100;
  const hasCents = Math.abs(valueInCents - Math.trunc(valueInCents)) > 0.000001;

  return valueInCents.toLocaleString('pt-BR', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

function updateChartsView() {
  const month = getCurrentMonth();
  if (!month || !chartsCanvas) return;

  const plannedForMonth = plannedItems.filter((p) => p.month === month);
  const actualForMonth = receipts.filter((r) => r.date.startsWith(month));

  const mapCat = {};

  // Removemos totalmente a lógica de planejar entradas
  plannedForMonth.forEach((p) => {
    if (!mapCat[p.category]) {
      mapCat[p.category] = { plannedGasto: 0, actualGasto: 0, actualEntrada: 0 };
    }
    if (p.amount > 0) mapCat[p.category].plannedGasto += p.amount;
  });

  actualForMonth.forEach((r) => {
    if (!mapCat[r.category]) {
      mapCat[r.category] = { plannedGasto: 0, actualGasto: 0, actualEntrada: 0 };
    }
    if (r.amount > 0) mapCat[r.category].actualGasto += r.amount;
    else mapCat[r.category].actualEntrada += Math.abs(r.amount);
  });

  const labels = Object.keys(mapCat).sort((a, b) => a.localeCompare(b));

  const plannedGastoData = labels.map((cat) => mapCat[cat].plannedGasto);
  const actualGastoData = labels.map((cat) => mapCat[cat].actualGasto);
  const actualEntradaData = labels.map((cat) => mapCat[cat].actualEntrada);

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
          ctx.font = '10px system-ui, sans-serif';
          ctx.textAlign = 'center';

          // Agora temos apenas 3 datasets: 0 = Prev Gasto, 1 = Real Gasto, 2 = Real Entrada
          const isRealGasto = i === 1;
          const hasRealEntradaEmpilhada = chart.data.datasets[2] && chart.data.datasets[2].data[index] > 0;

          let yPos;
          if (isRealGasto && hasRealEntradaEmpilhada) {
            // Se houver entrada real por cima do gasto real, joga o texto do gasto para dentro do bloco vermelho
            ctx.textBaseline = 'top';
            yPos = bar.y + 6;
            ctx.fillStyle = '#ffffff';
          } else {
            // Rótulo normal no topo externo para colunas livres de empilhamento
            ctx.textBaseline = 'bottom';
            yPos = bar.y - 5;
            ctx.fillStyle = '#c3c3d5';
          }

          // Mascara o texto do topo das barras se a privacidade estiver ativa
          // Verifica se a barra atual pertence à categoria de Salário
          const isSalarioCat = labels[index] && labels[index].toLowerCase() === 'salário';

          // Mascara apenas se for a coluna de Salário, caso contrário exibe o valor real
          const text = isPrivacyMode && isSalarioCat ? '••••' : formatChartValueLabel(value);

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
        { label: 'Prev. Gasto', data: plannedGastoData, backgroundColor: '#2b6cb0', stack: 'Previsto' },
        { label: 'Real Gasto', data: actualGastoData, backgroundColor: '#ff7b7b', stack: 'Real' },
        { label: 'Real Entrada', data: actualEntradaData, backgroundColor: '#62c462', stack: 'Real' },
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
      plugins: {
        tooltip: {
          callbacks: {
            // Filtra o balão de texto do mouse para mascarar somente o bloco de receita do salário
            label: function (context) {
              if (isPrivacyMode && context.datasetIndex === 2 && context.label.toLowerCase() === 'salário') {
                return context.dataset.label + ': ••••';
              }
              return context.dataset.label + ': ' + formatChartValueLabel(context.raw);
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            // Deixa o eixo Y livre para leitura já que os gastos normais estão visíveis
            callback: function (value) {
              return value;
            },
          },
        },
      },
    },
  });
}

document.getElementById('btn-privacy')?.addEventListener('click', (e) => {
  isPrivacyMode = !isPrivacyMode;
  e.target.textContent = isPrivacyMode ? '🙈' : '👁️';

  // Captura o display do menu de usuário da foto e mascara cirurgicamente
  const userDisplay = document.getElementById('user-display');
  if (userDisplay) {
    if (isPrivacyMode) {
      userDisplay.setAttribute('data-name-backup', userDisplay.textContent);
      userDisplay.textContent = '👤 ••••';
    } else {
      const backup = userDisplay.getAttribute('data-name-backup');
      if (backup) userDisplay.textContent = backup;
    }
  }

  refreshAll();
  showToast(isPrivacyMode ? 'Modo privacidade ativado!' : 'Modo privacidade desativado.', 'info');
});

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
      const limit = historyMonthsSelect.value;
      const currentMonth = getCurrentMonth();
      if (!currentMonth) return;

      // 1. Gera as datas exatas matematicamente a partir do mês selecionado
      let targetMonths = [];
      const [currYear, currMonthNum] = currentMonth.split('-').map(Number);

      // Se for 'all', busca os últimos 24 meses para garantir o histórico sem travar o Firebase
      const monthsCount = limit === 'all' ? 24 : parseInt(limit);

      for (let i = monthsCount - 1; i >= 0; i--) {
        const d = new Date(currYear, currMonthNum - 1 - i, 1);
        targetMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }

      let allMonthsData = [];

      // Memória: Mês atual e anterior já estão no 'receipts' devido ao syncData
      const prevD = new Date(currYear, currMonthNum - 2, 1);
      const prevMonthStr = prevD.getFullYear() + '-' + String(prevD.getMonth() + 1).padStart(2, '0');

      // 2. Busca exata e forçada para cada mês gerado no array
      for (const monthStr of targetMonths) {
        let income = getIncomeTotalForMonth(monthStr);
        let expense = 0;

        if (monthStr === currentMonth || monthStr === prevMonthStr) {
          // Otimização: Lê direto da memória local se for o mês atual ou anterior
          expense = receipts.filter((r) => r.date.startsWith(monthStr)).reduce((acc, r) => acc + r.amount, 0);
        } else {
          // Força o Firebase a procurar as notas, mesmo se não houver renda salva naquele mês
          const notasSnap = await window.db.collection('familias').doc(window.FinanceAPI.familyId).collection('meses').doc(monthStr).collection('notas_fiscais').get();

          notasSnap.forEach((n) => {
            expense += n.data().amount || 0;
          });
        }

        allMonthsData.push({ month: monthStr, income, expense });
      }

      const labels = [];
      const monthlyBalances = [];
      let selectedPeriodTotal = 0;

      allMonthsData.forEach((d) => {
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
              ctx.font = '10px system-ui, sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = value >= 0 ? 'bottom' : 'top';

              const yPos = value >= 0 ? bar.y - 5 : bar.y + 5;
              const text = formatChartValueLabel(value);

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
const openCreditCardDetails = new Set();

function escapeCardDetail(value) {
  return String(value || '').replace(
    /[&<>'"]/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      })[character],
  );
}

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
    let prevRollover = 0;
    let currentMonthInsideInvoice = 0;
    const currentInvoiceEntries = [];
    const nextInvoiceEntries = [];

    const cardCurrentReceipts = currentMonthReceipts.filter((r) => r.paymentMethodId === card.id);
    cardCurrentReceipts.forEach((r) => {
      monthSpend += r.amount;
      const rDay = parseInt(r.date.split('-')[2]);

      if (card.closing && rDay > card.closing) {
        nextInvoice += r.amount;
        nextInvoiceEntries.push({ receipt: r, source: 'Lançado após o fechamento' });
      } else {
        currentInvoice += r.amount;
        currentMonthInsideInvoice += r.amount;
        currentInvoiceEntries.push({ receipt: r, source: 'Lançado neste mês' });
      }
    });

    const cardPrevReceipts = prevMonthReceipts.filter((r) => r.paymentMethodId === card.id);
    cardPrevReceipts.forEach((r) => {
      const rDay = parseInt(r.date.split('-')[2]);
      if (card.closing && rDay > card.closing) {
        currentInvoice += r.amount;
        prevRollover += r.amount;
        currentInvoiceEntries.push({ receipt: r, source: 'Mês anterior, após o fechamento' });
      }
    });

    const visualTotal = currentInvoice + nextInvoice;

    if (visualTotal > 0 || monthSpend > 0) {
      hasAnySpending = true;
      const isExpanded = openCreditCardDetails.has(card.id);
      const pPrev = visualTotal > 0 ? (prevRollover / visualTotal) * 100 : 0;
      const pCurr = visualTotal > 0 ? (currentMonthInsideInvoice / visualTotal) * 100 : 0;
      const pNext = visualTotal > 0 ? (nextInvoice / visualTotal) * 100 : 0;
      const currentInvoiceRows = currentInvoiceEntries
        .sort((a, b) => b.receipt.date.localeCompare(a.receipt.date))
        .map(({ receipt, source }) => {
          const observation = receipt.observation ? `<div class="credit-card-detail-observation">↳ ${escapeCardDetail(receipt.observation)}</div>` : '';
          return `
            <div class="credit-card-detail-row">
              <div>
                <strong>${escapeCardDetail(receipt.merchant)}</strong>
                <span>${receipt.date.split('-').reverse().join('/')} · ${escapeCardDetail(receipt.category)} · ${escapeCardDetail(source)}</span>
                ${observation}
              </div>
              <b>${formatCurrency(receipt.amount)}</b>
            </div>
          `;
        })
        .join('');
      const nextInvoiceSummary = nextInvoiceEntries.length > 0 ? `<div class="credit-card-next-invoice">Próxima fatura: ${formatCurrency(nextInvoice)} em ${nextInvoiceEntries.length} lançamento${nextInvoiceEntries.length > 1 ? 's' : ''}.</div>` : '';

      html += `
        <div class="credit-card-card ${isExpanded ? 'is-expanded' : ''}">
          <div class="credit-card-summary" data-credit-card-id="${card.id}" role="button" tabindex="0" aria-expanded="${isExpanded}" title="${isExpanded ? 'Fechar detalhes da fatura' : 'Ver lançamentos da fatura'}">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="toggle-icon credit-card-toggle-icon" aria-hidden="true">${isExpanded ? '&#9660;' : '&#9654;'}</span>
              <span class="credit-card-brand-icon" style="background: rgba(253, 223, 123, 0.1); color: #fddf7b; padding: 6px; border-radius: 8px; font-size: 1.1rem; border: 1px solid rgba(253, 223, 123, 0.2);">💳</span>
              <div>
                <div style="font-weight: 600; color: #f5f5f5; font-size: 0.95rem;">${card.name}</div>
                <div class="credit-card-dates" style="font-size: 0.72rem; color: #a6a6c0;">Fecha dia ${card.closing || '?'} • Vence dia ${card.due || '?'}</div>
              </div>
            </div>
            <div class="credit-card-invoice" style="text-align: right;">
              <div style="font-size: 0.72rem; color: #a6a6c0; text-transform: uppercase; font-weight: 600;">Fatura Atual</div>
              <div class="credit-card-invoice-value" style="font-weight: 800; color: #62c462; font-size: 1.25rem; letter-spacing: -0.5px;">${formatCurrency(currentInvoice)}</div>
            </div>
          </div>
          
          ${
            card.closing
              ? `
          <div class="credit-card-composition-bar" style="display: flex; height: 6px; border-radius: 3px; overflow: hidden; background: #0b0b10; margin-top: 4px; border: 1px solid #27273a;">
            ${pPrev > 0 ? `<div style="width: ${pPrev}%; background: #4a90e2;" title="Mês Passado"></div>` : ''}
            ${pCurr > 0 ? `<div style="width: ${pCurr}%; background: #62c462;" title="Fatura Atual (Este Mês)"></div>` : ''}
            ${pNext > 0 ? `<div style="width: ${pNext}%; background: #f7c84a;" title="Próxima Fatura"></div>` : ''}
          </div>
          
          <div class="credit-card-composition-legend" style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: #a6a6c0; margin-top: 4px;">
            <span style="display: flex; align-items: center; gap: 6px;">
              <span><strong style="color: #4a90e2;">■</strong> Passado: <span style="color: #c3c3d5;">${formatCurrency(prevRollover)}</span></span>
              <span style="color: #4a4a6a;">|</span>
              <span><strong style="color: #62c462;">■</strong> Gasto no Mês: <span style="color: #c3c3d5;">${formatCurrency(monthSpend)}</span></span>
            </span>
            <span><strong style="color: #f7c84a;">■</strong> Próx. Fatura: <span style="color: #f5f5f5;">${formatCurrency(nextInvoice)}</span></span>
          </div>
          `
              : ''
          }
          ${
            isExpanded
              ? `<div class="credit-card-details">
                  <div class="credit-card-details-title"><span>Composição da fatura atual</span><strong>${formatCurrency(currentInvoice)}</strong></div>
                  ${currentInvoiceRows || '<p class="hint">Nenhum lançamento compõe esta fatura.</p>'}
                  ${nextInvoiceSummary}
                </div>`
              : ''
          }
        </div>
      `;
    }
  });

  if (hasAnySpending) {
    container.innerHTML = html;
    container.querySelectorAll('.credit-card-summary').forEach((summary) => {
      const toggleDetails = () => {
        const cardId = summary.dataset.creditCardId;
        if (openCreditCardDetails.has(cardId)) openCreditCardDetails.delete(cardId);
        else openCreditCardDetails.add(cardId);
        updateCreditCardsDashboard();
      };

      summary.addEventListener('click', toggleDetails);
      summary.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggleDetails();
        }
      });
    });
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

  if (window.updateToggleButtonsState) {
    window.updateToggleButtonsState(document.getElementById('btn-toggle-reimbursement'));
  }

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

let isAppReady = false;

function refreshAll() {
  // Só esconde o loader quando o primeiro ciclo de dados for injetado na tela
  if (!isAppReady) {
    isAppReady = true;
    const globalLoader = document.getElementById('global-loader');
    if (globalLoader) {
      globalLoader.style.opacity = '0';
      setTimeout(() => (globalLoader.style.display = 'none'), 300);
    }
  }

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
    isFreeProjectionExpanded = false;
    const fixedDetails = document.getElementById('summary-fixed-details');
    const freeCard = document.querySelector('.dash-item-free');
    const freeProjectionArrow = document.getElementById('summary-free-projection-arrow');
    const freeAfterFixed = document.getElementById('summary-free-after-fixed');
    if (summaryFreeProjectionToggle) {
      summaryFreeProjectionToggle.classList.remove('is-available');
      summaryFreeProjectionToggle.setAttribute('aria-disabled', 'true');
      summaryFreeProjectionToggle.setAttribute('aria-expanded', 'false');
    }
    if (freeProjectionArrow) freeProjectionArrow.textContent = '▶';
    if (freeAfterFixed) {
      freeAfterFixed.textContent = '';
      freeAfterFixed.classList.remove('visible');
    }
    if (fixedDetails) {
      fixedDetails.innerHTML = '';
      fixedDetails.classList.remove('visible');
    }
    if (freeCard) freeCard.classList.remove('is-expanded');
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
  updateBudgetBadge();
}

// ===== Inicialização e Autenticação =====

const loginOverlay = document.getElementById('login-overlay');
const formLogin = document.getElementById('form-login');
const btnLogout = document.getElementById('btn-logout');
const btnDoLogin = document.getElementById('btn-do-login');

function syncData(month) {
  if (!month) return;

  FinanceAPI.clearListeners();

  FinanceAPI.listenPaymentMethods((methods) => {
    paymentMethods = methods || [];
    renderPaymentMethodsList();
    updatePaymentSelects();
  });

  FinanceAPI.listenCompanies((comps) => {
    if (comps && Object.keys(comps).length > 0) {
      const { normalizedDirectory, changed } = normalizeCompanyDirectorySnapshot(comps);
      Object.keys(companyDirectory).forEach((key) => delete companyDirectory[key]);
      Object.assign(companyDirectory, normalizedDirectory);
      updatePlannedChips();
      updateReceiptChips();
      if (changed) {
        FinanceAPI.saveCompanies(normalizedDirectory).catch((error) => console.error('Não foi possível limpar empresas duplicadas:', error));
      }
    }
  });

  FinanceAPI.listenCompanyFavorites((items) => {
    favoriteCompanyKeys.clear();
    (items || []).forEach((key) => favoriteCompanyKeys.add(key));
    updatePlannedChips();
    updateReceiptChips();
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

  // LÓGICA NOVA: Descobre qual é o mês anterior para carregar em background
  const [year, m] = month.split('-');
  const prevDate = new Date(year, parseInt(m) - 2, 1);
  const prevMonthStr = prevDate.getFullYear() + '-' + String(prevDate.getMonth() + 1).padStart(2, '0');

  // 1. Escuta as notas do Mês Atual
  FinanceAPI.listenReceipts(month, (rItems) => {
    for (let i = receipts.length - 1; i >= 0; i--) {
      if (receipts[i].date.startsWith(month)) receipts.splice(i, 1);
    }
    receipts.push(...rItems);
    refreshAll();
  });

  // 2. Escuta as notas do Mês Anterior (Exclusivo para plugar os dados na Fatura do Cartão)
  FinanceAPI.listenReceipts(prevMonthStr, (rItems) => {
    for (let i = receipts.length - 1; i >= 0; i--) {
      if (receipts[i].date.startsWith(prevMonthStr)) receipts.splice(i, 1);
    }
    receipts.push(...rItems);
    refreshAll();
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

  // Pula a biometria se já foi validada nesta sessão (evita pedir de novo no F5 ou atualização)
  if (sessionStorage.getItem('biometria_ok') === 'true') {
    if (biometricOverlay) biometricOverlay.style.display = 'none';
    return true;
  }

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
    sessionStorage.setItem('biometria_ok', 'true');
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
    if (globalLoader) {
      globalLoader.style.opacity = '0';
      setTimeout(() => (globalLoader.style.display = 'none'), 300);
    }
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
  sessionStorage.removeItem('biometria_ok');
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
const annualOneOffCheckbox = document.getElementById('annual-one-off');
const annualInstallmentCheck = document.getElementById('annual-installment-check');
const annualInstallmentFields = document.getElementById('annual-installment-fields');
const annualInstallmentsCount = document.getElementById('annual-installments-count');
const annualInstallmentsInterval = document.getElementById('annual-installments-interval');
const annualSubmitBtn = document.getElementById('annual-submit-btn');
const annualItemsList = document.getElementById('annual-items-list');

if (annualInstallmentCheck) {
  annualInstallmentCheck.addEventListener('change', (e) => {
    annualInstallmentFields.style.display = e.target.checked ? 'flex' : 'none';
  });
}

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
    updateAutoCreateNotices();
  });
  updateAutoCreateNotices();
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
    const rawAmount = parseAmount(annualAmountInput.value);
    const isIncome = document.getElementById('annual-is-income')?.checked || false;
    const amount = isIncome ? -Math.abs(rawAmount) : Math.abs(rawAmount);
    const owner = annualOwnerSelect.value;
    const paymentMethodId = annualPaymentSelect.value;
    const observation = annualObservationInput.value.trim();
    const isOneOff = annualOneOffCheckbox ? annualOneOffCheckbox.checked : false;

    if (!name || !category || !monthTarget || !dayTarget || isNaN(amount) || !paymentMethodId) {
      return showToast('Preencha todos os campos obrigatórios.', 'error');
    }

    annualSubmitBtn.textContent = 'Salvando...';
    annualSubmitBtn.disabled = true;

    await autoRegisterCompany(category, name);

    const isInstallment = annualInstallmentCheck && annualInstallmentCheck.checked && !editingAnnualId;
    const count = isInstallment ? parseInt(annualInstallmentsCount.value) || 2 : 1;
    const interval = isInstallment ? parseInt(annualInstallmentsInterval.value) || 1 : 1;

    let baseMonth = parseInt(monthTarget);

    for (let i = 0; i < count; i++) {
      let m = (baseMonth + i * interval) % 12;
      if (m === 0) m = 12; // Mês 12 (Dezembro) ao invés de 0

      const currentTargetMonth = String(m).padStart(2, '0');
      const currentName = isInstallment ? `${name} (${i + 1}/${count})` : name;

      const itemData = {
        name: currentName,
        category,
        monthTarget: currentTargetMonth,
        dayTarget,
        amount,
        owner,
        paymentMethodId,
        observation,
        isOneOff,
        isIncome,
      };

      if (editingAnnualId && !isInstallment) {
        itemData.id = editingAnnualId;
      }

      await FinanceAPI.saveAnnualEvent(itemData);
      logActivity(editingAnnualId && !isInstallment ? 'Editou' : 'Adicionou', `Evento Anual: ${currentName} - ${formatCurrency(amount)}`);
    }

    annualSubmitBtn.textContent = 'Salvar Evento Anual';
    annualSubmitBtn.disabled = false;
    resetAnnualForm();
    showToast(isInstallment ? `${count} parcelas salvas com sucesso!` : 'Evento anual salvo com sucesso!', 'success');
  });
}

function resetAnnualForm() {
  formAnnual.reset();
  editingAnnualId = null;
  annualSubmitBtn.textContent = 'Salvar Evento Anual';

  selectedAnnualType = getCategories()[0] || '';
  if (annualCategoryInput) annualCategoryInput.value = selectedAnnualType;
  if (annualObservationInput) annualObservationInput.value = '';
  if (annualOneOffCheckbox) annualOneOffCheckbox.checked = false;
  const isIncomeCheck = document.getElementById('annual-is-income');
  if (isIncomeCheck) isIncomeCheck.checked = false;
  if (annualInstallmentCheck) annualInstallmentCheck.checked = false;
  if (annualInstallmentFields) annualInstallmentFields.style.display = 'none';
  if (annualInstallmentCheck) annualInstallmentCheck.parentElement.parentElement.style.display = 'flex'; // Garante que volta a aparecer caso estivesse editando
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

  annualAmountInput.value = Math.abs(item.amount);
  const isIncomeCheck = document.getElementById('annual-is-income');
  if (isIncomeCheck) isIncomeCheck.checked = item.amount < 0 || item.isIncome;

  annualOwnerSelect.value = item.owner;
  annualPaymentSelect.value = item.paymentMethodId || 'dinheiro';
  annualObservationInput.value = item.observation || '';
  if (annualOneOffCheckbox) annualOneOffCheckbox.checked = item.isOneOff || false;

  // Oculta opção de gerar parcelas ao editar
  if (annualInstallmentCheck) annualInstallmentCheck.parentElement.parentElement.style.display = 'none';

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
  const ev = annualEvents.find((a) => a.id === id);
  await FinanceAPI.deleteAnnualEvent(id);
  if (ev) logActivity('Excluiu', `Evento Anual: ${ev.name} - ${formatCurrency(Math.abs(ev.amount))}`);
  if (editingAnnualId === id) resetAnnualForm();
  showToast('Evento excluído.', 'success');
}

const annualMonthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
let annualDragState = null;

function getAnnualMonthLastDay(monthTarget) {
  const month = parseInt(monthTarget, 10);
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] || 31;
}

function clearAnnualDragTarget(state) {
  if (state.target) state.target.classList.remove('is-drag-over');
  state.target = null;
}

function updateAnnualDragPosition(state, clientX, clientY) {
  if (!state.active) return;

  const maxLeft = Math.max(window.innerWidth - state.ghost.offsetWidth - 8, 8);
  const maxTop = Math.max(window.innerHeight - state.ghost.offsetHeight - 8, 8);
  state.ghost.style.left = `${Math.min(clientX + 14, maxLeft)}px`;
  state.ghost.style.top = `${Math.min(clientY + 14, maxTop)}px`;

  const pointedElement = document.elementFromPoint(clientX, clientY);
  const target = pointedElement?.closest('[data-annual-drop-month]') || null;
  if (target !== state.target) {
    clearAnnualDragTarget(state);
    state.target = target;
    if (state.target) state.target.classList.add('is-drag-over');
  }

  state.autoScrollSpeed = clientY < 90 ? -12 : clientY > window.innerHeight - 90 ? 12 : 0;
}

function runAnnualDragAutoScroll(state) {
  if (!state.active) return;
  if (state.autoScrollSpeed) {
    window.scrollBy({ top: state.autoScrollSpeed, behavior: 'auto' });
    updateAnnualDragPosition(state, state.lastX, state.lastY);
  }
  state.autoScrollFrame = requestAnimationFrame(() => runAnnualDragAutoScroll(state));
}

function startAnnualDrag(state, clientX, clientY) {
  if (annualDragState !== state) return;
  state.active = true;
  state.sourceElement.classList.add('annual-dragging-source');
  document.body.classList.add('annual-drag-active');

  const rect = state.sourceElement.getBoundingClientRect();
  state.ghost = state.sourceElement.cloneNode(true);
  state.ghost.className = 'receipt-item annual-drag-ghost';
  state.ghost.style.width = `${Math.min(rect.width, window.innerWidth - 24)}px`;
  state.ghost.querySelectorAll('button').forEach((button) => button.remove());
  document.body.appendChild(state.ghost);

  if (navigator.vibrate) navigator.vibrate(25);
  updateAnnualDragPosition(state, clientX, clientY);
  runAnnualDragAutoScroll(state);
}

function cleanupAnnualDrag(state) {
  clearTimeout(state.pressTimer);
  if (state.autoScrollFrame) cancelAnimationFrame(state.autoScrollFrame);
  clearAnnualDragTarget(state);
  state.sourceElement?.classList.remove('annual-dragging-source');
  state.ghost?.remove();
  document.body.classList.remove('annual-drag-active');
  if (annualDragState === state) annualDragState = null;
}

async function confirmAnnualMove(itemId, targetMonth) {
  const item = annualEvents.find((event) => event.id === itemId);
  if (!item || !targetMonth || item.monthTarget === targetMonth) return;

  const originalDay = parseInt(item.dayTarget, 10) || 1;
  const adjustedDay = Math.min(originalDay, getAnnualMonthLastDay(targetMonth));
  const adjustedDayText = String(adjustedDay).padStart(2, '0');
  const sourceMonthName = annualMonthNames[parseInt(item.monthTarget, 10) - 1];
  const targetMonthName = annualMonthNames[parseInt(targetMonth, 10) - 1];
  const dayAdjustment = adjustedDay !== originalDay ? ` O dia ${String(originalDay).padStart(2, '0')} será ajustado para ${adjustedDayText}.` : ` O dia ${adjustedDayText} será mantido.`;

  const confirmed = await showConfirm(`Mover "${item.name}" de ${sourceMonthName} para ${targetMonthName}?${dayAdjustment}`);
  if (!confirmed) return;

  await FinanceAPI.saveAnnualEvent({ ...item, id: item.id, monthTarget: targetMonth, dayTarget: adjustedDayText });
  logActivity('Moveu', `Evento Anual: ${item.name} • ${sourceMonthName} → ${targetMonthName}`);
  showToast(`Evento movido para ${targetMonthName}.`, 'success');
}

function enableAnnualItemDrag(handle, item, sourceElement) {
  handle.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (annualDragState) return;

    event.preventDefault();
    const state = {
      itemId: item.id,
      sourceElement,
      active: false,
      target: null,
      ghost: null,
      autoScrollSpeed: 0,
      autoScrollFrame: null,
      lastX: event.clientX,
      lastY: event.clientY,
    };
    annualDragState = state;

    const pressDelay = event.pointerType === 'mouse' ? 120 : 380;
    state.pressTimer = setTimeout(() => startAnnualDrag(state, state.lastX, state.lastY), pressDelay);

    const onPointerMove = (moveEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return;
      state.lastX = moveEvent.clientX;
      state.lastY = moveEvent.clientY;
      if (state.active) {
        moveEvent.preventDefault();
        updateAnnualDragPosition(state, moveEvent.clientX, moveEvent.clientY);
      }
    };

    const finishDrag = (finishEvent) => {
      if (finishEvent.pointerId !== event.pointerId) return;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', cancelDrag);

      if (state.active) updateAnnualDragPosition(state, finishEvent.clientX, finishEvent.clientY);
      const targetMonth = state.target?.dataset.annualDropMonth || null;
      const wasActive = state.active;
      cleanupAnnualDrag(state);
      if (wasActive && targetMonth) confirmAnnualMove(state.itemId, targetMonth);
    };

    const cancelDrag = (cancelEvent) => {
      if (cancelEvent.pointerId !== event.pointerId) return;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', cancelDrag);
      cleanupAnnualDrag(state);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', cancelDrag);
  });
}

function renderAnnualList() {
  if (!annualItemsList) return;
  annualItemsList.innerHTML = '';

  if (annualEvents.length === 0) {
    annualItemsList.innerHTML = '<p class="hint">Nenhum evento anual cadastrado.</p>';
    return;
  }

  // 1. Ordena primeiro por mês e depois por dia para ficar na sequência perfeita
  const sorted = [...annualEvents].sort((a, b) => {
    if (a.monthTarget === b.monthTarget) {
      const dayA = a.dayTarget ? parseInt(a.dayTarget) : 1;
      const dayB = b.dayTarget ? parseInt(b.dayTarget) : 1;
      return dayA - dayB;
    }
    return a.monthTarget.localeCompare(b.monthTarget);
  });

  // 2. Agrupa os eventos pelo mês correspondente
  const groupedByMonth = {};
  sorted.forEach((item) => {
    const monthIdx = parseInt(item.monthTarget) - 1;
    if (!groupedByMonth[monthIdx]) groupedByMonth[monthIdx] = [];
    groupedByMonth[monthIdx].push(item);
  });

  const currentViewMonthStr = getCurrentMonth();
  const currentMonthIdx = currentViewMonthStr ? parseInt(currentViewMonthStr.split('-')[1]) - 1 : -1;

  // 3. Renderiza os blocos divididos por mês
  Array.from({ length: 12 }, (_, index) => String(index))
    .forEach((monthIdx) => {
      const isCurrentMonth = parseInt(monthIdx) === currentMonthIdx;
      const monthItems = groupedByMonth[monthIdx] || [];
      const isEmptyMonth = monthItems.length === 0;

      // Cria o cabeçalho do mês
      const header = document.createElement('div');
      header.className = `group-header-div annual-month-drop-zone${isEmptyMonth ? ' annual-empty-month-drop-zone' : ''}`;
      header.dataset.annualDropMonth = String(parseInt(monthIdx, 10) + 1).padStart(2, '0');
      header.style.cursor = 'default';
      header.style.borderLeft = isCurrentMonth ? '4px solid #62c462' : '4px solid #f7c84a';
      if (isCurrentMonth) header.style.background = 'linear-gradient(90deg, rgba(98, 196, 98, 0.15) 0%, #1a1a2e 100%)';

      const badgeHtml = isCurrentMonth
        ? ' <span style="background: rgba(98, 196, 98, 0.15); color: #62c462; padding: 2px 6px; border-radius: 6px; font-size: 0.65rem; border: 1px solid rgba(98, 196, 98, 0.3); margin-left: 8px; vertical-align: middle;">Mês Atual</span>'
        : '';

      header.innerHTML = `<span style="color: #f5f5f5; font-size: 1rem; font-weight: 700;">📅 ${annualMonthNames[monthIdx]}${badgeHtml}</span>`;
      annualItemsList.appendChild(header);

      // Meses vazios aparecem somente durante o arraste, no lugar cronológico correto.
      if (isEmptyMonth) return;

      // Cria um container para dar um leve recuo (identação) nos itens daquele mês
      const itemsContainer = document.createElement('div');
      itemsContainer.className = 'annual-month-items-drop-zone';
      itemsContainer.dataset.annualDropMonth = header.dataset.annualDropMonth;
      itemsContainer.style.borderLeft = '2px solid #27273a';
      itemsContainer.style.marginLeft = '8px';
      itemsContainer.style.paddingLeft = '8px';
      itemsContainer.style.display = 'flex';
      itemsContainer.style.flexDirection = 'column';
      itemsContainer.style.gap = '6px';
      itemsContainer.style.marginBottom = '12px';

      // Adiciona os itens dentro do mês
      monthItems.forEach((item) => {
        const el = document.createElement('div');
        el.className = 'receipt-item annual-event-item';

        const diaText = item.dayTarget ? `Dia ${item.dayTarget}` : 'Dia 01';
        const payStr = ` • ${getPaymentName(item.paymentMethodId)}`;
        const obsHtml = item.observation ? `<div style="font-size: 0.75rem; color: #a6a6c0; margin-top: 2px;">↳ ${item.observation}</div>` : '';
        const oneOffBadge = item.isOneOff
          ? ' <span style="background: rgba(255, 123, 123, 0.15); color: #ff7b7b; padding: 2px 6px; border-radius: 6px; font-size: 0.65rem; border: 1px solid rgba(255, 123, 123, 0.3); margin-left: 6px; vertical-align: middle;">Único</span>'
          : '';

        const isIncome = item.amount < 0 || item.isIncome;
        const amountColor = isIncome ? '#62c462' : '#ff7b7b';
        const displayAmount = isIncome ? `+ ${formatCurrency(Math.abs(item.amount))}` : `- ${formatCurrency(Math.abs(item.amount))}`;
        const incomeBadge = isIncome ? ' <span style="color:#62c462; font-size:0.7rem; font-weight:bold; margin-left: 4px;">(Entrada)</span>' : '';

        el.innerHTML = `
        <button type="button" class="annual-drag-handle" aria-label="Mover ${item.name}" title="Pressione e arraste para outro mês">⠿</button>
        <div class="receipt-main">
          <div class="receipt-line">${item.name}${oneOffBadge}${incomeBadge} <span style="color:#fddf7b; font-size: 0.75rem; margin-left: 4px;">[${diaText}]</span></div>
          ${obsHtml}
          <div class="receipt-meta" style="margin-top:2px;">${item.category} • Resp: ${item.owner}${payStr}</div>
        </div>
        <div class="receipt-right">
          <div class="receipt-amount" style="color: ${amountColor};">${displayAmount}</div>
          <div class="receipt-actions">
            <button class="action-btn" onclick="startEditAnnual('${item.id}')">Editar</button>
            <button class="action-btn danger" onclick="deleteAnnual('${item.id}')">Excluir</button>
          </div>
        </div>
      `;
        const dragHandle = el.querySelector('.annual-drag-handle');
        if (dragHandle) enableAnnualItemDrag(dragHandle, item, el);
        itemsContainer.appendChild(el);
      });

      annualItemsList.appendChild(itemsContainer);
    });
}

// === Sistema de Alerta na Aba de Orçamento ===
function updateBudgetBadge() {
  const month = getCurrentMonth();
  const navBtnBudget = document.querySelector('.nav-btn[data-view="budget"]');
  if (!navBtnBudget) return;

  if (!month) {
    navBtnBudget.innerHTML = '📋 1. Orçamento';
    return;
  }

  const plannedForMonth = plannedItems.filter((p) => p.month === month);
  let pendingCount = 0;

  plannedForMonth.forEach((p) => {
    const isEvent = p.linkedAnnualId || p.category === 'Eventos';
    if (!isEvent) return; // Ignora se não for evento

    const isLaunched = receipts.some((r) => {
      if (r.linkedPlannedId) return r.linkedPlannedId === p.id;
      return r.date.startsWith(month) && r.category === p.category && r.merchant.toLowerCase() === p.description.toLowerCase() && r.owner === p.owner && Math.abs(r.amount) === Math.abs(p.amount);
    });
    if (!isLaunched) {
      pendingCount++;
    }
  });

  if (pendingCount > 0) {
    navBtnBudget.innerHTML = `Orçamento <span style="background: #f7c84a; color: #12121c; border-radius: 50%; padding: 2px 6px; font-size: 0.7rem; font-weight: bold; margin-left: 4px;">${pendingCount}</span>`;
  } else {
    navBtnBudget.innerHTML = 'Orçamento';
  }
}

// === Sistema de Alerta no Orçamento ===
function checkAnnualAlerts() {
  const currentMonthStr = getCurrentMonth();
  if (!currentMonthStr) return;

  const currentMonthNum = currentMonthStr.split('-')[1];

  const pendingEvents = annualEvents.filter((ev) => {
    if (ev.monthTarget !== currentMonthNum) return false;

    const alreadyPlanned = plannedItems.some((p) => {
      if (p.month !== currentMonthStr) return false;

      // 1. Verificação por ID (Vínculo Forte)
      if (p.linkedAnnualId === ev.id) return true;

      // 2. Múltipla Verificação (Fallback): Nome + Categoria + Dono + Valor
      return p.description.toLowerCase() === ev.name.toLowerCase() && p.category === ev.category && p.owner === ev.owner && Math.abs(p.amount) === Math.abs(ev.amount);
    });

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

    const oneOffBadge = ev.isOneOff ? ' <span style="color:#ff7b7b; font-size:0.7rem; font-weight:bold;">(Único)</span>' : '';
    const obsHtml = ev.observation ? `<div style="font-size: 0.75rem; color: #a6a6c0; margin-top: 2px;">↳ ${ev.observation}</div>` : '';

    const isIncome = ev.amount < 0 || ev.isIncome;
    const amountColor = isIncome ? '#62c462' : '#ff7b7b';
    const displayAmount = isIncome ? `+ ${formatCurrency(Math.abs(ev.amount))}` : `- ${formatCurrency(Math.abs(ev.amount))}`;
    const incomeBadge = isIncome ? ' <span style="color:#62c462; font-size:0.7rem; font-weight:bold; margin-left: 4px;">(Entrada)</span>' : '';

    el.innerHTML = `
      <div>
        <div style="font-weight: 600; font-size: 0.9rem; color: #f5f5f5;">${ev.name}${oneOffBadge}${incomeBadge} (Dia ${ev.dayTarget || '01'})</div>
        ${obsHtml}
        <div style="font-size: 0.75rem; color: #a6a6c0; margin-top: 2px;">Previsto: <span style="color: ${amountColor}; font-weight: 600;">${displayAmount}</span> • ${ev.owner}</div>
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
    linkedAnnualId: ev.id, // Tracking injetado aqui
  };

  await FinanceAPI.savePlanned(targetMonthStr, itemData);
  logActivity('Adicionou', `Previsto (via Evento): ${ev.name} - ${formatCurrency(Math.abs(ev.amount))}`);

  if (ev.isOneOff) {
    await FinanceAPI.deleteAnnualEvent(eventId);
    logActivity('Excluiu', `Evento Anual (Único): ${ev.name}`);
    showToast('Lançado no Orçamento e removido dos pendentes!', 'success');
  } else {
    showToast('Lançado com sucesso no Orçamento!', 'success');
  }
};

// ===== PWA e Service Worker (Atualizações Consolidadas) =====
const SERVICE_WORKER_VERSION_KEY = 'controle_financeiro_current_version';
const SERVICE_WORKER_PENDING_VERSION_KEY = 'controle_financeiro_pending_version';
const SERVICE_WORKER_CHECK_INTERVAL = 5 * 60 * 1000;
let updatePromptVisible = false;
let updateInProgress = false;
let deferredUpdateVersion = null;
let pendingServiceWorkerUpdate = null;
let serviceWorkerRegistration = null;
let serviceWorkerReloading = false;

async function getAvailableServiceWorkerVersion() {
  try {
    const response = await fetch(`./service-worker.js?update-check=${Date.now()}`, { cache: 'no-store' });
    const source = await response.text();
    const match = source.match(/CACHE_NAME\s*=\s*['"`]controle-financeiro-v(\d+)['"`]/);
    return match ? parseInt(match[1], 10) : null;
  } catch (error) {
    console.error('Não foi possível consultar a versão da atualização:', error);
    return null;
  }
}

function getSavedServiceWorkerVersion() {
  const version = parseInt(localStorage.getItem(SERVICE_WORKER_VERSION_KEY), 10);
  return Number.isFinite(version) ? version : null;
}

function getWorkerVersion(worker, timeout = 1200) {
  if (!worker) return Promise.resolve(null);

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), timeout);

    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      const match = String(event.data?.cacheName || '').match(/controle-financeiro-v(\d+)/);
      resolve(match ? parseInt(match[1], 10) : null);
    };

    try {
      worker.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
    } catch (error) {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

function updatePromptSummary(totalUpdates) {
  const summary = document.getElementById('update-summary');
  if (!summary) return;
  summary.textContent = `${totalUpdates} ${totalUpdates > 1 ? 'atualizações acumuladas estão prontas' : 'atualização acumulada está pronta'}. Deseja aplicar agora?`;
}

async function queueServiceWorkerUpdate(registration, worker) {
  if (!worker) return;

  const workerVersion = (await getWorkerVersion(worker)) || (await getAvailableServiceWorkerVersion());
  if (!workerVersion) return;

  let savedVersion = getSavedServiceWorkerVersion();
  if (savedVersion === null) {
    // Clientes antigos podem ainda não possuir a versão salva. Quando já existe
    // um controlador e outro worker está esperando, considera ao menos uma atualização.
    const controlledVersion = await getWorkerVersion(navigator.serviceWorker.controller);
    savedVersion = controlledVersion || Math.max(workerVersion - 1, 0);
    if (controlledVersion) localStorage.setItem(SERVICE_WORKER_VERSION_KEY, String(controlledVersion));
  }

  if (workerVersion <= savedVersion) {
    // Repara o caso legado em que a versão foi salva antes de o worker assumir:
    // ativa o worker que ficou esperando e força o reload quando ele controlar a aba.
    sessionStorage.setItem(SERVICE_WORKER_PENDING_VERSION_KEY, String(workerVersion));
    worker.postMessage('skipWaiting');
    return;
  }

  const totalUpdates = Math.max(workerVersion - savedVersion, 1);
  pendingServiceWorkerUpdate = { registration, worker, newVersion: workerVersion, totalUpdates };

  if (updateInProgress) return;
  if (updatePromptVisible) {
    updatePromptSummary(totalUpdates);
    return;
  }
  if (deferredUpdateVersion === workerVersion) return;

  showUpdatePrompt();
}

function waitForWorkerInstallation(worker, timeout = 8000) {
  if (!worker || ['installed', 'activated', 'redundant'].includes(worker.state)) return Promise.resolve();

  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeout);
    worker.addEventListener('statechange', () => {
      if (['installed', 'activated', 'redundant'].includes(worker.state)) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

async function checkForServiceWorkerUpdates(registration, waitForInstall = false) {
  try {
    await registration.update();
    if (waitForInstall && registration.installing) await waitForWorkerInstallation(registration.installing);
    if (registration.waiting) await queueServiceWorkerUpdate(registration, registration.waiting);
  } catch (error) {
    console.error('Não foi possível verificar atualizações do sistema:', error);
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.addEventListener('controllerchange', async () => {
      if (serviceWorkerReloading) return;
      serviceWorkerReloading = true;

      const pendingVersion = parseInt(sessionStorage.getItem(SERVICE_WORKER_PENDING_VERSION_KEY), 10);
      const controlledVersion = await getWorkerVersion(navigator.serviceWorker.controller);
      const appliedVersion = controlledVersion || (Number.isFinite(pendingVersion) ? pendingVersion : null);
      if (appliedVersion) localStorage.setItem(SERVICE_WORKER_VERSION_KEY, String(appliedVersion));
      sessionStorage.removeItem(SERVICE_WORKER_PENDING_VERSION_KEY);

      // Na primeira instalação não há uma atualização confirmada para aplicar.
      if (!Number.isFinite(pendingVersion) && !updateInProgress) {
        serviceWorkerReloading = false;
        return;
      }

      // O novo worker já controla a página e usa rede primeiro para HTML/JS/CSS.
      // O reload abaixo tem, portanto, o mesmo resultado prático de um hard refresh.
      window.location.reload();
    });

    navigator.serviceWorker
      .register('./service-worker.js', { updateViaCache: 'none' })
      .then(async (registration) => {
        serviceWorkerRegistration = registration;

        const controlledVersion = await getWorkerVersion(navigator.serviceWorker.controller);
        if (controlledVersion) {
          const pendingVersion = parseInt(sessionStorage.getItem(SERVICE_WORKER_PENDING_VERSION_KEY), 10);
          if (Number.isFinite(pendingVersion) && controlledVersion >= pendingVersion) {
            localStorage.setItem(SERVICE_WORKER_VERSION_KEY, String(controlledVersion));
            sessionStorage.removeItem(SERVICE_WORKER_PENDING_VERSION_KEY);
          }
        }

        registration.onupdatefound = () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;

          installingWorker.onstatechange = () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              queueServiceWorkerUpdate(registration, installingWorker);
            }
          };
        };

        await checkForServiceWorkerUpdates(registration);
        setInterval(() => checkForServiceWorkerUpdates(registration), SERVICE_WORKER_CHECK_INTERVAL);

        window.addEventListener('online', () => checkForServiceWorkerUpdates(registration));
        window.addEventListener('focus', () => checkForServiceWorkerUpdates(registration));
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') checkForServiceWorkerUpdates(registration);
        });
      })
      .catch((error) => console.error('Falha no Service Worker:', error));
  });
}

function showUpdatePrompt() {
  if (updatePromptVisible || !pendingServiceWorkerUpdate) return;
  updatePromptVisible = true;

  const { totalUpdates } = pendingServiceWorkerUpdate;

  const overlay = document.createElement('div');
  overlay.className = 'custom-modal-overlay active';
  overlay.style.zIndex = '9999999';
  overlay.innerHTML = `
    <div class="custom-modal" style="text-align: center; padding: 30px 20px;">
      <div style="font-size: 2.5rem; margin-bottom: 12px;">✨</div>
      <h2 style="margin: 0 0 10px 0; color: #fddf7b;">Atualização Disponível</h2>
      <p id="update-summary" style="color: #a6a6c0; font-size: 0.95rem; margin-bottom: 24px;">${totalUpdates} ${totalUpdates > 1 ? 'atualizações acumuladas estão prontas' : 'atualização acumulada está pronta'}. Deseja aplicar agora?</p>
      <div class="custom-modal-actions" style="justify-content: center;">
        <button class="custom-modal-btn cancel" id="btn-update-later">Depois</button>
        <button class="custom-modal-btn confirm" id="btn-update-now">Atualizar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('btn-update-later').onclick = () => {
    deferredUpdateVersion = pendingServiceWorkerUpdate?.newVersion || null;
    updatePromptVisible = false;
    overlay.remove();
  };

  document.getElementById('btn-update-now').onclick = async () => {
    const updateButton = document.getElementById('btn-update-now');
    updateButton.disabled = true;
    updateButton.textContent = 'Verificando...';
    updateInProgress = true;

    // Se mais commits chegaram enquanto a modal estava aberta, instala e aplica
    // apenas o worker mais recente, mantendo a contagem acumulada correta.
    if (serviceWorkerRegistration) await checkForServiceWorkerUpdates(serviceWorkerRegistration, true);

    const updateToApply = pendingServiceWorkerUpdate;
    if (!updateToApply) {
      updateInProgress = false;
      updatePromptVisible = false;
      overlay.remove();
      return;
    }

    const { totalUpdates: updatesToApply } = updateToApply;
    overlay.innerHTML = `
      <div class="custom-modal" style="text-align: center; padding: 30px 20px; width: 90%; max-width: 320px;">
        <h2 style="margin: 0 0 16px 0; color: #fddf7b; font-size: 1.1rem;">Baixando atualização...</h2>
        
        <div style="width: 100%; background: #27273a; border-radius: 8px; height: 10px; overflow: hidden; margin-bottom: 8px; border: 1px solid #35354a;">
          <div id="update-progress-bar" style="width: 0%; height: 100%; background: #62c462; transition: width 0.15s linear;"></div>
        </div>
        
        <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: #a6a6c0;">
          <span id="update-status-text">Conectando...</span>
          <span id="update-percent">0%</span>
        </div>
      </div>
    `;

    let progress = 0;
    let currentStep = 1;
    const bar = document.getElementById('update-progress-bar');
    const percentText = document.getElementById('update-percent');
    const statusText = document.getElementById('update-status-text');

    const interval = setInterval(() => {
      const stepTarget = (currentStep / updatesToApply) * 100;
      progress = Math.min(progress + Math.floor(Math.random() * 12) + 4, stepTarget);

      if (progress >= stepTarget && currentStep < updatesToApply) currentStep++;

      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        bar.style.width = '100%';
        statusText.textContent = 'Instalação concluída!';
        statusText.style.color = '#62c462';
        bar.style.background = '#fddf7b';
        percentText.textContent = '100%';
        sessionStorage.setItem(SERVICE_WORKER_PENDING_VERSION_KEY, String(updateToApply.newVersion));

        setTimeout(() => {
          updateToApply.worker.postMessage('skipWaiting');
          // Fallback: se o navegador atrasar controllerchange, uma nova carga mantém
          // a versão como pendente e tenta a ativação novamente, sem marcar sucesso antes.
          setTimeout(() => {
            if (!serviceWorkerReloading) window.location.reload();
          }, 5000);
        }, 500);
      } else {
        bar.style.width = progress + '%';
        percentText.textContent = progress + '%';
        statusText.textContent = `Consolidando atualizações (${currentStep}/${updatesToApply})...`;
      }
    }, 200);
  };
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
