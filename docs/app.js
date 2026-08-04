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
let creditCardPayments = {};
let previousCreditCardPayments = {};
let creditCardStatements = [];
const loadedReceiptMonths = new Set();

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
let reimbursementSourceReceiptId = null;

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
  reimbursementSourceReceiptId = null;
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

  if (reimbursementSourceReceiptId) itemData.reimbursementSourceReceiptId = reimbursementSourceReceiptId;

  const savedReimbursementId = await FinanceAPI.saveReceipt(inputMonth, itemData);
  await reconcileClosedStatementsForReceiptChange(null, { ...itemData, id: savedReimbursementId });
  logActivity('Adicionou', `Reembolso: ${merchant} - ${formatCurrency(Math.abs(amount))}`);

  submitBtn.textContent = 'Salvar Reembolso';
  submitBtn.disabled = false;

  formReimbursement.reset();
  reimbursementSourceReceiptId = null;
  document.getElementById('reimb-date').value = date;
  showToast('Reembolso registrado com sucesso!', 'success');
});

// === LÓGICA DO PAINEL DE CARTÕES ===
const formPayment = document.getElementById('form-payment');
const payTypeSelect = document.getElementById('pay-type');
const payCreditFields = document.getElementById('pay-credit-fields');
const payMonthlyLimitInput = document.getElementById('pay-monthly-limit');

payTypeSelect.addEventListener('change', (e) => {
  const isCredit = e.target.value === 'credito';
  payCreditFields.style.display = isCredit ? 'flex' : 'none';
  payMonthlyLimitInput.required = isCredit;
});

let editingPaymentId = null;
const paySubmitBtn = formPayment.querySelector('button[type="submit"]');

formPayment.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('pay-name').value.trim();
  const type = payTypeSelect.value;
  const closing = document.getElementById('pay-closing').value;
  const due = document.getElementById('pay-due').value;
  const monthlyLimit = parseAmount(document.getElementById('pay-monthly-limit').value);

  if (!name) return;
  if (type === 'credito' && (!Number.isFinite(monthlyLimit) || monthlyLimit <= 0)) {
    payMonthlyLimitInput.focus();
    return showToast('Informe o limite real do cartão.', 'error');
  }

  let updatedMethods = [...paymentMethods];

  if (editingPaymentId) {
    const idx = updatedMethods.findIndex((m) => m.id === editingPaymentId);
      if (idx !== -1) {
        updatedMethods[idx] = {
          ...updatedMethods[idx],
          id: editingPaymentId,
        name,
        type,
        closing: type === 'credito' ? parseInt(closing) || null : null,
        due: type === 'credito' ? parseInt(due) || null : null,
        monthlyLimit: type === 'credito' && Number.isFinite(monthlyLimit) && monthlyLimit > 0 ? monthlyLimit : null,
      };
    }
  } else {
    const newMethod = {
      id: 'pay_' + Date.now(),
      name,
      type,
      closing: type === 'credito' ? parseInt(closing) || null : null,
      due: type === 'credito' ? parseInt(due) || null : null,
      monthlyLimit: type === 'credito' && Number.isFinite(monthlyLimit) && monthlyLimit > 0 ? monthlyLimit : null,
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
  payMonthlyLimitInput.required = payTypeSelect.value === 'credito';
}

function startEditPayment(id) {
  const method = paymentMethods.find((m) => m.id === id);
  if (!method) return;

  editingPaymentId = id;
  document.getElementById('pay-name').value = method.name;
  payTypeSelect.value = method.type;

  if (method.type === 'credito') {
    payCreditFields.style.display = 'flex';
    payMonthlyLimitInput.required = true;
    document.getElementById('pay-closing').value = method.closing || '';
    document.getElementById('pay-due').value = method.due || '';
    document.getElementById('pay-monthly-limit').value = method.monthlyLimit || '';
  } else {
    payCreditFields.style.display = 'none';
    payMonthlyLimitInput.required = false;
    document.getElementById('pay-closing').value = '';
    document.getElementById('pay-due').value = '';
    document.getElementById('pay-monthly-limit').value = '';
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
      const limitText = method.monthlyLimit ? ` • Limite real ${formatCurrency(method.monthlyLimit)}` : ' • Limite não informado';
      detailText = ` • Fecha dia ${method.closing} • ${dueText}${limitText}`;
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
    updateActualPostedDateVisibility();
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

function hasIncomeData(income) {
  return Boolean(income && (income.luana !== undefined || income.gabriel !== undefined));
}

function getIncomeRecordForMonth(month, allowPrevious = true) {
  const exact = incomes.find((income) => income.month === month && hasIncomeData(income));
  if (exact || !allowPrevious) return exact || null;
  return incomes
    .filter((income) => income.month < month && hasIncomeData(income))
    .sort((a, b) => b.month.localeCompare(a.month))[0] || null;
}

function loadIncomeToInputs(month) {
  const income = getIncomeRecordForMonth(month);

  const luanaIsBiweekly = Boolean(income?.luanaIsBiweekly);
  const gabrielIsBiweekly = Boolean(income?.gabrielIsBiweekly);

  incomeLuanaBiweeklyCheckbox.checked = luanaIsBiweekly;
  incomeGabrielBiweeklyCheckbox.checked = gabrielIsBiweekly;
  incomeLuanaInput.value = income ? (luanaIsBiweekly ? income.luanaBiweeklyAmount ?? Math.round(((income.luana || 0) / BIWEEKLY_MONTHLY_FACTOR) * 100) / 100 : income.luana || 0) : 0;
  incomeGabrielInput.value = income ? (gabrielIsBiweekly ? income.gabrielBiweeklyAmount ?? Math.round(((income.gabriel || 0) / BIWEEKLY_MONTHLY_FACTOR) * 100) / 100 : income.gabriel || 0) : 0;
  updateIncomeBiweeklyPreviews();
}

// ===== Backup portátil dos dados =====
const BACKUP_FORMAT = 'controle-financeiro-backup';
const BACKUP_SCHEMA_VERSION = 1;
const BACKUP_DIRECTORY_DB = 'controle-financeiro-file-handles';
const BACKUP_DIRECTORY_STORE = 'handles';
const BACKUP_DIRECTORY_KEY = 'backup-directory';
const BACKUP_LAST_AT_KEY = 'controle_financeiro_last_backup_at';
const BACKUP_LAST_FILE_KEY = 'controle_financeiro_last_backup_file';
const BACKUP_PROMPTED_MONTH_KEY = 'controle_financeiro_backup_prompted_month';
const MAX_BACKUP_FILE_SIZE = 25 * 1024 * 1024;

const btnToggleBackup = document.getElementById('btn-toggle-backup');
const backupPanel = document.getElementById('backup-panel');
const btnCloseBackup = document.getElementById('btn-close-backup');
const btnChooseBackupFolder = document.getElementById('btn-choose-backup-folder');
const btnBackupNow = document.getElementById('btn-backup-now');
const btnRestoreBackup = document.getElementById('btn-restore-backup');
const backupFileInput = document.getElementById('backup-file-input');
const backupFolderStatus = document.getElementById('backup-folder-status');
const backupLastStatus = document.getElementById('backup-last-status');
let backupOperationInProgress = false;

function serializeBackupValue(value) {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  if (value instanceof Date) return { __firestoreType: 'timestamp', value: value.toISOString() };
  if (typeof value.toDate === 'function') return { __firestoreType: 'timestamp', value: value.toDate().toISOString() };
  if (Array.isArray(value)) return value.map(serializeBackupValue);

  return Object.entries(value).reduce((result, [key, item]) => {
    result[key] = serializeBackupValue(item);
    return result;
  }, {});
}

function deserializeBackupValue(value) {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  if (value.__firestoreType === 'timestamp' && typeof value.value === 'string') {
    const date = new Date(value.value);
    if (Number.isNaN(date.getTime())) throw new Error('O backup possui uma data inválida.');
    return firebase.firestore.Timestamp.fromDate(date);
  }
  if (Array.isArray(value)) return value.map(deserializeBackupValue);

  return Object.entries(value).reduce((result, [key, item]) => {
    result[key] = deserializeBackupValue(item);
    return result;
  }, {});
}

function getBackupStats(data) {
  const months = Object.values(data.months || {});
  return {
    months: months.length,
    planned: months.reduce((total, month) => total + (month.planned || []).length, 0),
    receipts: months.reduce((total, month) => total + (month.receipts || []).length, 0),
    annualEvents: (data.annualEvents || []).length,
    installmentPlans: (data.installmentPlans || []).length,
    cardStatements: (data.cardStatements || []).length,
    configurations: Object.keys(data.configurations || {}).length,
    userPreferences: (data.userPreferences || []).length,
    logs: (data.logs || []).length,
  };
}

function isValidBackupDocumentId(value) {
  return typeof value === 'string' && value.length > 0 && !value.includes('/');
}

function isBackupObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateBackupDataValue(value, path = 'dados', depth = 0) {
  if (depth > 40) throw new Error(`O backup possui uma estrutura profunda demais em ${path}.`);
  if (value === null || ['string', 'boolean'].includes(typeof value)) return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`O backup possui um número inválido em ${path}.`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateBackupDataValue(item, `${path}[${index}]`, depth + 1));
    return;
  }
  if (!isBackupObject(value)) throw new Error(`O backup possui um valor inválido em ${path}.`);

  for (const [key, item] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error(`O backup possui uma chave não permitida em ${path}.`);
    validateBackupDataValue(item, `${path}.${key}`, depth + 1);
  }

  if ('__firestoreType' in value) {
    if (value.__firestoreType !== 'timestamp' || typeof value.value !== 'string' || Number.isNaN(new Date(value.value).getTime())) {
      throw new Error(`O backup possui uma data inválida em ${path}.`);
    }
  }
}

function validateBackupDocumentList(documents, label) {
  if (!Array.isArray(documents)) throw new Error(`A lista de ${label} está inválida.`);
  if (documents.some((document) => !isValidBackupDocumentId(document?.id) || !isBackupObject(document.data))) {
    throw new Error(`O backup possui ${label} inválidos.`);
  }
}

function validateBackupPayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('O arquivo não contém um backup válido.');
  if (payload.format !== BACKUP_FORMAT) throw new Error('Este arquivo não pertence ao Controle Financeiro.');
  if (payload.schemaVersion !== BACKUP_SCHEMA_VERSION) throw new Error(`Versão de backup incompatível: ${payload.schemaVersion || 'desconhecida'}.`);
  if (payload.familyId !== FinanceAPI.familyId) throw new Error('O backup pertence a outra família e não pode ser restaurado aqui.');
  if (!payload.data || typeof payload.data !== 'object') throw new Error('O backup não possui dados para restaurar.');

  const { family = null, configurations = {}, annualEvents = [], installmentPlans = [], cardStatements = [], userPreferences = [], logs = [], months = {} } = payload.data;
  if ((family !== null && !isBackupObject(family)) || !isBackupObject(configurations) || !isBackupObject(months)) {
    throw new Error('A estrutura interna do backup está inválida.');
  }
  if (Object.keys(configurations).some((id) => !isValidBackupDocumentId(id))) throw new Error('O backup possui uma configuração com identificador inválido.');
  if (Object.values(configurations).some((configuration) => !isBackupObject(configuration))) throw new Error('O backup possui uma configuração inválida.');
  validateBackupDocumentList(annualEvents, 'eventos anuais');
  validateBackupDocumentList(installmentPlans, 'parcelamentos');
  validateBackupDocumentList(cardStatements, 'faturas de cartões');
  validateBackupDocumentList(userPreferences, 'preferências');
  validateBackupDocumentList(logs, 'registros de atividades');

  for (const [month, monthData] of Object.entries(months)) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !isBackupObject(monthData) || !isBackupObject(monthData.data)) {
      throw new Error(`Mês inválido encontrado no backup: ${month}.`);
    }
    validateBackupDocumentList(monthData.planned, `itens previstos do mês ${month}`);
    validateBackupDocumentList(monthData.receipts, `notas do mês ${month}`);
  }

  validateBackupDataValue(payload.data);

  return payload;
}

async function buildFullBackupPayload() {
  const rawData = await FinanceAPI.getFullBackupData();
  const payload = {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    familyId: FinanceAPI.familyId,
    referenceMonth: getCurrentMonth(),
    stats: getBackupStats(rawData),
    data: serializeBackupValue(rawData),
  };

  // Valida tambem o arquivo gerado pelo proprio app antes de grava-lo. Assim,
  // um campo incompatível ou uma estrutura incompleta nunca vira um backup
  // aparentemente valido que so falharia no momento da restauracao.
  return validateBackupPayload(payload);
}

function openBackupDirectoryDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error('Armazenamento de pasta indisponível.'));
    const request = indexedDB.open(BACKUP_DIRECTORY_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(BACKUP_DIRECTORY_STORE)) request.result.createObjectStore(BACKUP_DIRECTORY_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Não foi possível acessar a pasta salva.'));
  });
}

async function saveBackupDirectoryHandle(directoryHandle) {
  const database = await openBackupDirectoryDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(BACKUP_DIRECTORY_STORE, 'readwrite');
      transaction.objectStore(BACKUP_DIRECTORY_STORE).put(directoryHandle, BACKUP_DIRECTORY_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Não foi possível guardar a pasta.'));
    });
  } finally {
    database.close();
  }
}

async function getSavedBackupDirectoryHandle() {
  try {
    const database = await openBackupDirectoryDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(BACKUP_DIRECTORY_STORE, 'readonly');
        const request = transaction.objectStore(BACKUP_DIRECTORY_STORE).get(BACKUP_DIRECTORY_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('Não foi possível ler a pasta salva.'));
      });
    } finally {
      database.close();
    }
  } catch (error) {
    return null;
  }
}

async function hasBackupDirectoryPermission(directoryHandle, requestPermission = false) {
  if (!directoryHandle) return false;
  const options = { mode: 'readwrite' };
  try {
    if (typeof directoryHandle.queryPermission === 'function' && (await directoryHandle.queryPermission(options)) === 'granted') return true;
    return requestPermission && typeof directoryHandle.requestPermission === 'function' && (await directoryHandle.requestPermission(options)) === 'granted';
  } catch (error) {
    return false;
  }
}

async function chooseBackupDirectory() {
  if (typeof window.showDirectoryPicker !== 'function') {
    showToast('Neste dispositivo o backup será salvo pelo download normal.', 'info');
    return null;
  }

  try {
    const directoryHandle = await window.showDirectoryPicker({ id: 'cf-backups-desktop', mode: 'readwrite', startIn: 'desktop' });
    await saveBackupDirectoryHandle(directoryHandle);
    await updateBackupPanelStatus(directoryHandle);
    showToast(`Pasta "${directoryHandle.name}" salva para os próximos backups.`, 'success');
    return directoryHandle;
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.error('Erro ao escolher a pasta de backup:', error);
      showToast('Não foi possível salvar a pasta escolhida.', 'error');
    }
    return null;
  }
}

function triggerBackupDownload(contents, filename) {
  const blob = new Blob([contents], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function prepareBackupDestination({ askDirectoryIfMissing = true } = {}) {
  if (typeof window.showDirectoryPicker === 'function') {
    let directoryHandle = await getSavedBackupDirectoryHandle();
    if (directoryHandle && !(await hasBackupDirectoryPermission(directoryHandle, true))) directoryHandle = null;
    if (!directoryHandle && askDirectoryIfMissing) directoryHandle = await chooseBackupDirectory();

    if (directoryHandle) return { method: 'directory', directoryHandle };

    if (askDirectoryIfMissing) return null;
  }

  return { method: 'download', directoryHandle: null };
}

async function writeBackupFile(contents, filename, destination) {
  if (destination?.method === 'directory' && destination.directoryHandle) {
    const fileHandle = await destination.directoryHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(contents);
    } finally {
      await writable.close();
    }
    return { method: 'directory', directoryName: destination.directoryHandle.name, filename };
  }

  triggerBackupDownload(contents, filename);
  return { method: 'download', directoryName: null, filename };
}

function makeBackupFilename(prefix = 'controle-financeiro-backup') {
  const now = new Date();
  const date = getLocalDateString();
  if (prefix === 'controle-financeiro-backup') return `${prefix}-${date}.json`;
  const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  return `${prefix}-${date}-${time}.json`;
}

function formatBackupTimestamp(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

async function updateBackupPanelStatus(knownDirectoryHandle = undefined) {
  const directoryHandle = knownDirectoryHandle === undefined ? await getSavedBackupDirectoryHandle() : knownDirectoryHandle;
  if (backupFolderStatus) {
    if (directoryHandle) backupFolderStatus.textContent = `Pasta salva: ${directoryHandle.name}`;
    else if (typeof window.showDirectoryPicker === 'function') backupFolderStatus.textContent = 'A pasta será escolhida no primeiro backup.';
    else backupFolderStatus.textContent = 'Este dispositivo usará o download normal.';
  }

  const lastBackupAt = localStorage.getItem(BACKUP_LAST_AT_KEY);
  const lastBackupFile = localStorage.getItem(BACKUP_LAST_FILE_KEY);
  if (backupLastStatus) {
    backupLastStatus.textContent = lastBackupAt
      ? `Último backup: ${formatBackupTimestamp(lastBackupAt)}${lastBackupFile ? ` • ${lastBackupFile}` : ''}`
      : 'Nenhum backup registrado neste navegador.';
  }
}

async function exportFullBackup({ prefix = 'controle-financeiro-backup', askDirectoryIfMissing = true } = {}) {
  if (backupOperationInProgress) return null;
  backupOperationInProgress = true;
  const originalText = btnBackupNow?.textContent;
  if (btnBackupNow) {
    btnBackupNow.disabled = true;
    btnBackupNow.textContent = 'Preparando backup...';
  }

  try {
    // A pasta precisa ser solicitada ainda dentro do gesto do clique. Buscar todos
    // os dados antes pode fazer o navegador bloquear o seletor por segurança.
    const destination = await prepareBackupDestination({ askDirectoryIfMissing });
    if (!destination) return null;
    const payload = await buildFullBackupPayload();
    const filename = makeBackupFilename(prefix);
    const result = await writeBackupFile(JSON.stringify(payload, null, 2), filename, destination);

    localStorage.setItem(BACKUP_LAST_AT_KEY, payload.exportedAt);
    localStorage.setItem(BACKUP_LAST_FILE_KEY, filename);
    await updateBackupPanelStatus();
    const destinationLabel = result.method === 'directory' ? ` na pasta ${result.directoryName}` : '';
    showToast(`Backup completo salvo${destinationLabel}.`, 'success');
    return { payload, result };
  } catch (error) {
    console.error('Erro ao gerar backup:', error);
    showToast('Não foi possível gerar o backup completo.', 'error');
    return null;
  } finally {
    backupOperationInProgress = false;
    if (btnBackupNow) {
      btnBackupNow.disabled = false;
      btnBackupNow.textContent = originalText || 'Salvar backup completo';
    }
  }
}

function showRestoreModeDialog(payload) {
  return new Promise((resolve) => {
    const stats = getBackupStats(payload.data);
    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';
    overlay.innerHTML = `
      <div class="custom-modal backup-restore-modal">
        <h3>Restaurar backup</h3>
        <p class="backup-restore-summary"></p>
        <div class="backup-restore-options">
          <button type="button" class="backup-restore-option" data-mode="merge">
            <strong>Mesclar dados</strong>
            <small>Atualiza os registros do backup e mantém dados extras que já estejam no Firebase.</small>
          </button>
          <button type="button" class="backup-restore-option is-danger" data-mode="replace">
            <strong>Substituir tudo</strong>
            <small>Remove os dados atuais e deixa o Firebase igual ao arquivo selecionado.</small>
          </button>
        </div>
        <div class="custom-modal-actions">
          <button type="button" class="custom-modal-btn cancel">Cancelar</button>
        </div>
      </div>
    `;
    overlay.querySelector('.backup-restore-summary').textContent =
      `Backup de ${formatBackupTimestamp(payload.exportedAt) || 'data desconhecida'}: ${stats.months} meses, ${stats.planned} itens previstos, ${stats.receipts} notas, ${stats.annualEvents} eventos anuais e ${stats.installmentPlans} parcelamentos.`;
    document.body.appendChild(overlay);
    void overlay.offsetWidth;
    overlay.classList.add('active');

    const close = (mode = null) => {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 200);
      resolve(mode);
    };

    overlay.querySelector('.cancel').addEventListener('click', () => close());
    overlay.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => close(button.dataset.mode)));
  });
}

async function restoreBackupFile(file) {
  if (!file) return;
  if (file.size > MAX_BACKUP_FILE_SIZE) {
    showToast('O arquivo é grande demais para ser um backup deste sistema.', 'error');
    return;
  }

  let payload;
  try {
    payload = validateBackupPayload(JSON.parse(await file.text()));
  } catch (error) {
    showToast(error.message || 'Não foi possível ler o arquivo de backup.', 'error');
    return;
  }

  const mode = await showRestoreModeDialog(payload);
  if (!mode) return;

  if (
    mode === 'replace' &&
    !(await showConfirm('ATENÇÃO: todos os dados atuais do Firebase serão substituídos pelos dados deste arquivo. Um backup de segurança será salvo antes. Deseja continuar?', true))
  ) {
    return;
  }

  const safetyBackup = await exportFullBackup({ prefix: 'controle-financeiro-backup-antes-restauracao', askDirectoryIfMissing: true });
  if (!safetyBackup) {
    showToast('Restauração cancelada porque o backup de segurança não foi salvo.', 'error');
    return;
  }

  backupOperationInProgress = true;
  const originalRestoreText = btnRestoreBackup?.textContent;
  if (btnRestoreBackup) {
    btnRestoreBackup.disabled = true;
    btnRestoreBackup.textContent = 'Restaurando...';
  }

  FinanceAPI.clearListeners();
  try {
    await FinanceAPI.restoreFullBackupData(deserializeBackupValue(payload.data), mode);
    syncData(getCurrentMonth());
    showToast(`Backup restaurado com sucesso no modo ${mode === 'replace' ? 'substituir' : 'mesclar'}.`, 'success');
  } catch (error) {
    console.error('Erro ao restaurar backup:', error);
    syncData(getCurrentMonth());
    showToast('A restauração falhou. O backup de segurança foi preservado.', 'error');
  } finally {
    backupOperationInProgress = false;
    if (btnRestoreBackup) {
      btnRestoreBackup.disabled = false;
      btnRestoreBackup.textContent = originalRestoreText || 'Restaurar um backup';
    }
  }
}

async function offerBackupAfterMonthCreation(month) {
  if (!month || localStorage.getItem(BACKUP_PROMPTED_MONTH_KEY) === month) return;
  localStorage.setItem(BACKUP_PROMPTED_MONTH_KEY, month);
  const confirmed = await showConfirm(`O mês ${month.split('-').reverse().join('/')} foi preparado. Deseja salvar agora um backup completo de todos os meses?`);
  if (!confirmed) return;
  if (backupPanel) backupPanel.hidden = false;
  await exportFullBackup({ askDirectoryIfMissing: true });
}

btnToggleBackup?.addEventListener('click', async () => {
  backupPanel.hidden = !backupPanel.hidden;
  if (!backupPanel.hidden) await updateBackupPanelStatus();
});

btnCloseBackup?.addEventListener('click', () => {
  backupPanel.hidden = true;
});

btnChooseBackupFolder?.addEventListener('click', async () => {
  await chooseBackupDirectory();
});

btnBackupNow?.addEventListener('click', async () => {
  await exportFullBackup({ askDirectoryIfMissing: true });
});

btnRestoreBackup?.addEventListener('click', () => {
  backupFileInput?.click();
});

backupFileInput?.addEventListener('change', async () => {
  const file = backupFileInput.files?.[0];
  try {
    await restoreBackupFile(file);
  } finally {
    backupFileInput.value = '';
  }
});

updateBackupPanelStatus();

btnLoadMonth.addEventListener('click', async () => {
  const targetMonth = getCurrentMonth();
  if (!targetMonth) return showToast('Selecione um mês primeiro.', 'error');

  const originalText = btnLoadMonth.textContent;
  let shouldOfferBackup = false;
  btnLoadMonth.textContent = 'Processando...';
  btnLoadMonth.disabled = true;

  try {
    // Confere diretamente no Firebase para evitar uma segunda clonagem caso o
    // listener da tela ainda não tenha terminado de carregar o mês.
    const targetItems = await FinanceAPI.getPlannedOnce(targetMonth);
    const hasItems = targetItems.length > 0;
    const [year, month] = targetMonth.split('-');
    const prevDate = new Date(year, parseInt(month) - 2, 1);
    const prevMonthStr = prevDate.getFullYear() + '-' + String(prevDate.getMonth() + 1).padStart(2, '0');
    let incomeWasCloned = false;

    // O marcador usado pelo backup cria o documento do mês, mas não representa
    // uma renda cadastrada. Ao carregar um mês novo, persiste explicitamente a
    // última renda para que o resumo e o formulário não apareçam zerados.
    const targetIncome = await FinanceAPI.getIncomeOnce(targetMonth);
    const previousIncome = (await FinanceAPI.getIncomeOnce(prevMonthStr)) || getIncomeRecordForMonth(targetMonth);
    if (!targetIncome && previousIncome) {
      const conversionData = {
        luanaIsBiweekly: Boolean(previousIncome.luanaIsBiweekly),
        gabrielIsBiweekly: Boolean(previousIncome.gabrielIsBiweekly),
        luanaBiweeklyAmount: previousIncome.luanaBiweeklyAmount ?? null,
        gabrielBiweeklyAmount: previousIncome.gabrielBiweeklyAmount ?? null,
      };
      await FinanceAPI.saveIncome(targetMonth, previousIncome.luana || 0, previousIncome.gabriel || 0, conversionData);
      const incomeIndex = incomes.findIndex((income) => income.month === targetMonth);
      const clonedIncome = { month: targetMonth, luana: previousIncome.luana || 0, gabriel: previousIncome.gabriel || 0, ...conversionData };
      if (incomeIndex >= 0) incomes[incomeIndex] = clonedIncome;
      else incomes.push(clonedIncome);
      incomeWasCloned = true;
      shouldOfferBackup = true;
    }

    if (!hasItems) {
      await FinanceAPI.ensureMonth(targetMonth);

      const prevItems = await FinanceAPI.getPlannedOnce(prevMonthStr);
      const fixedItemsToClone = prevItems.filter((p) => p.fixed);
      let clonedItemsCount = 0;

      for (const item of fixedItemsToClone) {
        let sourceItem = item;
        let installmentPlan = null;
        let installmentEntry = null;

        if (item.installmentPlanId && item.installmentAutomationMode === 'fixed-static-clone') {
          installmentPlan = getInstallmentPlan(item.installmentPlanId) || (await FinanceAPI.getInstallmentPlan(item.installmentPlanId));
          const nextNumber = Number(item.installmentNumber || 0) + 1;
          installmentEntry = installmentPlan?.installments?.find((entry) => entry.number === nextNumber) || null;

          if (!installmentPlan || installmentPlan.status === 'cancelled' || nextNumber > Number(item.installmentCount || installmentPlan.installmentCount) || !installmentEntry) {
            continue;
          }
          if (installmentEntry.status === 'cancelled' || installmentEntry.targetDate?.substring(0, 7) !== targetMonth) continue;

          if (installmentPlan.mode === 'rent_to_own' && installmentEntry.type === 'buyout') {
            const paidRentalCredit = (installmentPlan.installments || [])
              .filter((entry) => entry.type === 'rental' && entry.status === 'paid')
              .reduce((total, entry) => total + Math.abs(Number(entry.paidAmount ?? entry.amount) || 0), 0);
            const actualBuyoutAmount = Math.max(0, Math.round((Math.abs(Number(installmentPlan.assetPrice || installmentPlan.principalAmount) || 0) - paidRentalCredit) * 100) / 100);
            if (actualBuyoutAmount <= 0) {
              await FinanceAPI.saveInstallmentPlan({
                ...installmentPlan,
                status: 'completed',
                installments: installmentPlan.installments.map((entry) =>
                  entry.number === nextNumber ? { ...entry, amount: 0, status: 'paid', paidAmount: 0, paidAt: `${targetMonth}-01` } : entry,
                ),
                completedAt: `${targetMonth}-01`,
                updatedAt: new Date().toISOString(),
              });
              continue;
            }
            installmentEntry = { ...installmentEntry, amount: installmentPlan.isIncome ? -actualBuyoutAmount : actualBuyoutAmount };
            installmentPlan = {
              ...installmentPlan,
              projectedBuyoutAmount: actualBuyoutAmount,
              totalAmount: (installmentPlan.installments || []).reduce(
                (total, entry) => total + (entry.number === nextNumber ? installmentEntry.amount : Number(entry.amount) || 0),
                0,
              ),
              installments: installmentPlan.installments.map((entry) => (entry.number === nextNumber ? installmentEntry : entry)),
            };
          }

          const installmentCount = Number(item.installmentCount || installmentPlan.installmentCount);
          const stageLabel = getInstallmentStageLabel(installmentEntry, installmentPlan);
          sourceItem = {
            ...item,
            description: installmentPlan.mode === 'rent_to_own'
              ? `${item.installmentOriginalName || installmentPlan.name || item.description} • ${stageLabel}`
              : `${item.installmentOriginalName || installmentPlan.name || item.description} (${nextNumber}/${installmentCount})`,
            amount: installmentEntry.amount,
            installmentNumber: nextNumber,
            installmentCount,
            installmentStage: installmentEntry.type || null,
            rentalNumber: installmentEntry.rentalNumber || null,
            rentalCount: installmentEntry.rentalCount || installmentPlan.rentalMonths || null,
            staticSyncId: `installment_${item.installmentPlanId}_${nextNumber}`,
          };
          if (sourceItem.isBiweeklyConverted) sourceItem.biweeklyMonthlyAmount = installmentEntry.amount;
          if (installmentPlan.paymentFrequency === 'biweekly' && installmentEntry.type !== 'buyout') {
            sourceItem.isBiweeklyConverted = true;
            sourceItem.biweeklyAmount = installmentPlan.paymentAmount;
            sourceItem.biweeklyMonthlyAmount = installmentEntry.amount;
          } else if (installmentEntry.type === 'buyout') {
            delete sourceItem.isBiweeklyConverted;
            delete sourceItem.biweeklyAmount;
            delete sourceItem.biweeklyMonthlyAmount;
          }
        }

        // Itens estáticos antigos podem não possuir o identificador de sincronização.
        // Ao clonar, cria um vínculo estável para manter Orçamento e Nota conectados.
        if (sourceItem.isStatic && !sourceItem.staticSyncId) {
          sourceItem = {
            ...sourceItem,
            staticSyncId: `sync_${sourceItem.id || `${prevMonthStr}_${Date.now()}`}`,
          };
        }

        let newDate = '';

        if (installmentEntry?.targetDate) {
          const installmentDay = installmentEntry.targetDate.split('-')[2] || '01';
          newDate = `${targetMonth}-${installmentDay}`;
        } else if (sourceItem.date) {
          const oldDateParts = sourceItem.date.split('-');
          const day = oldDateParts.length === 3 ? oldDateParts[2] : '01';
          newDate = `${targetMonth}-${day}`;
        } else if (sourceItem.isStatic) {
          newDate = `${targetMonth}-01`;
        }

        const newItem = { ...sourceItem, month: targetMonth, date: newDate };
        delete newItem.id;
        const plannedId = await FinanceAPI.savePlanned(targetMonth, newItem);
        clonedItemsCount += 1;

        if (sourceItem.isStatic) {
          const receiptData = {
            date: newDate,
            category: sourceItem.category,
            merchant: sourceItem.description,
            amount: sourceItem.amount,
            owner: sourceItem.owner,
            paymentMethodId: sourceItem.paymentMethodId || 'dinheiro',
            observation: sourceItem.observation || '',
            isStatic: true,
            staticSyncId: newItem.staticSyncId,
            linkedPlannedId: plannedId,
          };
          if (sourceItem.isBiweeklyConverted) {
            receiptData.isBiweeklyConverted = true;
            receiptData.biweeklyAmount = sourceItem.biweeklyAmount;
            receiptData.biweeklyMonthlyAmount = sourceItem.biweeklyMonthlyAmount ?? sourceItem.amount;
          }
          if (sourceItem.installmentPlanId) {
            receiptData.installmentPlanId = sourceItem.installmentPlanId;
            receiptData.installmentNumber = sourceItem.installmentNumber;
            receiptData.installmentCount = sourceItem.installmentCount;
            receiptData.installmentMode = sourceItem.installmentMode;
            receiptData.installmentStage = sourceItem.installmentStage || null;
            receiptData.rentalNumber = sourceItem.rentalNumber || null;
            receiptData.rentalCount = sourceItem.rentalCount || null;
            receiptData.installmentOriginalName = sourceItem.installmentOriginalName;
            receiptData.installmentAutomationMode = sourceItem.installmentAutomationMode;
          }
          Object.keys(receiptData).forEach((key) => {
            if (receiptData[key] === undefined) delete receiptData[key];
          });
          let receiptId;
          try {
            receiptId = await FinanceAPI.saveReceipt(targetMonth, receiptData);
          } catch (error) {
            // Evita deixar um item solto no Orçamento quando a Nota correspondente falhar.
            await FinanceAPI.deletePlanned(targetMonth, plannedId);
            throw error;
          }

          if (installmentPlan && installmentEntry) {
            const updatedInstallments = installmentPlan.installments.map((entry) =>
              entry.number === sourceItem.installmentNumber
                ? {
                    ...entry,
                    status: 'paid',
                    plannedId,
                    plannedMonth: targetMonth,
                    receiptId,
                    receiptMonth: targetMonth,
                    paidAmount: sourceItem.amount,
                    paidAt: newDate,
                  }
                : entry,
            );
            const isCompleted = sourceItem.installmentNumber >= sourceItem.installmentCount;
            await FinanceAPI.saveInstallmentPlan({
              ...installmentPlan,
              status: isCompleted ? 'completed' : 'active',
              totalAmount: updatedInstallments.reduce((total, entry) => total + (Number(entry.amount) || 0), 0),
              installments: updatedInstallments,
              updatedAt: new Date().toISOString(),
              completedAt: isCompleted ? newDate : installmentPlan.completedAt || null,
            });
          }
        }
      }

      if (clonedItemsCount > 0) {
        showToast(`${clonedItemsCount} contas fixas copiadas de ${prevMonthStr}!`, 'success');
      } else {
        showToast(`Nenhuma conta fixa pendente encontrada em ${prevMonthStr}.`, 'info');
      }
      shouldOfferBackup = true;
    } else {
      showToast(
        incomeWasCloned
          ? `Renda copiada de ${prevMonthStr}. As contas não foram copiadas novamente porque este mês já possui itens.`
          : 'Este mês já possui itens. A cópia automática só funciona em meses vazios.',
        incomeWasCloned ? 'success' : 'error',
      );
    }

    loadIncomeToInputs(targetMonth);
  } catch (error) {
    console.error('Erro ao clonar:', error);
    showToast('Erro ao carregar mês.', 'error');
  } finally {
    btnLoadMonth.textContent = originalText;
    btnLoadMonth.disabled = false;
  }

  if (shouldOfferBackup) await offerBackupAfterMonthCreation(targetMonth);
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
  const income = getIncomeRecordForMonth(month);
  return income ? (income.luana || 0) + (income.gabriel || 0) : 0;
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
  if (companies.length > 0) {
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

  const itemData = { ...(oldItem || {}), date, category, description, amount, owner, paymentMethodId, fixed, isStatic, month };
  if (isBiweeklyConverted) {
    itemData.isBiweeklyConverted = true;
    itemData.biweeklyAmount = sourceAmount;
  }
  if (isStatic) itemData.staticSyncId = syncId;
  if (editingPlannedId !== null) itemData.id = editingPlannedId;

  await FinanceAPI.savePlanned(month, itemData);
  if (itemData.installmentPlanId) {
    await updateInstallmentPlanEntry(itemData.installmentPlanId, itemData.installmentNumber, {
      amount,
      targetDate: date,
      plannedMonth: month,
    });
  }
  logActivity(editingPlannedId ? 'Editou' : 'Adicionou', `Previsto: ${description} - ${formatCurrency(amount)}`);

  if (editingPlannedId === null) {
    if (isStatic) {
      const receiptData = { date: date, category, merchant: description, amount, owner, paymentMethodId, isStatic: true, staticSyncId: syncId };
      if (isBiweeklyConverted) {
        receiptData.isBiweeklyConverted = true;
        receiptData.biweeklyAmount = sourceAmount;
        receiptData.biweeklyMonthlyAmount = amount;
      }
      const receiptId = await FinanceAPI.saveReceipt(month, receiptData);
      await reconcileClosedStatementsForReceiptChange(null, { ...receiptData, id: receiptId });
    }
  } else if (oldItem) {
    const linkedReceipt = receipts.find((r) => {
      if (r.staticSyncId && oldItem.staticSyncId) return r.staticSyncId === oldItem.staticSyncId;
      return r.date.startsWith(month) && r.category === oldItem.category && r.merchant === oldItem.description && r.owner === oldItem.owner && r.amount === oldItem.amount && r.isStatic;
    });

    if (linkedReceipt) {
      if (isStatic) {
        const updatedReceipt = {
          ...linkedReceipt,
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
        await reconcileClosedStatementsForReceiptChange(linkedReceipt, updatedReceipt);
      } else {
        await FinanceAPI.deleteReceipt(month, linkedReceipt.id);
        await reconcileClosedStatementsForReceiptChange(linkedReceipt, null);
      }
    } else if (isStatic) {
      const receiptData = { date: date, category, merchant: description, amount, owner, paymentMethodId, isStatic: true, staticSyncId: syncId };
      if (isBiweeklyConverted) {
        receiptData.isBiweeklyConverted = true;
        receiptData.biweeklyAmount = sourceAmount;
        receiptData.biweeklyMonthlyAmount = amount;
      }
      const receiptId = await FinanceAPI.saveReceipt(month, receiptData);
      await reconcileClosedStatementsForReceiptChange(null, { ...receiptData, id: receiptId });
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

function renderInstallmentItemBadge(item) {
  if (!item?.installmentPlanId) return '';
  if (item.installmentMode === 'rent_to_own') {
    const label = getInstallmentStageLabel(item);
    return `<span class="installment-item-badge installment-rental-badge" title="Pagamento vinculado ao aluguel com opção de compra">${label}</span>`;
  }
  const number = Number(item.installmentNumber) || 0;
  const count = Number(item.installmentCount) || 0;
  return `<span class="installment-item-badge" title="Parcela vinculada ao controle de pagamentos">Parcela ${number}/${count}</span>`;
}

function renderInstallmentCategoryBadge(items) {
  const installmentItems = Array.from(items || []).filter((item) => item?.installmentPlanId);
  if (installmentItems.length === 0) return '';
  if (installmentItems.some((item) => item.installmentMode === 'rent_to_own')) {
    return '<span class="installment-item-badge installment-category-badge installment-rental-badge" title="Esta categoria contém aluguel com opção de compra">Aluguel → compra</span>';
  }
  return '<span class="installment-item-badge installment-category-badge" title="Esta categoria contém um parcelamento ativo">Parcelamento</span>';
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
  if (p.installmentPlanId && !receipts.some((receipt) => receipt.linkedPlannedId === id)) {
    await updateInstallmentPlanEntry(p.installmentPlanId, p.installmentNumber, {
      status: 'cancelled',
      plannedId: null,
      plannedMonth: null,
    });
  }
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
  await reconcileClosedStatementsForReceiptChange(r, null);
  if (r.installmentPlanId) {
    await updateInstallmentPlanEntry(r.installmentPlanId, r.installmentNumber, {
      status: 'budgeted',
      receiptId: null,
      receiptMonth: null,
      paidAmount: null,
      paidAt: null,
    });
  }
  logActivity('Excluiu', `Real/Nota: ${r.merchant} - ${formatCurrency(Math.abs(r.amount))}`);

  if (r.isStatic) {
    const plannedToDelete = plannedItems.find((p) => {
      if (p.staticSyncId && r.staticSyncId) return p.staticSyncId === r.staticSyncId;
      return p.month === month && p.category === r.category && p.description === r.merchant && p.owner === r.owner && p.amount === r.amount && p.isStatic;
    });
    if (plannedToDelete) {
      await FinanceAPI.deletePlanned(month, plannedToDelete.id);
      if (r.installmentPlanId) {
        await updateInstallmentPlanEntry(r.installmentPlanId, r.installmentNumber, {
          status: 'cancelled',
          plannedId: null,
          plannedMonth: null,
          receiptId: null,
          receiptMonth: null,
          paidAmount: null,
          paidAt: null,
        });
      }
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
      const installmentCategoryBadge = renderInstallmentCategoryBadge(groupItems);
      const reimbursementCategoryBadge = renderFinancialFlowBadges({
        hasActualIncome: false,
        hasReimbursement: groupItems.some((plannedItem) => getPlannedItemReimbursements(plannedItem, month).length > 0),
      });
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
      <span style="color: #f5f5f5; display: flex; align-items: center;"><span class="toggle-icon">${isOpen ? '▼' : '▶'}</span> ${cat}${catBadge}${installmentCategoryBadge}${reimbursementCategoryBadge}</span>
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
          const installmentBadge = renderInstallmentItemBadge(p);
          const reimbursementLinks = getPlannedItemReimbursements(p, month).map((reimbursement) => renderReimbursementLink(reimbursement, { compact: true })).join('');

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
            <div class="receipt-line">${p.description}${annualBadge}${incomeBadge}${biweeklyBadge}${installmentBadge}</div>
            ${obsHtml}
            ${reimbursementLinks}
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
const actualPostedDateInput = document.getElementById('actual-posted-date');
const actualPostedDateField = document.getElementById('actual-posted-date-field');
const receiptsList = document.getElementById('receipts-list');

let editingReceiptId = null;

function updateActualPostedDateVisibility() {
  if (!actualPostedDateField) return;
  const paymentId = document.getElementById('actual-payment')?.value;
  const isCreditCard = paymentMethods.some((method) => method.id === paymentId && method.type === 'credito');
  actualPostedDateField.hidden = !isCreditCard;
  if (!isCreditCard && !editingReceiptId && actualPostedDateInput) actualPostedDateInput.value = '';
}

document.getElementById('actual-payment')?.addEventListener('change', updateActualPostedDateVisibility);

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
  const postedDate = actualPostedDateInput?.value || '';

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
  const installmentSource = launchedPlannedItem || oldReceipt;

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

  if (postedDate) itemData.postedDate = postedDate;
  if (oldReceipt?.cardStatementDueMonth && oldReceipt.paymentMethodId === paymentMethodId) {
    itemData.cardStatementDueMonth = oldReceipt.cardStatementDueMonth;
  }

  if (biweeklySource?.isBiweeklyConverted) {
    itemData.isBiweeklyConverted = true;
    itemData.biweeklyAmount = biweeklySource.biweeklyAmount;
    itemData.biweeklyMonthlyAmount = biweeklySource.biweeklyMonthlyAmount ?? biweeklySource.amount;
  }

  if (installmentSource?.installmentPlanId) {
    itemData.installmentPlanId = installmentSource.installmentPlanId;
    itemData.installmentNumber = installmentSource.installmentNumber;
    itemData.installmentCount = installmentSource.installmentCount;
    itemData.installmentMode = installmentSource.installmentMode;
    itemData.installmentStage = installmentSource.installmentStage || null;
    itemData.rentalNumber = installmentSource.rentalNumber || null;
    itemData.rentalCount = installmentSource.rentalCount || null;
  }

  if (oldReceipt && oldReceipt.staticSyncId) {
    itemData.staticSyncId = oldReceipt.staticSyncId;
  }

  if (oldReceipt && oldReceipt.linkedPlannedId) {
    itemData.linkedPlannedId = oldReceipt.linkedPlannedId;
  }

  if (oldReceipt && oldReceipt.reimbursementSourceReceiptId) {
    itemData.reimbursementSourceReceiptId = oldReceipt.reimbursementSourceReceiptId;
  }

  // Se o lançamento veio pelo botão +, salva o vínculo forte
  if (window.currentLaunchPlannedId) {
    itemData.linkedPlannedId = window.currentLaunchPlannedId;
    window.currentLaunchPlannedId = null; // Limpa a variável após usar
  }

  if (editingReceiptId !== null) itemData.id = editingReceiptId;

  const savedReceiptId = await FinanceAPI.saveReceipt(month, itemData);
  await reconcileClosedStatementsForReceiptChange(oldReceipt, { ...itemData, id: savedReceiptId });
  if (itemData.installmentPlanId) {
    await updateInstallmentPlanEntry(itemData.installmentPlanId, itemData.installmentNumber, {
      status: 'paid',
      receiptId: savedReceiptId,
      receiptMonth: month,
      paidAmount: finalAmount,
      paidAt: date,
    });
  }
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
  if (actualPostedDateInput) actualPostedDateInput.value = '';

  const isIncomeCheck = document.getElementById('actual-is-income');
  if (isIncomeCheck) isIncomeCheck.checked = false;

  // Garante que o vínculo não vaze para lançamentos manuais
  window.currentLaunchPlannedId = null;

  const selectedMonth = getCurrentMonth();
  const today = getLocalDateString();
  actualDateInput.value = today.startsWith(selectedMonth) ? today : `${selectedMonth}-01`;

  updateReceiptChips();
  updateActualPostedDateVisibility();
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
  if (actualPostedDateInput) actualPostedDateInput.value = r.postedDate || '';
  updateActualPostedDateVisibility();

  if (getCategories().includes(r.category)) {
    selectedReceiptType = r.category;
    updateReceiptChips();
  }

  actualSubmitBtn.textContent = 'Salvar alterações';
}

function findReimbursementSource(reimbursement, pool = receipts) {
  if (!reimbursement?.isReimbursement) return null;

  if (reimbursement.reimbursementSourceReceiptId) {
    const linked = pool.find((receipt) => receipt.id === reimbursement.reimbursementSourceReceiptId && !receipt.isReimbursement);
    if (linked) return linked;
  }

  return (
    pool
      .filter(
        (receipt) =>
          !receipt.isReimbursement &&
          receipt.amount > 0 &&
          receipt.category === reimbursement.category &&
          receipt.merchant === reimbursement.merchant &&
          receipt.owner === reimbursement.owner &&
          (!reimbursement.date || !receipt.date || receipt.date <= reimbursement.date),
      )
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0] || null
  );
}

function getPlannedItemReimbursements(plannedItem, month) {
  return receipts
    .filter((receipt) => receipt.isReimbursement && receipt.date?.startsWith(month))
    .filter((reimbursement) => {
      const source = findReimbursementSource(reimbursement);
      if (source?.linkedPlannedId) return source.linkedPlannedId === plannedItem.id;
      return reimbursement.category === plannedItem.category && reimbursement.merchant === plannedItem.description && reimbursement.owner === plannedItem.owner;
    })
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

function renderReimbursementLink(reimbursement, options = {}) {
  const paymentName = getPaymentName(reimbursement.paymentMethodId);
  const dateText = reimbursement.date ? reimbursement.date.split('-').reverse().join('/').substring(0, 5) : '';
  const observation = options.showObservation && reimbursement.observation ? `<small>${escapeCardDetail(reimbursement.observation)}</small>` : '';

  return `<div class="reimbursement-link ${options.compact ? 'is-compact' : ''}">
    <span class="reimbursement-link-arrow" aria-hidden="true">↳</span>
    <span class="reimbursement-link-copy"><strong>Reembolso</strong><span>Caiu em ${escapeCardDetail(paymentName)}${dateText ? ` · ${dateText}` : ''}</span>${observation}</span>
    <b>+ ${formatCurrency(Math.abs(reimbursement.amount))}</b>
  </div>`;
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

      const orderedGroupItems = [];
      const attachedReimbursementIds = new Set();
      groupItems
        .filter((receipt) => !receipt.isReimbursement)
        .forEach((receipt) => {
          orderedGroupItems.push(receipt);
          groupItems
            .filter((candidate) => candidate.isReimbursement && findReimbursementSource(candidate, groupItems)?.id === receipt.id)
            .forEach((reimbursement) => {
              orderedGroupItems.push(reimbursement);
              attachedReimbursementIds.add(reimbursement.id);
            });
        });
      groupItems
        .filter((receipt) => receipt.isReimbursement && !attachedReimbursementIds.has(receipt.id))
        .forEach((reimbursement) => orderedGroupItems.push(reimbursement));
      groupItems.splice(0, groupItems.length, ...orderedGroupItems);

      const isOpen = isSearching || openReceiptCats.has(cat);
      const catTotal = groupItems.reduce((acc, curr) => acc + curr.amount, 0);
      const flowBadges = renderFinancialFlowBadges({
        hasActualIncome: groupItems.some((receipt) => receipt.amount < 0 && !receipt.isReimbursement),
        hasReimbursement: groupItems.some((receipt) => receipt.isReimbursement),
      });
      const eventBadge = groupItems.some((receipt) => isReceiptFromEvent(receipt)) ? renderFinancialEventBadge() : '';
      const installmentCategoryBadge = renderInstallmentCategoryBadge(groupItems);

      const headerDiv = document.createElement('div');
      headerDiv.className = 'group-header-div';

      const isCatIncome = catTotal < 0;
      // Aplica a condicional do grupo para filtrar a visualização se for o grupo Salário
      const displayedCatTotal = isCatIncome ? `+ ${formatCurrency(Math.abs(catTotal), cat.toLowerCase() === 'salário')}` : formatCurrency(catTotal, cat.toLowerCase() === 'salário');

      headerDiv.innerHTML = `
      <span class="receipt-group-title" style="color: #f5f5f5;"><span class="toggle-icon">${isOpen ? '▼' : '▶'}</span> ${cat}${eventBadge}${installmentCategoryBadge}${flowBadges}</span>
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
          if (r.isReimbursement) item.classList.add('receipt-item--reimbursement');

          const obsHtml = r.observation ? `<div style="font-size: 0.75rem; color: #a6a6c0; margin-top: 2px;">↳ ${r.observation}</div>` : '';
          const payStr = r.isReimbursement ? ` <span class="reimbursement-payment-meta">↳ Caiu em ${getPaymentName(r.paymentMethodId)}</span>` : ` • ${getPaymentName(r.paymentMethodId)}`;

          const isIncomeOrReimb = r.isReimbursement || r.amount < 0;
          const amountColor = isIncomeOrReimb ? '#62c462' : '#ff7b7b';
          // Repassa a validação da categoria atual do laço
          const displayAmount = isIncomeOrReimb ? `+ ${formatCurrency(Math.abs(r.amount), cat.toLowerCase() === 'salário')}` : `- ${formatCurrency(Math.abs(r.amount), cat.toLowerCase() === 'salário')}`;
          const flowBadge = renderFinancialFlowBadges({
            hasActualIncome: r.amount < 0 && !r.isReimbursement,
            hasReimbursement: false,
          });
          const eventBadge = isReceiptFromEvent(r) ? renderFinancialEventBadge() : '';
          const biweeklyBadge = renderReceiptBiweeklyBadge(r);
          const installmentBadge = renderInstallmentItemBadge(r);
          const editActionHtml = isReceiptEditLockedByBudget(r)
            ? `<button class="action-btn" onclick="showLockedReceiptMessage()" title="Este lançamento é fixo e estático">🔒 Orçamento</button>`
            : `<button class="action-btn" onclick="startEditReceipt('${r.id}')">Editar</button>`;

          const btnReembolsoHtml = !isIncomeOrReimb ? `<button class="action-btn" style="color: #62c462; border: 1px solid rgba(98, 196, 98, 0.3);" onclick="startReimbursement('${r.id}')" title="Reembolsar esta nota">🔄</button>` : '';

          item.innerHTML = `
          <div class="receipt-main">
            <div class="receipt-line">${r.isReimbursement ? '<span class="reimbursement-item-arrow" aria-hidden="true">↳</span><span class="reimbursement-item-label">Reembolso</span>' : ''}${r.merchant} • ${r.category}${biweeklyBadge}${installmentBadge}${eventBadge}${flowBadge}</div>
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
      // Notas estáticas já estão incluídas no Real automaticamente e pertencem
      // aos seus próprios itens previstos. Elas não podem quitar outro fixo não
      // estático da mesma categoria (ex.: CARRO não quita ESTACIONAMENTO).
      const actualAmount = receipts
        .filter(
          (receipt) =>
            receipt.date.startsWith(month) &&
            receipt.amount > 0 &&
            !receipt.isReimbursement &&
            !receipt.isStatic &&
            receipt.category === group.category,
        )
        .reduce((total, receipt) => total + receipt.amount, 0);
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
  const cardsDue = document.getElementById('summary-credit-cards-due');
  const hasPendingItems = pendingItems.length > 0;
  const cardInvoices = getCreditCardInvoicesForMonth(month);
  const hasCreditCards = cardInvoices.length > 0;
  const hasDetails = hasPendingItems || hasCreditCards;
  const cardInvoicesTotal = Math.round(cardInvoices.reduce((sum, invoice) => sum + invoice.total, 0) * 100) / 100;

  if (!summaryFreeProjectionToggle || !details || !freeCard || !arrow) return;

  if (!hasDetails) isFreeProjectionExpanded = false;

  summaryFreeProjectionToggle.classList.toggle('is-available', hasDetails);
  summaryFreeProjectionToggle.setAttribute('aria-disabled', String(!hasDetails));
  summaryFreeProjectionToggle.setAttribute('aria-expanded', String(hasDetails && isFreeProjectionExpanded));
  summaryFreeProjectionToggle.title = hasDetails ? 'Ver fixos pendentes e faturas de cartões' : 'Nenhum compromisso pendente';
  arrow.textContent = isFreeProjectionExpanded ? '▼' : '▶';
  if (afterFixed) {
    afterFixed.textContent = hasPendingItems ? `Após fixos: ${formatCurrency(projectedBalance)}` : '';
    afterFixed.classList.toggle('visible', hasPendingItems);
  }
  if (cardsDue) {
    cardsDue.textContent = hasCreditCards ? `Cartões a pagar: ${formatCurrency(cardInvoicesTotal)}` : '';
    cardsDue.classList.toggle('visible', hasCreditCards);
  }

  if (!hasDetails || !isFreeProjectionExpanded) {
    details.innerHTML = '';
    details.classList.remove('visible');
    freeCard.classList.remove('is-expanded');
    return;
  }

  const projectionEnd = hasPendingItems ? getPendingFixedProjectionEnd(month, pendingItems) : '';
  const fixedRows = [...pendingItems]
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

  const cardRows = cardInvoices
    .map((invoice) => {
      const payment = getCreditCardPaymentInfo(invoice);
      const dueLabel = payment.dueDate ? payment.dueDate.split('-').reverse().join('/') : '—';
      return `<tr>
        <td class="dash-fixed-name"><span>${escapeCardDetail(invoice.card.name)}</span><small>Vence em ${dueLabel} · já descontado nas compras</small></td>
        <td>${formatCurrency(invoice.total)}</td>
        <td>${formatCurrency(payment.paidAmount)}</td>
        <td><span class="credit-card-status ${payment.statusClass}">${payment.status}</span></td>
      </tr>`;
    })
    .join('');

  details.innerHTML = `
    ${
      hasPendingItems
        ? `<div class="dash-free-details-title">Fixos pendentes até ${formatShortDate(projectionEnd)}</div>
           <table class="dash-fixed-table"><thead><tr><th>Fixo</th><th>Prev.</th><th>Real</th><th>Diferença</th></tr></thead><tbody>${fixedRows}</tbody></table>`
        : ''
    }
    ${
      hasCreditCards
        ? `<div class="dash-free-details-title dash-card-invoices-title">Cartões a pagar no mês <small>Informativo: estes valores já reduziram o Livre nas compras.</small></div>
           <table class="dash-fixed-table dash-card-invoices-table"><thead><tr><th>Cartão</th><th>Fatura</th><th>Pago</th><th>Situação</th></tr></thead><tbody>${cardRows}</tbody></table>`
        : ''
    }
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
            incomes.push({ month: doc.id, ...data, luana: data.luana || 0, gabriel: data.gabriel || 0 });
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
            incomes.push({ month: doc.id, ...data, luana: data.luana || 0, gabriel: data.gabriel || 0 });
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
    if (!mapCat[p.category]) mapCat[p.category] = { planned: 0, actual: 0, items: new Map(), hasReimbursement: false, hasActualIncome: false, hasInstallment: false };
    mapCat[p.category].planned += p.amount;
    if (p.installmentPlanId) mapCat[p.category].hasInstallment = true;

    const key = makeKey(p.category, p.description, p.owner);
    if (!mapCat[p.category].items.has(key)) {
      mapCat[p.category].items.set(key, { name: p.description, planned: 0, actual: 0, obsList: [], owners: new Set(), maxDate: p.date || '', isAnnual: false, annualEventsData: [], hasReimbursement: false, hasActualIncome: false, isBiweeklyConverted: false, biweeklyAmount: 0, installmentPlanId: null, installmentNumber: null, installmentCount: null, installmentMode: null, installmentStage: null, rentalNumber: null, rentalCount: null });
    }
    const item = mapCat[p.category].items.get(key);
    item.planned += p.amount;
    if (p.isBiweeklyConverted) {
      item.isBiweeklyConverted = true;
      item.biweeklyAmount += p.biweeklyAmount ?? p.amount / BIWEEKLY_MONTHLY_FACTOR;
    }
    if (p.installmentPlanId) {
      item.installmentPlanId = p.installmentPlanId;
      item.installmentNumber = p.installmentNumber;
      item.installmentCount = p.installmentCount;
      item.installmentMode = p.installmentMode;
      item.installmentStage = p.installmentStage;
      item.rentalNumber = p.rentalNumber;
      item.rentalCount = p.rentalCount;
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
    if (!mapCat[r.category]) mapCat[r.category] = { planned: 0, actual: 0, items: new Map(), hasReimbursement: false, hasActualIncome: false, hasInstallment: false };
    mapCat[r.category].actual += r.amount;
    if (r.installmentPlanId) mapCat[r.category].hasInstallment = true;
    if (r.isReimbursement) mapCat[r.category].hasReimbursement = true;
    if (r.amount < 0 && !r.isReimbursement) mapCat[r.category].hasActualIncome = true;

    const key = makeKey(r.category, r.merchant, r.owner);
    if (!mapCat[r.category].items.has(key)) {
      mapCat[r.category].items.set(key, { name: r.merchant, planned: 0, actual: 0, obsList: [], owners: new Set(), maxDate: r.date || '', isAnnual: false, annualObs: new Set(), hasReimbursement: false, hasActualIncome: false, installmentPlanId: null, installmentNumber: null, installmentCount: null, installmentMode: null, installmentStage: null, rentalNumber: null, rentalCount: null });
    }
    const item = mapCat[r.category].items.get(key);
    item.actual += r.amount;
    if (r.isReimbursement) item.hasReimbursement = true;
    if (r.amount < 0 && !r.isReimbursement) item.hasActualIncome = true;
    if (r.installmentPlanId) {
      item.installmentPlanId = r.installmentPlanId;
      item.installmentNumber = r.installmentNumber;
      item.installmentCount = r.installmentCount;
      item.installmentMode = r.installmentMode;
      item.installmentStage = r.installmentStage;
      item.rentalNumber = r.rentalNumber;
      item.rentalCount = r.rentalCount;
    }
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
    const installmentCategoryBadge = data.hasInstallment ? renderInstallmentCategoryBadge(data.items.values()) : '';
    const isUnbudgetedExpense = data.planned === 0 && data.actual > 0;
    const isUnplannedCredit = data.planned === 0 && data.actual < 0 && (data.hasActualIncome || data.hasReimbursement);
    const catTitle = document.createElement('span');
    catTitle.className = 'dashboard-category-title';
    catTitle.style.display = 'flex';
    catTitle.style.alignItems = 'center';
    const catBadge = hasEvent ? ' <span style="background: rgba(253, 223, 123, 0.15); color: #fddf7b; padding: 2px 6px; border-radius: 6px; font-size: 0.65rem; border: 1px solid rgba(253, 223, 123, 0.3); margin-left: 6px;">Evento</span>' : '';
    const flowBadges = renderFinancialFlowBadges(data);
    catTitle.innerHTML = `<span class="toggle-icon">${isOpen ? '▼' : '▶'}</span> ${cat}${catBadge}${installmentCategoryBadge}${flowBadges}`;
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
        const itemInstallmentBadge = renderInstallmentItemBadge(item);

        const obsArray = item.obsList || [];
        let obsHtml = '';

        const isGenericObs = (text) => {
          const t = text.trim().toLowerCase();
          return t === 'sem observação' || t === '-' || t === '';
        };

        const hasGroupedTransactions = obsArray.some((o) => o.transactions && o.transactions.length > 1);

        const shouldRenderObs = item.hasReimbursement || obsArray.length > 1 || (obsArray.length === 1 && !isGenericObs(obsArray[0].text)) || hasGroupedTransactions;
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

          allTransactions.sort((a, b) => {
            if (a.isReimbursement !== b.isReimbursement) return a.isReimbursement ? 1 : -1;
            return (b.date || '').localeCompare(a.date || '');
          });

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
              if (t.amount < 0 && !t.isReimbursement) reimbBadge = ' <span style="color:#62c462; font-size:0.7rem; font-weight:bold;">(Entrada)</span>';

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
                <div class="dashboard-transaction-detail ${t.isReimbursement ? 'is-reimbursement' : ''}" style="margin-top: 8px; margin-bottom: 8px;">
                  <div class="dashboard-transaction-main" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 4px;">
                    <span class="dashboard-transaction-note" style="color: #c3c3d5; font-size: 0.8rem; line-height: 1.3;">${t.isReimbursement ? '<span class="reimbursement-item-arrow" aria-hidden="true">↳</span><span class="reimbursement-item-label">Reembolso</span>' : ''}${t.text}${reimbBadge}${txAnnualBadge}</span>
                    <span class="dashboard-transaction-amount" style="color: ${amountColor}; font-size: 0.75rem; font-weight: 600; white-space: nowrap; margin-left: 4px;">${displayAmount}</span>
                  </div>
                  <div class="dashboard-transaction-meta" style="font-size: 0.7rem; color: #8e8eab; margin-top: 3px; display: flex; flex-wrap: wrap; gap: 4px;">
                    <span>(${t.owner})</span>
                    <span>${t.isReimbursement ? 'Caiu em' : '•'} ${payStr}</span>
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
                  <span style="color: #f5f5f5;">${item.name}</span>${parentAnnualBadge}${itemFlowBadges}${itemBiweeklyBadge}${itemInstallmentBadge}
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
            <div style="color: #f5f5f5;">${item.name}${parentAnnualBadge}${itemFlowBadges}${itemBiweeklyBadge}${itemInstallmentBadge}</div>
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
const creditCardFilters = new Map();
const CREDIT_CARD_LIMIT_LOCKS_KEY = 'credit-card-limit-locks';
let creditCardLimitLocks = loadCreditCardLimitLocks();

function loadCreditCardLimitLocks() {
  try {
    const raw = localStorage.getItem(CREDIT_CARD_LIMIT_LOCKS_KEY);
    return raw ? JSON.parse(raw) || {} : {};
  } catch (error) {
    console.warn('Não foi possível carregar os cadeados dos limites dos cartões.', error);
    return {};
  }
}

function persistCreditCardLimitLocks() {
  try {
    localStorage.setItem(CREDIT_CARD_LIMIT_LOCKS_KEY, JSON.stringify(creditCardLimitLocks));
  } catch (error) {
    console.warn('Não foi possível salvar os cadeados dos limites dos cartões.', error);
  }
}

function isCreditCardLimitLocked(cardId) {
  return Boolean(creditCardLimitLocks?.[cardId]);
}

function setCreditCardLimitLocked(cardId, locked) {
  creditCardLimitLocks = { ...creditCardLimitLocks, [cardId]: Boolean(locked) };
  persistCreditCardLimitLocks();
}

function getCreditCardFilter(cardId) {
  if (!creditCardFilters.has(cardId)) {
    creditCardFilters.set(cardId, { search: '', sortType: 'date', sortOrder: 'desc' });
  }
  return creditCardFilters.get(cardId);
}

function filterAndSortCreditCardEntries(entries, filter) {
  const normalizedSearch = normalizeSearchText(filter.search);
  const includedIds = new Set();
  entries.forEach((entry) => {
    const searchable = [entry.merchant, entry.category, entry.observation, entry.owner, formatCurrency(entry.amount), entry.isReimbursement ? 'reembolso' : 'compra']
      .map(normalizeSearchText)
      .join(' ');
    if (!normalizedSearch || searchable.includes(normalizedSearch)) includedIds.add(entry.id);
  });

  if (normalizedSearch) {
    entries.forEach((entry) => {
      if (entry.isReimbursement && includedIds.has(entry.id)) {
        const source = findReimbursementSource(entry, entries);
        if (source) includedIds.add(source.id);
      } else if (!entry.isReimbursement && includedIds.has(entry.id)) {
        entries
          .filter((candidate) => candidate.isReimbursement && findReimbursementSource(candidate, entries)?.id === entry.id)
          .forEach((reimbursement) => includedIds.add(reimbursement.id));
      }
    });
  }

  return entries
    .filter((entry) => includedIds.has(entry.id))
    .sort((a, b) => {
      let valueA = a[filter.sortType] ?? '';
      let valueB = b[filter.sortType] ?? '';
      if (typeof valueA === 'string') valueA = normalizeSearchText(valueA);
      if (typeof valueB === 'string') valueB = normalizeSearchText(valueB);
      const comparison = valueA < valueB ? -1 : valueA > valueB ? 1 : 0;
      return filter.sortOrder === 'asc' ? comparison : -comparison;
    });
}

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

function shiftReferenceMonth(referenceMonth, offset) {
  const [year, month] = String(referenceMonth || '').split('-').map(Number);
  if (!year || !month) return referenceMonth;
  const shifted = new Date(year, month - 1 + offset, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
}

function formatReferenceMonthLabel(referenceMonth) {
  const [year, month] = String(referenceMonth || '').split('-').map(Number);
  if (!year || !month) return referenceMonth || '';
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
}

function getCreditCardInvoiceDueMonth(receiptDate, card) {
  return CardStatements.getDueMonthForDate(card, receiptDate);
}

function getCreditCardMonthState(card, referenceMonth) {
  return CardStatements.getCardMonthState(
    card,
    referenceMonth,
    receipts,
    creditCardStatements,
    getTodayISO(),
    Number(card.monthlyLimit) || 0,
  );
}

function getCreditCardInvoiceSnapshot(card, dueMonth) {
  const state = getCreditCardMonthState(card, dueMonth);
  return {
    card,
    dueMonth,
    entries: state.payableEntries,
    total: state.closedTotals.remaining,
    statement: state.payableStatement,
    state,
  };
}

function getCreditCardInvoiceDueDate(card, dueMonth) {
  const [year, month] = String(dueMonth || '').split('-').map(Number);
  if (!year || !month) return '';
  const lastDay = new Date(year, month, 0).getDate();
  const dueDay = Math.min(Math.max(Number(card?.due) || 1, 1), lastDay);
  return `${dueMonth}-${String(dueDay).padStart(2, '0')}`;
}

function getTodayISO() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function getCreditCardPaymentInfo(snapshot, paymentRecords = creditCardPayments) {
  const statement = snapshot.statement || findCardStatement(snapshot.card.id, snapshot.dueMonth);
  const totals = CardStatements.getStatementTotals(statement || { calculatedAmount: snapshot.total });
  const record = paymentRecords[snapshot.card.id] || null;
  const dueDate = getCreditCardInvoiceDueDate(snapshot.card, snapshot.dueMonth);
  const paidAmount = totals.paid;
  const remaining = totals.remaining;

  let status = 'Sem fatura';
  let statusClass = 'is-empty';
  if (totals.amount > 0.005) {
    if (remaining <= 0.005) {
      status = 'Paga';
      statusClass = 'is-paid';
    } else if (paidAmount > 0.005) {
      status = 'Paga parcialmente';
      statusClass = 'is-partial';
    } else {
      status = 'A pagar';
      statusClass = dueDate && getTodayISO() > dueDate ? 'is-overdue' : 'is-pending';
    }
  } else if (totals.credit > 0.005) {
    status = 'Crédito';
    statusClass = 'is-paid';
  }

  return { record, statement, dueDate, paidAmount, remaining, status, statusClass };
}

function getSuggestedCreditCardLimit(card, month) {
  const recurringItems = plannedItems.filter((item) => {
    const isAnnualEvent = Boolean(item.linkedAnnualId) || item.category === 'Eventos';
    const isInstallment = Boolean(item.installmentPlanId || item.installmentMode || item.installmentCount);
    return item.month === month && item.paymentMethodId === card.id && item.fixed && !isAnnualEvent && !isInstallment && Number(item.amount) > 0;
  });
  const plannedGross = recurringItems.reduce((sum, item) => sum + Number(item.amount), 0);
  const reimbursementIds = new Set();
  const reimbursementCredit = recurringItems.reduce((sum, item) => {
    const itemCredits = getPlannedItemReimbursements(item, month).filter(
      (reimbursement) => reimbursement.paymentMethodId === card.id && !reimbursementIds.has(reimbursement.id),
    );
    itemCredits.forEach((reimbursement) => reimbursementIds.add(reimbursement.id));
    return sum + itemCredits.reduce((creditSum, reimbursement) => creditSum + Math.abs(Number(reimbursement.amount) || 0), 0);
  }, 0);
  const value = Math.max(0, plannedGross - reimbursementCredit);

  return {
    value: Math.round(value * 100) / 100,
    plannedGross: Math.round(plannedGross * 100) / 100,
    reimbursementCredit: Math.round(reimbursementCredit * 100) / 100,
  };
}

function getCreditCardInvoicesForMonth(month) {
  return paymentMethods
    .filter((method) => method.type === 'credito')
    .map((card) => getCreditCardInvoiceSnapshot(card, month))
    .filter((invoice) => invoice.state.isClosed && (invoice.total > 0.005 || invoice.state.closedTotals.credit > 0.005));
}

function getCreditCardLimitState(percent) {
  if (percent > 100) return { className: 'is-over-limit', label: 'Limite ultrapassado' };
  if (percent > 75) return { className: 'is-near-limit', label: 'Atenção ao limite' };
  return { className: 'is-safe', label: 'Dentro do limite' };
}

function updateCreditCardsDashboardLegacy() {
  const month = getCurrentMonth();
  const container = document.getElementById('credit-cards-dashboard-list');
  const cardWrapper = document.getElementById('card-credit-cards');

  if (!container || !cardWrapper || !month) return;

  const creditCards = paymentMethods.filter((m) => m.type === 'credito');

  if (creditCards.length === 0) {
    cardWrapper.style.display = 'none';
    return;
  }

  const currentMonthReceipts = receipts.filter((receipt) => typeof receipt.date === 'string' && receipt.date.startsWith(month));
  const todayISO = getTodayISO();
  let html = '';

  creditCards.forEach((card) => {
    const previousMonth = shiftReferenceMonth(month, -1);
    const previousSnapshot = getCreditCardInvoiceSnapshot(card, previousMonth);
    const currentSnapshot = getCreditCardInvoiceSnapshot(card, month);
    const nextSnapshot = getCreditCardInvoiceSnapshot(card, shiftReferenceMonth(month, 1));
    const previousPaymentInfo = getCreditCardPaymentInfo(previousSnapshot, previousCreditCardPayments);
    const paymentInfo = getCreditCardPaymentInfo(currentSnapshot);
    const isExpanded = openCreditCardDetails.has(card.id);
    const cardFilter = getCreditCardFilter(card.id);
    const filteredNextEntries = filterAndSortCreditCardEntries(nextSnapshot.entries, cardFilter);
    const hasActiveCardSearch = Boolean(normalizeSearchText(cardFilter.search));
    const monthSpend = Math.max(
      0,
      Math.round(
        currentMonthReceipts.filter((receipt) => receipt.paymentMethodId === card.id).reduce((sum, receipt) => sum + (Number(receipt.amount) || 0), 0) * 100,
      ) / 100,
    );
    const suggestedLimitDetails = getSuggestedCreditCardLimit(card, month);
    const suggestedLimit = suggestedLimitDetails.value;
    const hasSuggestionCredit = suggestedLimitDetails.reimbursementCredit > 0.005;
    const suggestedLimitTitle = hasSuggestionCredit
      ? `Base recorrente ${formatCurrency(suggestedLimitDetails.plannedGross)} menos créditos e reembolsos de ${formatCurrency(suggestedLimitDetails.reimbursementCredit)} neste cartão.`
      : 'Soma somente dos itens fixos recorrentes vinculados a este cartão; eventos e parcelamentos ficam de fora.';
    const realCardLimit = Math.max(0, Number(card.monthlyLimit) || 0);
    const savedControlLimit = Math.max(0, Number(card.controlLimit) || 0);
    const controlLimit = savedControlLimit || suggestedLimit || realCardLimit;
    const limitPercent = controlLimit > 0 ? (monthSpend / controlLimit) * 100 : 0;
    const limitState = getCreditCardLimitState(limitPercent);
    const limitReferenceMax = Math.max(realCardLimit, suggestedLimit, controlLimit, monthSpend, 1);
    const controlLimitPosition = Math.min((controlLimit / limitReferenceMax) * 100, 100);
    const suggestedLimitPosition = Math.min((suggestedLimit / limitReferenceMax) * 100, 100);
    const dueMonthLabel = formatReferenceMonthLabel(month);
    const previousMonthLabel = formatReferenceMonthLabel(previousMonth);
    const nextMonthLabel = formatReferenceMonthLabel(nextSnapshot.dueMonth);
    const paymentDateLabel = paymentInfo.dueDate ? paymentInfo.dueDate.split('-').reverse().join('/') : 'data não informada';
    const nextPaymentDate = getCreditCardInvoiceDueDate(card, nextSnapshot.dueMonth);
    const nextPaymentDateLabel = nextPaymentDate ? nextPaymentDate.split('-').reverse().join('/') : nextMonthLabel;
    const previousPaymentDateLabel = (previousPaymentInfo.record?.date || previousPaymentInfo.dueDate || '').split('-').reverse().join('/');
    const renderRows = (entries, { showTimingStatus = false } = {}) => {
      const orderedEntries = [];
      const attachedReimbursementIds = new Set();
      entries
        .filter((entry) => !entry.isReimbursement)
        .forEach((entry) => {
          orderedEntries.push(entry);
          entries
            .filter((candidate) => candidate.isReimbursement && findReimbursementSource(candidate, entries)?.id === entry.id)
            .forEach((reimbursement) => {
              orderedEntries.push(reimbursement);
              attachedReimbursementIds.add(reimbursement.id);
            });
        });
      entries
        .filter((entry) => entry.isReimbursement && !attachedReimbursementIds.has(entry.id))
        .forEach((reimbursement) => orderedEntries.push(reimbursement));

      return orderedEntries
        .map((receipt) => {
          const isCredit = Number(receipt.amount) < 0 || receipt.isReimbursement;
          const reimbursementSource = receipt.isReimbursement ? findReimbursementSource(receipt, entries) : null;
          const isLinkedReimbursement = Boolean(reimbursementSource);
          const isPendingEntry = showTimingStatus && String(receipt.date || '') > todayISO;
          const timingBadge = showTimingStatus
            ? `<span class="credit-card-entry-timing ${isPendingEntry ? 'is-pending' : 'is-posted'}">${isPendingEntry ? 'Ainda vai bater' : 'Já lançado'}</span>`
            : '';
          const observation = receipt.observation ? `<div class="credit-card-detail-observation">↳ ${escapeCardDetail(receipt.observation)}</div>` : '';
          return `<div class="credit-card-detail-row ${isCredit ? 'is-credit' : ''} ${isLinkedReimbursement ? 'is-linked-reimbursement' : ''} ${isPendingEntry ? 'is-pending-entry' : 'is-posted-entry'}">
            <div class="credit-card-detail-main">
              <div class="credit-card-detail-name">${isLinkedReimbursement ? '<span class="credit-card-reimbursement-arrow" aria-hidden="true">↳</span>' : ''}<strong>${escapeCardDetail(receipt.merchant)}</strong><span class="credit-card-entry-badge">${isCredit ? 'Reembolso' : 'Compra'}</span>${timingBadge}</div>
              <span class="credit-card-detail-meta">${receipt.date.split('-').reverse().join('/')} · ${escapeCardDetail(receipt.category)}</span>
              ${observation}
            </div>
            <b>${formatCurrency(receipt.amount)}</b>
          </div>`;
        })
        .join('');
    };

    const previousPaymentLine =
      previousSnapshot.total > 0.005
        ? `<div class="credit-card-history-payment ${previousPaymentInfo.statusClass}">
            <span class="credit-card-history-icon" aria-hidden="true">${previousPaymentInfo.remaining <= 0.005 ? '✓' : '…'}</span>
            <div class="credit-card-history-copy">
              <strong>${previousPaymentInfo.remaining <= 0.005 ? 'Pagamento da fatura anterior' : 'Fatura anterior ainda em aberto'}</strong>
              <small>${previousMonthLabel}${previousPaymentDateLabel ? ` · ${previousPaymentDateLabel}` : ''} · apenas informativo</small>
            </div>
            <div class="credit-card-history-value">
              <b>${formatCurrency(previousPaymentInfo.paidAmount)}</b>
              <span>${previousPaymentInfo.status}</span>
            </div>
            <details class="credit-card-history-adjust">
              <summary>
                <span>Ajustar valor real pago</span>
                <small>Conferir com o banco</small>
              </summary>
              <form class="credit-card-payment-form is-history" data-card-id="${card.id}" data-due-month="${previousMonth}">
                <label>Valor pago no banco<input type="number" min="0" step="0.01" name="amount" value="${previousPaymentInfo.record ? previousPaymentInfo.paidAmount.toFixed(2) : previousSnapshot.total.toFixed(2)}" required></label>
                <label>Data do pagamento<input type="date" name="date" value="${previousPaymentInfo.record?.date || previousPaymentInfo.dueDate || ''}" required></label>
                <button type="submit" class="action-btn credit-card-payment-save">${previousPaymentInfo.record ? 'Salvar correção' : 'Confirmar valor real'}</button>
                ${previousPaymentInfo.record ? '<button type="button" class="action-btn credit-card-payment-auto">Voltar ao automático</button>' : ''}
              </form>
            </details>
          </div>`
        : '';

    const currentPaymentCopy = currentSnapshot.total <= 0.005
      ? 'Nenhum valor previsto para pagamento neste mês.'
      : paymentInfo.assumedPaid
        ? `Pagamento integral considerado em ${paymentDateLabel}.`
        : paymentInfo.record
          ? `Pagamento informado em ${(paymentInfo.record.date || '').split('-').reverse().join('/')}: ${formatCurrency(paymentInfo.paidAmount)}.`
          : `Sem ação necessária: o pagamento integral será considerado em ${paymentDateLabel}.`;
    const paymentStateValue = currentSnapshot.total <= 0.005
      ? 'Sem saldo'
      : paymentInfo.remaining > 0.005
        ? `Saldo ${formatCurrency(paymentInfo.remaining)}`
        : 'Conciliada';
    const paymentStateIcon = currentSnapshot.total <= 0.005
      ? '&mdash;'
      : paymentInfo.remaining > 0.005
        ? '&#9677;'
        : '&#10003;';

    html += `
      <div class="credit-card-card ${isExpanded ? 'is-expanded' : ''}">
        <div class="credit-card-summary" data-credit-card-id="${card.id}" role="button" tabindex="0" aria-expanded="${isExpanded}" title="${isExpanded ? 'Fechar detalhes da fatura' : 'Ver lançamentos e pagamento'}">
          <div class="credit-card-heading">
            <span class="toggle-icon credit-card-toggle-icon" aria-hidden="true">${isExpanded ? '&#9660;' : '&#9654;'}</span>
            <span class="credit-card-brand-icon">💳</span>
            <div><strong>${escapeCardDetail(card.name)}</strong><small>Fecha dia ${card.closing || '?'} · Vence dia ${card.due || '?'}</small></div>
          </div>
          <div class="credit-card-invoice"><small>Fatura a pagar em ${dueMonthLabel}</small><strong>${formatCurrency(currentSnapshot.total)}</strong><span class="credit-card-status ${paymentInfo.statusClass}">${paymentInfo.status}</span></div>
        </div>

        <div class="credit-card-limit-block ${limitState.className}">
          <div class="credit-card-limit-copy"><span>Uso no mês: <strong>${formatCurrency(monthSpend)}</strong></span><span>${controlLimit > 0 ? `${limitState.label} · ${Math.round(limitPercent * 10) / 10}% do controle` : 'Defina um limite para acompanhar'}</span></div>
          <div class="credit-card-limit-track"><span style="width:${Math.min(limitPercent, 100)}%"></span></div>
          <div class="credit-card-limit-meta"><span>Limite de controle: ${formatCurrency(controlLimit)}</span><span>Limite real: ${formatCurrency(realCardLimit)}</span></div>
        </div>

        <div class="credit-card-limit-reference" style="--control-limit-position:${controlLimitPosition}%; --suggested-limit-position:${suggestedLimitPosition}%">
          <div class="credit-card-limit-reference-head">
            <strong>Limite mensal de controle: <b class="credit-card-control-value">${formatCurrency(controlLimit)}</b></strong>
            <small>Arraste a bolinha; não altera o limite real nem o Livre.</small>
          </div>
          <div class="credit-card-limit-reference-track">
            <span class="credit-card-control-limit-fill"></span>
            ${suggestedLimit > 0 ? '<i class="credit-card-recurring-marker"></i>' : ''}
            <input class="credit-card-control-slider" type="range" min="0" max="${limitReferenceMax}" step="0.01" value="${controlLimit}" data-card-id="${card.id}" aria-label="Limite mensal de controle de ${escapeCardDetail(card.name)}">
          </div>
          <div class="credit-card-limit-reference-meta">
            <span>CAD 0</span>
            ${
              suggestedLimit > 0
                ? `<button type="button" class="credit-card-use-suggested" data-card-id="${card.id}" data-suggested-limit="${suggestedLimit}" title="${suggestedLimitTitle}">${hasSuggestionCredit ? 'Base líquida' : 'Base recorrente'}: ${formatCurrency(suggestedLimit)}</button>`
                : '<b>Sem base recorrente</b>'
            }
            <span>Limite real: ${formatCurrency(realCardLimit)}</span>
          </div>
        </div>

        ${
          isExpanded
            ? `<div class="credit-card-details">
                <section class="credit-card-invoice-section is-forming">
                  <div class="credit-card-details-title credit-card-details-toolbar">
                    <div class="credit-card-details-heading">
                      <div class="credit-card-cycle-title">
                        <strong>Fatura em formação</strong>
                        <span>Compras atuais · vence em ${nextPaymentDateLabel} · ${hasActiveCardSearch ? `${filteredNextEntries.length} de ` : ''}${nextSnapshot.entries.length} lançamento${nextSnapshot.entries.length === 1 ? '' : 's'}</span>
                      </div>
                      <strong>${formatCurrency(nextSnapshot.total)}</strong>
                    </div>
                    <div class="credit-card-filter-actions">
                      <input class="list-search credit-card-search" type="search" value="${escapeCardDetail(cardFilter.search)}" placeholder="Buscar..." aria-label="Buscar na fatura em formação de ${escapeCardDetail(card.name)}" data-card-id="${card.id}">
                      <select class="filter-select credit-card-sort-type" aria-label="Ordenar fatura em formação de ${escapeCardDetail(card.name)}" data-card-id="${card.id}">
                        <option value="date" ${cardFilter.sortType === 'date' ? 'selected' : ''}>Data</option>
                        <option value="amount" ${cardFilter.sortType === 'amount' ? 'selected' : ''}>Valor</option>
                        <option value="merchant" ${cardFilter.sortType === 'merchant' ? 'selected' : ''}>Nome</option>
                      </select>
                      <button type="button" class="action-btn btn-icon-only credit-card-sort-order" data-card-id="${card.id}" title="Inverter ordem" aria-label="Inverter ordem da fatura em formação">${cardFilter.sortOrder === 'asc' ? '⬆️' : '⬇️'}</button>
                    </div>
                  </div>
                  <div class="credit-card-timing-legend" aria-label="Situação dos lançamentos">
                    <span><i class="is-posted"></i> Já lançado</span>
                    <span><i class="is-pending"></i> Ainda vai bater</span>
                  </div>
                  <div class="credit-card-detail-list is-forming">${renderRows(filteredNextEntries, { showTimingStatus: true }) || `<p class="hint">${hasActiveCardSearch ? 'Nenhum lançamento encontrado nesta fatura.' : 'Nenhum lançamento conhecido para a fatura em formação.'}</p>`}</div>
                </section>

                <section class="credit-card-invoice-section is-closed">
                  <div class="credit-card-details-title credit-card-closed-title">
                    <div class="credit-card-cycle-title">
                      <strong>Fatura fechada</strong>
                      <span>Pagamento em ${paymentDateLabel} · ${currentSnapshot.entries.length} lançamento${currentSnapshot.entries.length === 1 ? '' : 's'}</span>
                    </div>
                    <strong>${formatCurrency(currentSnapshot.total)}</strong>
                  </div>
                  <div class="credit-card-detail-list is-closed">${renderRows(currentSnapshot.entries) || '<p class="hint">Nenhum lançamento compõe a fatura fechada.</p>'}</div>
                  ${previousPaymentLine}
                  <div class="credit-card-payment-panel ${paymentInfo.statusClass}">
                    <div class="credit-card-payment-state">
                      <span class="credit-card-payment-state-icon" aria-hidden="true">${paymentStateIcon}</span>
                      <div class="credit-card-payment-state-copy">
                        <strong>${paymentInfo.status}</strong>
                        <small>${currentPaymentCopy}</small>
                      </div>
                      <b>${paymentStateValue}</b>
                    </div>
                    ${
                      currentSnapshot.total > 0.005
                        ? `<details class="credit-card-payment-control">
                            <summary>
                              <span>${paymentInfo.record ? 'Editar pagamento informado' : 'Informar pagamento diferente'}</span>
                              <small>Opcional</small>
                            </summary>
                            <form class="credit-card-payment-form" data-card-id="${card.id}" data-due-month="${month}">
                              <label>Valor pago<input type="number" min="0" step="0.01" name="amount" value="${paymentInfo.record ? paymentInfo.paidAmount.toFixed(2) : currentSnapshot.total.toFixed(2)}" required></label>
                              <label>Data do pagamento<input type="date" name="date" value="${paymentInfo.record?.date || paymentInfo.dueDate || ''}" required></label>
                              <button type="submit" class="action-btn credit-card-payment-save">${paymentInfo.record ? 'Salvar alteração' : 'Confirmar pagamento'}</button>
                              ${paymentInfo.record ? '<button type="button" class="action-btn credit-card-payment-auto">Voltar ao automático</button>' : ''}
                            </form>
                          </details>`
                        : ''
                    }
                  </div>
                </section>
              </div>`
            : ''
        }
      </div>`;
  });

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

  container.querySelectorAll('.credit-card-search').forEach((input) => {
    input.addEventListener('input', () => {
      const cardId = input.dataset.cardId;
      const cursorPosition = input.selectionStart ?? input.value.length;
      getCreditCardFilter(cardId).search = input.value;
      updateCreditCardsDashboard();
      requestAnimationFrame(() => {
        const refreshedInput = [...container.querySelectorAll('.credit-card-search')].find((item) => item.dataset.cardId === cardId);
        if (!refreshedInput) return;
        refreshedInput.focus();
        refreshedInput.setSelectionRange(cursorPosition, cursorPosition);
      });
    });
  });

  container.querySelectorAll('.credit-card-sort-type').forEach((select) => {
    select.addEventListener('change', () => {
      getCreditCardFilter(select.dataset.cardId).sortType = select.value;
      updateCreditCardsDashboard();
    });
  });

  container.querySelectorAll('.credit-card-sort-order').forEach((button) => {
    button.addEventListener('click', () => {
      const filter = getCreditCardFilter(button.dataset.cardId);
      filter.sortOrder = filter.sortOrder === 'asc' ? 'desc' : 'asc';
      updateCreditCardsDashboard();
    });
  });

  container.querySelectorAll('.credit-card-control-slider').forEach((slider) => {
    const reference = slider.closest('.credit-card-limit-reference');
    const valueLabel = reference?.querySelector('.credit-card-control-value');
    const updateSliderVisual = () => {
      const value = Math.max(0, Number(slider.value) || 0);
      const max = Math.max(1, Number(slider.max) || 1);
      reference?.style.setProperty('--control-limit-position', `${Math.min((value / max) * 100, 100)}%`);
      if (valueLabel) valueLabel.textContent = formatCurrency(value);
    };

    slider.addEventListener('input', updateSliderVisual);
    slider.addEventListener('change', async () => {
      const controlLimit = Math.round(Math.max(0, Number(slider.value) || 0) * 100) / 100;
      const cardIndex = paymentMethods.findIndex((method) => method.id === slider.dataset.cardId);
      if (cardIndex < 0) return;

      slider.disabled = true;
      const updatedMethods = paymentMethods.map((method, index) => (index === cardIndex ? { ...method, controlLimit } : method));
      try {
        await FinanceAPI.savePaymentMethods(updatedMethods);
        showToast(`Limite mensal de controle definido em ${formatCurrency(controlLimit)}.`, 'success');
      } catch (error) {
        console.error('Erro ao salvar limite mensal de controle:', error);
        showToast('Não foi possível salvar o limite de controle.', 'error');
        slider.disabled = false;
      }
    });
  });

  container.querySelectorAll('.credit-card-use-suggested').forEach((button) => {
    button.addEventListener('click', () => {
      const slider = [...container.querySelectorAll('.credit-card-control-slider')].find((item) => item.dataset.cardId === button.dataset.cardId);
      if (!slider || slider.disabled) return;
      slider.value = button.dataset.suggestedLimit;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      slider.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });

  container.querySelectorAll('.credit-card-payment-form').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const amount = Number(form.elements.amount.value);
      const date = form.elements.date.value;
      if (!Number.isFinite(amount) || amount < 0 || !date) return showToast('Informe um valor e uma data válidos.', 'error');
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        await FinanceAPI.saveCreditCardPayment(form.dataset.dueMonth, form.dataset.cardId, { amount: Math.round(amount * 100) / 100, date, updatedAt: new Date().toISOString() });
        showToast('Pagamento da fatura registrado apenas para controle.', 'success');
      } catch (error) {
        console.error('Erro ao registrar pagamento da fatura:', error);
        showToast('Não foi possível registrar o pagamento.', 'error');
        submit.disabled = false;
      }
    });
  });

  container.querySelectorAll('.credit-card-payment-auto').forEach((button) => {
    button.addEventListener('click', async () => {
      const form = button.closest('.credit-card-payment-form');
      if (!form || !(await showConfirm('Remover o valor manual e voltar ao pagamento automático da fatura?'))) return;
      try {
        await FinanceAPI.deleteCreditCardPayment(form.dataset.dueMonth, form.dataset.cardId);
        showToast('Pagamento automático restaurado.', 'success');
      } catch (error) {
        console.error('Erro ao remover pagamento manual:', error);
        showToast('Não foi possível restaurar o pagamento automático.', 'error');
      }
    });
  });

  cardWrapper.style.display = 'block';
}

// === Função de Reembolso Rápido (Espelhamento) ===
const creditCardStatementWriteLocks = new Set();

function getCardEntriesForDueMonth(card, dueMonth) {
  return receipts
    .filter((receipt) => receipt.paymentMethodId === card.id && CardStatements.getEntryDueMonth(receipt, card, creditCardStatements) === dueMonth)
    .sort((a, b) => String(b.postedDate || b.date || '').localeCompare(String(a.postedDate || a.date || '')));
}

async function reconcileClosedStatementsForReceiptChange(oldReceipt, newReceipt) {
  const deltas = new Map();
  const addDelta = (receipt, direction) => {
    if (!receipt) return;
    const card = paymentMethods.find((method) => method.id === receipt.paymentMethodId && method.type === 'credito');
    if (!card) return;
    const dueMonth = CardStatements.getEntryDueMonth(receipt, card, creditCardStatements);
    if (!dueMonth) return;
    const key = `${card.id}|${dueMonth}`;
    deltas.set(key, (deltas.get(key) || 0) + direction * (Number(receipt.amount) || 0));
  };

  addDelta(oldReceipt, -1);
  addDelta(newReceipt, 1);

  for (const [key, delta] of deltas) {
    if (Math.abs(delta) < 0.005) continue;
    const separatorIndex = key.lastIndexOf('|');
    const cardId = key.slice(0, separatorIndex);
    const dueMonth = key.slice(separatorIndex + 1);
    const statement = findCardStatement(cardId, dueMonth);
    if (!statement) continue;
    await saveStatementMutation(statement, { calculatedAmount: CardStatements.roundMoney(Number(statement.calculatedAmount) + delta) });
  }
}

function findCardStatement(cardId, dueMonth) {
  return creditCardStatements.find((statement) => statement.cardId === cardId && CardStatements.getStatementDueMonth(statement) === dueMonth);
}

function getPayableCardStatement(card, referenceMonth) {
  return getCreditCardMonthState(card, referenceMonth).payableStatement;
}

function getCycleReceiptMonths(cycle) {
  const startMonth = String(cycle?.cycleStartDate || '').slice(0, 7);
  const endMonth = String(cycle?.cycleEndDate || '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(startMonth) || !/^\d{4}-\d{2}$/.test(endMonth)) return [];
  const months = [];
  let cursor = startMonth;
  while (cursor <= endMonth && months.length < 4) {
    months.push(cursor);
    cursor = shiftReferenceMonth(cursor, 1);
  }
  return months;
}

async function persistClosedCardStatements(referenceMonth) {
  for (const card of paymentMethods.filter((method) => method.type === 'credito')) {
    const state = getCreditCardMonthState(card, referenceMonth);
    const cycle = state.cycle;
    const id = CardStatements.statementId(card.id, referenceMonth);
    const requiredMonths = getCycleReceiptMonths(cycle);
    if (!state.isClosed || requiredMonths.some((month) => !loadedReceiptMonths.has(month)) || creditCardStatementWriteLocks.has(id)) continue;
    const existing = findCardStatement(card.id, referenceMonth);
    const statement = state.payableStatement;
    if (!statement) continue;
    const alreadyCurrent = existing
      && Math.abs(Number(existing.calculatedAmount) - Number(statement.calculatedAmount)) < 0.005
      && existing.cycleStartDate === statement.cycleStartDate
      && existing.closingDate === statement.closingDate
      && existing.dueDate === statement.dueDate;
    if (alreadyCurrent) continue;
    creditCardStatementWriteLocks.add(id);
    try {
      await FinanceAPI.saveCreditCardStatement(statement);
    } catch (error) {
      console.error('Erro ao fechar a fatura do cartão:', error);
    } finally {
      creditCardStatementWriteLocks.delete(id);
    }
  }
}

async function saveStatementMutation(statement, changes) {
  const updated = { ...statement, ...changes, updatedAt: new Date().toISOString() };
  updated.status = CardStatements.getStatus(updated);
  await FinanceAPI.saveCreditCardStatement(updated);
}

async function migrateLegacyCardPayments(referenceMonth, paymentRecords = creditCardPayments) {
  for (const statement of creditCardStatements.filter((item) => String(item.dueDate || '').startsWith(referenceMonth))) {
    const legacy = CardStatements.normalizeLegacyPayment(statement.cardId, statement, paymentRecords[statement.cardId]);
    if (!legacy || statement.payments?.some((payment) => payment.id === legacy.id)) continue;
    await saveStatementMutation(statement, { payments: CardStatements.addOrReplaceById(statement.payments, legacy) });
  }
}

function getCardStatementStatusLabel(statement) {
  const status = statement ? CardStatements.getStatus(statement) : 'open';
  return ({ paid: 'Paga', partial: 'Paga parcialmente', credit: 'Crédito', closed: 'Fechada', open: 'Em aberto' })[status] || 'Em aberto';
}

function orderSimpleCardEntries(entries, sourcePool = entries) {
  const orderedEntries = [];
  const attachedReimbursementIds = new Set();

  (entries || [])
    .filter((entry) => !entry.isReimbursement)
    .forEach((entry) => {
      orderedEntries.push(entry);
      (entries || [])
        .filter((candidate) => candidate.isReimbursement && findReimbursementSource(candidate, sourcePool)?.id === entry.id)
        .forEach((reimbursement) => {
          orderedEntries.push(reimbursement);
          attachedReimbursementIds.add(reimbursement.id);
        });
    });

  (entries || [])
    .filter((entry) => entry.isReimbursement && !attachedReimbursementIds.has(entry.id))
    .forEach((reimbursement) => orderedEntries.push(reimbursement));

  return orderedEntries;
}

function renderSimpleCardEntry(receipt, { showTimingStatus = false, sourcePool = [] } = {}) {
  const isReimbursement = Boolean(receipt.isReimbursement);
  const isCredit = Number(receipt.amount) < 0 || isReimbursement;
  const reimbursementSource = isReimbursement ? findReimbursementSource(receipt, sourcePool) : null;
  const isLinkedReimbursement = Boolean(reimbursementSource);
  const processed = receipt.postedDate && receipt.postedDate !== receipt.date ? `<span>Processada em ${receipt.postedDate.split('-').reverse().join('/')}</span>` : '';
  const isPendingEntry = showTimingStatus && String(receipt.date || '') > getTodayISO();
  const timingBadge = showTimingStatus
    ? `<span class="credit-card-entry-timing ${isPendingEntry ? 'is-pending' : 'is-posted'}">${isPendingEntry ? 'A lançar' : 'Já lançado'}</span>`
    : '';
  const displayedAmount = isCredit ? `+ ${formatCurrency(Math.abs(Number(receipt.amount) || 0))}` : formatCurrency(receipt.amount);
  const entryTitle = isReimbursement
    ? `<span class="reimbursement-item-arrow" aria-hidden="true">↳</span><span class="reimbursement-item-label">Reembolso</span>${escapeCardDetail(receipt.merchant)}`
    : `${escapeCardDetail(receipt.merchant)} <span class="credit-card-entry-badge">${isCredit ? 'Crédito' : 'Compra'}</span>`;

  return `<div class="simple-card-entry ${isCredit ? 'is-credit' : ''} ${isLinkedReimbursement ? 'is-linked-reimbursement' : ''} ${isPendingEntry ? 'is-pending-entry' : 'is-posted-entry'}">
    <div class="simple-card-entry-copy"><strong>${entryTitle}${timingBadge}</strong><small>${String(receipt.date || '').split('-').reverse().join('/')} · ${escapeCardDetail(receipt.category)} ${processed}</small>${receipt.observation ? `<small>↳ ${escapeCardDetail(receipt.observation)}</small>` : ''}</div>
    <b>${displayedAmount}</b>
  </div>`;
}

function updateCreditCardsDashboard() {
  const referenceMonth = getCurrentMonth();
  const container = document.getElementById('credit-cards-dashboard-list');
  const wrapper = document.getElementById('card-credit-cards');
  if (!container || !wrapper || !referenceMonth) return;
  const cards = paymentMethods.filter((method) => method.type === 'credito');
  wrapper.style.display = cards.length ? 'block' : 'none';
  if (!cards.length) return;
  persistClosedCardStatements(referenceMonth);
  persistClosedCardStatements(shiftReferenceMonth(referenceMonth, -1));

  container.innerHTML = cards.map((card) => {
    const state = getCreditCardMonthState(card, referenceMonth);
    const payableStatement = state.payableStatement;
    const storedPayableStatement = state.storedStatement;
    const payableDueMonth = state.payableDueMonth;
    const closedEntries = state.payableEntries;
    const openDueMonth = state.openDueMonth;
    const openEntries = state.openEntries;
    const cardFilter = getCreditCardFilter(card.id);
    const filteredOpenEntries = filterAndSortCreditCardEntries(openEntries, cardFilter);
    const filteredClosedEntries = filterAndSortCreditCardEntries(closedEntries, cardFilter);
    const launchedOpenEntries = filteredOpenEntries.filter((entry) => String(entry.date || '') <= getTodayISO());
    const pendingOpenEntries = filteredOpenEntries.filter((entry) => String(entry.date || '') > getTodayISO());
    const launchedOpenTotal = CardStatements.roundMoney(launchedOpenEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0));
    const pendingOpenTotal = CardStatements.roundMoney(pendingOpenEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0));
    const closed = payableStatement || CardStatements.createStatement(card, payableDueMonth, [], null, new Date().toISOString());
    const overview = state.overview;
    const isExpanded = openCreditCardDetails.has(card.id);
    const safetyBase = getSuggestedCreditCardLimit(card, referenceMonth).value;
    const safetyLimit = Math.max(0, Number(card.controlLimit) || safetyBase || Number(card.monthlyLimit) || 0);
    const realLimit = Math.max(0, Number(card.monthlyLimit) || 0);
    const sliderMax = Math.max(realLimit, safetyLimit, safetyBase, 1);
    const safetyPosition = Math.min(100, (safetyLimit / sliderMax) * 100);
    const safetyBasePosition = Math.min(100, (safetyBase / sliderMax) * 100);
    const limitLocked = isCreditCardLimitLocked(card.id);
    const suggestedLimitLabel = 'Base recorrente';
    const payments = payableStatement?.payments || [];
    const adjustments = payableStatement?.adjustments || [];
    const reconciliation = CardStatements.getStatementTotals(payableStatement || closed);
    const paymentRows = payments.map((payment) => `<div class="simple-card-control-row"><span>${payment.date.split('-').reverse().join('/')} · ${escapeCardDetail(payment.observation || 'Pagamento')}</span><b>${formatCurrency(payment.amount)}</b><button class="action-btn card-payment-edit" data-statement-id="${payableStatement.id}" data-item-id="${payment.id}">Editar</button><button class="action-btn danger card-payment-delete" data-statement-id="${payableStatement.id}" data-item-id="${payment.id}">Excluir</button></div>`).join('');
    const adjustmentRows = adjustments.map((adjustment) => `<div class="simple-card-control-row"><span>${adjustment.date.split('-').reverse().join('/')} · ${escapeCardDetail(adjustment.description)}</span><b>${formatCurrency(adjustment.amount)}</b><button class="action-btn card-adjustment-edit" data-statement-id="${payableStatement.id}" data-item-id="${adjustment.id}">Editar</button><button class="action-btn danger card-adjustment-delete" data-statement-id="${payableStatement.id}" data-item-id="${adjustment.id}">Excluir</button></div>`).join('');
    return `<article class="credit-card-card simple-card-panel ${isExpanded ? 'is-expanded' : ''}">
      <button type="button" class="credit-card-summary simple-card-summary" data-credit-card-id="${card.id}" aria-expanded="${isExpanded}"><span class="toggle-icon">${isExpanded ? '▼' : '▶'}</span><span class="credit-card-brand-icon">💳</span><span class="simple-card-name"><strong>${escapeCardDetail(card.name)}</strong><small>Fecha dia ${card.closing || '?'} · Vence dia ${card.due || '?'}</small></span><span class="simple-card-metrics"><span><small>Em formação</small><b>${formatCurrency(overview.openAmount)}</b></span><span class="is-payable"><small>Fatura a pagar</small><b>${formatCurrency(overview.closed.remaining)}</b></span><span><small>Disponível</small><b>${formatCurrency(overview.availableLimit)}</b></span></span></button>
      <div class="credit-card-limit-reference ${limitLocked ? 'is-locked' : ''}"><div class="credit-card-limit-reference-head"><strong>Limite mensal de segurança: <b class="credit-card-control-value">${formatCurrency(safetyLimit)}</b></strong><div class="credit-card-limit-reference-actions">${safetyBase ? `<button type="button" class="credit-card-use-suggested" data-card-id="${card.id}" data-suggested-limit="${safetyBase}" ${limitLocked ? 'disabled' : ''}>${suggestedLimitLabel}: ${formatCurrency(safetyBase)}</button>` : ''}<button type="button" class="credit-card-limit-lock ${limitLocked ? 'is-locked' : ''}" data-card-id="${card.id}" aria-pressed="${limitLocked ? 'true' : 'false'}" title="${limitLocked ? 'Desbloquear limite mensal de segurança' : 'Bloquear limite mensal de segurança'}" aria-label="${limitLocked ? 'Desbloquear limite mensal de segurança' : 'Bloquear limite mensal de segurança'}">${limitLocked ? '🔒' : '🔓'}</button></div></div><div class="credit-card-limit-reference-track" style="--control-limit-position:${safetyPosition}%;--suggested-limit-position:${safetyBasePosition}%"><span class="credit-card-control-limit-fill"></span><input class="credit-card-control-slider" type="range" min="0" max="${sliderMax}" step="0.01" value="${safetyLimit}" data-card-id="${card.id}" ${limitLocked ? 'disabled' : ''}>${safetyBase ? '<span class="credit-card-recurring-marker"></span>' : ''}</div><div class="credit-card-limit-reference-meta"><span>CAD 0</span><span>${formatCurrency(sliderMax)}</span></div></div>
      ${isExpanded ? `<div class="simple-card-details"><section class="simple-card-cycle is-forming"><div class="simple-card-section-toolbar"><div class="simple-card-section-heading is-open"><div><strong>Fatura em formação</strong><small>Vence em ${CardStatements.getCycle(card, openDueMonth).dueDate.split('-').reverse().join('/')} · ${filteredOpenEntries.length} lançamento(s)</small></div><b>${formatCurrency(overview.openAmount)}</b></div><div class="credit-card-filter-actions"><input class="list-search credit-card-search" type="search" value="${escapeCardDetail(cardFilter.search)}" placeholder="Buscar..." data-card-id="${card.id}" aria-label="Buscar nos lançamentos de ${escapeCardDetail(card.name)}"><select class="filter-select credit-card-sort-type" data-card-id="${card.id}" aria-label="Ordenar lançamentos"><option value="date" ${cardFilter.sortType === 'date' ? 'selected' : ''}>Data</option><option value="amount" ${cardFilter.sortType === 'amount' ? 'selected' : ''}>Valor</option><option value="merchant" ${cardFilter.sortType === 'merchant' ? 'selected' : ''}>Nome</option></select><button type="button" class="action-btn btn-icon-only credit-card-sort-order" data-card-id="${card.id}" title="Inverter ordem">${cardFilter.sortOrder === 'asc' ? '⬆️' : '⬇️'}</button></div></div><div class="simple-card-timing-summary"><span class="is-posted"><i></i><span>Já lançado <small>${launchedOpenEntries.length} item(ns)</small></span><b>${formatCurrency(launchedOpenTotal)}</b></span><span class="is-pending"><i></i><span>A lançar <small>${pendingOpenEntries.length} item(ns)</small></span><b>${formatCurrency(pendingOpenTotal)}</b></span></div><div class="simple-card-entry-list">${orderSimpleCardEntries(filteredOpenEntries, openEntries).map((entry) => renderSimpleCardEntry(entry, { showTimingStatus: true, sourcePool: openEntries })).join('') || '<p class="hint">Nenhum lançamento encontrado na fatura em formação.</p>'}</div></section>
      <section class="simple-card-cycle is-payable"><div class="simple-card-section-heading"><div><strong>Fatura fechada a pagar</strong><small>${closed.dueDate.split('-').reverse().join('/')} · ${getCardStatementStatusLabel(payableStatement)} · Pago ${formatCurrency(overview.closed.paid)} · Restante ${formatCurrency(overview.closed.remaining)}</small></div><b>${formatCurrency(overview.closed.remaining)}</b></div>${storedPayableStatement && payableStatement ? `<details class="simple-card-admin"><summary><span>Gerenciar pagamentos da fatura</span><small>${payments.length ? `${payments.length} pagamento(s) registrado(s)` : 'Informar ou corrigir pagamento'}</small></summary><div class="simple-card-controls"><h4>Pagamentos da fatura</h4>${overview.closed.credit > 0 ? `<p class="simple-card-credit-notice">Crédito no cartão: <strong>${formatCurrency(overview.closed.credit)}</strong></p>` : ''}${paymentRows || '<p class="hint">Nenhum pagamento registrado.</p>'}<form class="simple-card-payment-form" data-statement-id="${payableStatement.id}"><input type="date" name="date" value="${getTodayISO()}" required><input type="number" step="0.01" min="0.01" name="amount" placeholder="Valor" required><input name="observation" placeholder="Observação"><button class="action-btn" type="submit">Adicionar pagamento</button></form><h4>Conciliação manual</h4><div class="simple-card-reconciliation-summary"><span>Calculado pelas Notas: <b>${formatCurrency(reconciliation.calculated)}</b></span><span>Valor real no banco: <b>${reconciliation.bankAmount === null ? 'Não informado' : formatCurrency(reconciliation.bankAmount)}</b></span><span>Diferença: <b>${reconciliation.difference === null ? '—' : formatCurrency(reconciliation.difference)}</b></span></div><form class="simple-card-reconcile-form" data-statement-id="${payableStatement.id}"><label>Valor real no banco<input type="number" step="0.01" min="0" name="bankAmount" value="${reconciliation.bankAmount ?? ''}" required></label><label>Fechamento real<input type="date" name="actualClosingDate" value="${payableStatement.actualClosingDate || payableStatement.closingDate}" required></label><label>Vencimento real (opcional)<input type="date" name="actualDueDate" value="${payableStatement.actualDueDate || ''}"></label><button class="action-btn" type="submit">Salvar conciliação</button></form><p class="hint">A conciliação ajusta somente a fatura; não modifica as Notas nem o Livre.</p><h4>Ajustes simples</h4>${adjustmentRows}<form class="simple-card-adjustment-form" data-statement-id="${payableStatement.id}"><input type="date" name="date" value="${getTodayISO()}" required><input name="description" placeholder="Descrição" required><input type="number" step="0.01" name="amount" placeholder="Valor + ou -" required><button class="action-btn" type="submit">Adicionar ajuste</button></form></div></details>` : '<p class="simple-card-closing-note">Nenhuma fatura fechada para pagar neste período.</p>'}<div class="simple-card-entry-list">${orderSimpleCardEntries(filteredClosedEntries, closedEntries).map((entry) => renderSimpleCardEntry(entry, { sourcePool: closedEntries })).join('') || '<p class="hint">Nenhum lançamento encontrado nesta fatura.</p>'}</div></section></div>` : ''}</article>`;
  }).join('');

  container.querySelectorAll('.simple-card-summary').forEach((button) => button.addEventListener('click', () => { const id = button.dataset.creditCardId; if (openCreditCardDetails.has(id)) openCreditCardDetails.delete(id); else openCreditCardDetails.add(id); updateCreditCardsDashboard(); }));
  container.querySelectorAll('.credit-card-search').forEach((input) => input.addEventListener('input', () => { const cardId = input.dataset.cardId; const cursor = input.selectionStart ?? input.value.length; getCreditCardFilter(cardId).search = input.value; updateCreditCardsDashboard(); requestAnimationFrame(() => { const refreshed = container.querySelector(`.credit-card-search[data-card-id="${cardId}"]`); refreshed?.focus(); refreshed?.setSelectionRange(cursor, cursor); }); }));
  container.querySelectorAll('.credit-card-sort-type').forEach((select) => select.addEventListener('change', () => { getCreditCardFilter(select.dataset.cardId).sortType = select.value; updateCreditCardsDashboard(); }));
  container.querySelectorAll('.credit-card-sort-order').forEach((button) => button.addEventListener('click', () => { const filter = getCreditCardFilter(button.dataset.cardId); filter.sortOrder = filter.sortOrder === 'asc' ? 'desc' : 'asc'; updateCreditCardsDashboard(); }));
  container.querySelectorAll('.credit-card-control-slider').forEach((slider) => { const reference = slider.closest('.credit-card-limit-reference'); const label = reference?.querySelector('.credit-card-control-value'); const track = reference?.querySelector('.credit-card-limit-reference-track'); slider.addEventListener('input', () => { if (label) label.textContent = formatCurrency(slider.value); if (track) track.style.setProperty('--control-limit-position', `${Math.min(100, (Number(slider.value) / Math.max(Number(slider.max), 1)) * 100)}%`); }); slider.addEventListener('change', async () => { await FinanceAPI.savePaymentMethods(paymentMethods.map((method) => method.id === slider.dataset.cardId ? { ...method, controlLimit: CardStatements.roundMoney(slider.value) } : method)); showToast('Limite mensal de segurança atualizado.', 'success'); }); });
  container.querySelectorAll('.credit-card-use-suggested').forEach((button) => button.addEventListener('click', () => { if (button.disabled) return; const slider = container.querySelector(`.credit-card-control-slider[data-card-id="${button.dataset.cardId}"]`); if (!slider) return; slider.value = button.dataset.suggestedLimit; slider.dispatchEvent(new Event('input')); slider.dispatchEvent(new Event('change')); }));
  container.querySelectorAll('.credit-card-limit-lock').forEach((button) => button.addEventListener('click', () => { const nextLocked = button.getAttribute('aria-pressed') !== 'true'; setCreditCardLimitLocked(button.dataset.cardId, nextLocked); showToast(nextLocked ? 'Limite mensal de segurança bloqueado.' : 'Limite mensal de segurança desbloqueado.', 'success'); updateCreditCardsDashboard(); }));
  container.querySelectorAll('.simple-card-payment-form').forEach((form) => form.addEventListener('submit', async (event) => { event.preventDefault(); const statement = creditCardStatements.find((item) => item.id === form.dataset.statementId); const amount = Number(form.elements.amount.value); if (!statement || !form.elements.date.value || !(amount > 0)) return showToast('Informe data e valor válidos.', 'error'); const payment = { id: `payment_${Date.now()}`, cardId: statement.cardId, statementId: statement.id, date: form.elements.date.value, amount: CardStatements.roundMoney(amount), observation: form.elements.observation.value.trim() }; await saveStatementMutation(statement, { payments: CardStatements.addOrReplaceById(statement.payments, payment) }); showToast('Pagamento registrado somente na fatura.', 'success'); }));
  container.querySelectorAll('.card-payment-edit').forEach((button) => button.addEventListener('click', async () => {
    const statement = creditCardStatements.find((item) => item.id === button.dataset.statementId);
    const payment = statement?.payments?.find((item) => item.id === button.dataset.itemId);
    if (!payment) return;
    const date = await showPrompt('Nova data do pagamento:', payment.date);
    if (date === null) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return showToast('Informe a data no formato AAAA-MM-DD.', 'error');
    const rawAmount = await showPrompt('Novo valor do pagamento:', String(payment.amount).replace('.', ','));
    if (rawAmount === null) return;
    const amount = parseAmount(rawAmount);
    if (!(amount > 0)) return showToast('Informe um valor válido.', 'error');
    const observation = await showPrompt('Nova observação:', payment.observation || '');
    if (observation === null) return;
    await saveStatementMutation(statement, { payments: CardStatements.addOrReplaceById(statement.payments, { ...payment, date, amount: CardStatements.roundMoney(amount), observation: observation.trim() }) });
    showToast('Pagamento atualizado.', 'success');
  }));
  container.querySelectorAll('.card-payment-delete').forEach((button) => button.addEventListener('click', async () => { const statement = creditCardStatements.find((item) => item.id === button.dataset.statementId); if (!statement || !(await showConfirm('Excluir este pagamento?', true))) return; await saveStatementMutation(statement, { payments: CardStatements.removeById(statement.payments, button.dataset.itemId) }); }));
  container.querySelectorAll('.simple-card-reconcile-form').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const statement = creditCardStatements.find((item) => item.id === form.dataset.statementId);
    const bankAmount = Number(form.elements.bankAmount.value);
    const actualClosingDate = form.elements.actualClosingDate.value;
    const actualDueDate = form.elements.actualDueDate.value;
    if (!statement || !Number.isFinite(bankAmount) || bankAmount < 0 || !actualClosingDate) return showToast('Informe o valor real e a data de fechamento.', 'error');
    await saveStatementMutation(statement, { bankAmount: CardStatements.roundMoney(bankAmount), actualClosingDate, actualDueDate: actualDueDate || null });
    showToast('Conciliação salva somente na fatura.', 'success');
  }));
  container.querySelectorAll('.simple-card-adjustment-form').forEach((form) => form.addEventListener('submit', async (event) => { event.preventDefault(); const statement = creditCardStatements.find((item) => item.id === form.dataset.statementId); const amount = Number(form.elements.amount.value); if (!statement || !form.elements.date.value || !form.elements.description.value.trim() || !Number.isFinite(amount) || amount === 0) return showToast('Informe data, descrição e valor diferente de zero.', 'error'); const adjustment = { id: `adjustment_${Date.now()}`, date: form.elements.date.value, description: form.elements.description.value.trim(), amount: CardStatements.roundMoney(amount) }; await saveStatementMutation(statement, { adjustments: CardStatements.addOrReplaceById(statement.adjustments, adjustment) }); showToast('Ajuste aplicado somente à fatura.', 'success'); }));
  container.querySelectorAll('.card-adjustment-edit').forEach((button) => button.addEventListener('click', async () => {
    const statement = creditCardStatements.find((item) => item.id === button.dataset.statementId);
    const adjustment = statement?.adjustments?.find((item) => item.id === button.dataset.itemId);
    if (!adjustment) return;
    const date = await showPrompt('Nova data do ajuste:', adjustment.date);
    if (date === null) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return showToast('Informe a data no formato AAAA-MM-DD.', 'error');
    const description = await showPrompt('Nova descrição do ajuste:', adjustment.description);
    if (description === null || !description.trim()) return;
    const rawAmount = await showPrompt('Novo valor do ajuste (+ ou -):', String(adjustment.amount).replace('.', ','));
    if (rawAmount === null) return;
    const amount = parseAmount(rawAmount);
    if (!Number.isFinite(amount) || amount === 0) return showToast('Informe um valor diferente de zero.', 'error');
    await saveStatementMutation(statement, { adjustments: CardStatements.addOrReplaceById(statement.adjustments, { ...adjustment, date, description: description.trim(), amount: CardStatements.roundMoney(amount) }) });
    showToast('Ajuste atualizado.', 'success');
  }));
  container.querySelectorAll('.card-adjustment-delete').forEach((button) => button.addEventListener('click', async () => { const statement = creditCardStatements.find((item) => item.id === button.dataset.statementId); if (!statement || !(await showConfirm('Excluir este ajuste?', true))) return; await saveStatementMutation(statement, { adjustments: CardStatements.removeById(statement.adjustments, button.dataset.itemId) }); }));
}

function startReimbursement(id) {
  const r = receipts.find((x) => x.id === id);
  if (!r) return;

  reimbursementSourceReceiptId = r.id;

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
    const creditCardsDue = document.getElementById('summary-credit-cards-due');
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
    if (creditCardsDue) {
      creditCardsDue.textContent = '';
      creditCardsDue.classList.remove('visible');
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
  creditCardPayments = {};
  previousCreditCardPayments = {};
  creditCardStatements = [];
  loadedReceiptMonths.clear();

  FinanceAPI.listenPaymentMethods((methods) => {
    paymentMethods = methods || [];
    renderPaymentMethodsList();
    updatePaymentSelects();
    refreshAll();
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
    } else if (idx >= 0) {
      incomes.splice(idx, 1);
    }
    loadIncomeToInputs(month);
    refreshAll();
  });

  FinanceAPI.listenCreditCardPayments(month, (payments) => {
    creditCardPayments = payments || {};
    migrateLegacyCardPayments(month).catch((error) => console.error('Erro ao migrar pagamento antigo:', error));
    refreshAll();
  });

  FinanceAPI.listenCreditCardStatements(async (statements) => {
    creditCardStatements = statements || [];
    await migrateLegacyCardPayments(month);
    await migrateLegacyCardPayments(shiftReferenceMonth(month, -1), previousCreditCardPayments);
    refreshAll();
  });

  FinanceAPI.listenCreditCardPayments(shiftReferenceMonth(month, -1), (payments) => {
    previousCreditCardPayments = payments || {};
    migrateLegacyCardPayments(shiftReferenceMonth(month, -1), previousCreditCardPayments).catch((error) => console.error('Erro ao migrar pagamento antigo:', error));
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
  const prevPrevMonthStr = shiftReferenceMonth(month, -2);

  // 1. Escuta as notas do Mês Atual
  FinanceAPI.listenReceipts(month, (rItems) => {
    for (let i = receipts.length - 1; i >= 0; i--) {
      if (receipts[i].date.startsWith(month)) receipts.splice(i, 1);
    }
    receipts.push(...rItems);
    loadedReceiptMonths.add(month);
    refreshAll();
  });

  // 2. Escuta as notas do Mês Anterior (Exclusivo para plugar os dados na Fatura do Cartão)
  FinanceAPI.listenReceipts(prevMonthStr, (rItems) => {
    for (let i = receipts.length - 1; i >= 0; i--) {
      if (receipts[i].date.startsWith(prevMonthStr)) receipts.splice(i, 1);
    }
    receipts.push(...rItems);
    loadedReceiptMonths.add(prevMonthStr);
    refreshAll();
  });

  // Cartões cujo vencimento ocorre antes do fechamento podem carregar alguns
  // lançamentos de dois meses atrás na fatura que vence no mês selecionado.
  FinanceAPI.listenReceipts(prevPrevMonthStr, (rItems) => {
    for (let i = receipts.length - 1; i >= 0; i--) {
      if (typeof receipts[i].date === 'string' && receipts[i].date.startsWith(prevPrevMonthStr)) receipts.splice(i, 1);
    }
    receipts.push(...rItems);
    loadedReceiptMonths.add(prevPrevMonthStr);
    refreshAll();
  });

  FinanceAPI.listenAnnualEvents((events) => {
    annualEvents = events || [];
    renderAnnualList();
    checkAnnualAlerts();
  });

  FinanceAPI.listenInstallmentPlans((plans) => {
    installmentPlans = plans || [];
    renderInstallmentPlans();
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
let installmentPlans = [];
let editingAnnualId = null;
let editingInstallmentPlanId = null;

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
const annualInstallmentPreview = document.getElementById('annual-installment-preview');
const annualInstallmentAmountHint = document.getElementById('annual-installment-amount-hint');
const annualAmountLabel = document.getElementById('annual-amount-label');
const annualDateLabel = document.getElementById('annual-date-label');
const annualInstallmentModeInputs = [...document.querySelectorAll('input[name="annual-installment-mode"]')];
const annualInterestToggle = document.getElementById('annual-interest-toggle');
const annualInterestCheck = document.getElementById('annual-interest-check');
const annualInterestFields = document.getElementById('annual-interest-fields');
const annualInterestRate = document.getElementById('annual-interest-rate');
const annualInterestTypeInputs = [...document.querySelectorAll('input[name="annual-interest-type"]')];
const annualPaymentFrequency = document.getElementById('annual-payment-frequency');
const annualPaymentFrequencyInputs = [...document.querySelectorAll('input[name="annual-payment-frequency"]')];
const annualMortgageAmortizationField = document.getElementById('annual-mortgage-amortization-field');
const annualMortgageAmortization = document.getElementById('annual-mortgage-amortization');
const annualInstallmentsCountLabel = document.getElementById('annual-installments-count-label');
const annualInstallmentsIntervalField = document.getElementById('annual-installments-interval-field');
const annualRentToOwnFields = document.getElementById('annual-rent-to-own-fields');
const annualRentalAmount = document.getElementById('annual-rental-amount');
const annualRentBuyAtEnd = document.getElementById('annual-rent-buy-at-end');
const annualSubmitBtn = document.getElementById('annual-submit-btn');
const annualItemsList = document.getElementById('annual-items-list');
const installmentPlansCard = document.getElementById('installment-plans-card');
const installmentPlansList = document.getElementById('installment-plans-list');

function getAnnualInstallmentMode() {
  return annualInstallmentModeInputs.find((input) => input.checked)?.value || 'purchase';
}

function getAnnualInterestType() {
  return annualInterestTypeInputs.find((input) => input.checked)?.value || 'financing';
}

function getAnnualPaymentFrequency() {
  return annualPaymentFrequencyInputs.find((input) => input.checked)?.value || 'monthly';
}

function distributeCurrencyAmount(total, count) {
  const totalCents = Math.round(Math.abs(total) * 100);
  const baseCents = Math.floor(totalCents / count);
  const remainder = totalCents % count;
  return Array.from({ length: count }, (_, index) => (baseCents + (index < remainder ? 1 : 0)) / 100);
}

function calculateInstallmentScheduleWithInterest(principal, annualRatePercent, budgetMonthCount, interestType, paymentFrequency = 'monthly') {
  const safePrincipal = Math.abs(Number(principal) || 0);
  const safeBudgetMonthCount = Math.max(1, Math.round(Number(budgetMonthCount) || 1));
  const annualRate = Math.max(0, Number(annualRatePercent) || 0) / 100;
  const paymentsPerYear = paymentFrequency === 'biweekly' ? 26 : 12;
  const paymentCount = paymentFrequency === 'biweekly' ? Math.max(1, Math.round((safeBudgetMonthCount * paymentsPerYear) / 12)) : safeBudgetMonthCount;
  const periodicRate = interestType === 'mortgage' ? Math.pow(1 + annualRate / 2, 2 / paymentsPerYear) - 1 : annualRate / paymentsPerYear;

  if (!periodicRate) {
    const payments = distributeCurrencyAmount(safePrincipal, paymentCount);
    const amounts = distributeCurrencyAmount(safePrincipal, safeBudgetMonthCount);
    return {
      amounts,
      periodicPayment: payments[0] || 0,
      monthlyEquivalent: amounts[0] || 0,
      paymentCount,
      paymentsPerYear,
      totalPaid: safePrincipal,
      totalInterest: 0,
      periodicRate: 0,
    };
  }

  const calculatedPayment = (safePrincipal * periodicRate) / (1 - Math.pow(1 + periodicRate, -paymentCount));
  const regularPayment = Math.round(calculatedPayment * 100) / 100;
  let balance = Math.round(safePrincipal * 100) / 100;
  const payments = [];

  for (let index = 0; index < paymentCount; index += 1) {
    const interestForPeriod = Math.round(balance * periodicRate * 100) / 100;
    const payment = index === paymentCount - 1 ? Math.round((balance + interestForPeriod) * 100) / 100 : regularPayment;
    const principalPaid = Math.round((payment - interestForPeriod) * 100) / 100;
    balance = Math.max(0, Math.round((balance - principalPaid) * 100) / 100);
    payments.push(payment);
  }

  const totalPaid = Math.round(payments.reduce((total, value) => total + value, 0) * 100) / 100;
  const amounts = paymentFrequency === 'biweekly' ? distributeCurrencyAmount(totalPaid, safeBudgetMonthCount) : payments;
  return {
    amounts,
    periodicPayment: regularPayment,
    monthlyEquivalent: Math.round(regularPayment * (paymentsPerYear / 12) * 100) / 100,
    paymentCount,
    paymentsPerYear,
    totalPaid,
    totalInterest: Math.max(0, Math.round((totalPaid - safePrincipal) * 100) / 100),
    periodicRate,
  };
}

function addMonthsToAnnualDate(dateValue, monthsToAdd) {
  const [year, month, day] = dateValue.split('-').map(Number);
  const firstDay = new Date(year, month - 1 + monthsToAdd, 1);
  const lastDay = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0).getDate();
  const safeDay = Math.min(day, lastDay);
  return `${firstDay.getFullYear()}-${String(firstDay.getMonth() + 1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

function formatShortDate(dateValue) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue || '')) return '';
  const [year, month, day] = dateValue.split('-');
  return `${day}/${month}/${year}`;
}

function buildRentToOwnSchedule({ assetPrice, rentalPayment, rentalMonths, startDate, paymentFrequency, buyAtEnd, isIncome }) {
  const monthlyRental = paymentFrequency === 'biweekly' ? convertBiweeklyToMonthly(rentalPayment) : Math.abs(rentalPayment);
  const sign = isIncome ? -1 : 1;
  const schedule = Array.from({ length: rentalMonths }, (_, index) => ({
    number: index + 1,
    type: 'rental',
    rentalNumber: index + 1,
    rentalCount: rentalMonths,
    amount: sign * monthlyRental,
    targetDate: addMonthsToAnnualDate(startDate, index),
    status: 'pending',
  }));
  const creditedRental = Math.min(Math.abs(assetPrice), Math.round(monthlyRental * rentalMonths * 100) / 100);
  const buyoutAmount = Math.max(0, Math.round((Math.abs(assetPrice) - creditedRental) * 100) / 100);

  if (buyAtEnd && buyoutAmount > 0) {
    schedule.push({
      number: schedule.length + 1,
      type: 'buyout',
      amount: sign * buyoutAmount,
      targetDate: addMonthsToAnnualDate(startDate, rentalMonths),
      status: 'pending',
    });
  }

  return { schedule, monthlyRental, creditedRental, buyoutAmount };
}

function getInstallmentStageLabel(item, plan = null) {
  const mode = item?.installmentMode || plan?.mode;
  const stage = item?.installmentStage || item?.type;
  if (mode !== 'rent_to_own') return '';
  if (stage === 'buyout') return 'Compra pelo saldo';
  const rentalNumber = Number(item?.rentalNumber || item?.installmentNumber || item?.number) || 0;
  const rentalCount = Number(item?.rentalCount || plan?.rentalMonths) || 0;
  return `Aluguel ${rentalNumber}/${rentalCount}`;
}

function updateAnnualInstallmentBuilder() {
  if (!annualInstallmentCheck || !annualInstallmentFields) return;
  const enabled = annualInstallmentCheck.checked && !editingAnnualId;
  annualInstallmentFields.hidden = !enabled;

  annualInstallmentModeInputs.forEach((input) => {
    input.closest('.annual-installment-mode-option')?.classList.toggle('is-selected', input.checked);
  });

  const mode = getAnnualInstallmentMode();
  const isRentToOwn = mode === 'rent_to_own';
  const canUseInterest = enabled && mode === 'purchase';
  const usesInterest = canUseInterest && Boolean(annualInterestCheck?.checked);
  const interestType = getAnnualInterestType();
  const paymentFrequency = getAnnualPaymentFrequency();

  if (annualPaymentFrequency) annualPaymentFrequency.hidden = !enabled;
  if (annualRentToOwnFields) annualRentToOwnFields.hidden = !enabled || !isRentToOwn;
  if (annualInterestToggle) annualInterestToggle.hidden = !canUseInterest;
  if (annualInterestToggle) annualInterestToggle.classList.toggle('is-open', usesInterest);
  if (!canUseInterest && annualInterestCheck) annualInterestCheck.checked = false;
  if (annualInterestFields) annualInterestFields.hidden = !usesInterest;
  if (annualMortgageAmortizationField) annualMortgageAmortizationField.hidden = !usesInterest || interestType !== 'mortgage';
  annualInterestTypeInputs.forEach((input) => {
    input.closest('.annual-interest-type-option')?.classList.toggle('is-selected', input.checked);
  });
  annualPaymentFrequencyInputs.forEach((input) => {
    input.closest('.annual-payment-frequency-option')?.classList.toggle('is-selected', input.checked);
  });

  if (mode === 'purchase' || isRentToOwn) {
    annualInstallmentsInterval.value = '1';
    annualInstallmentsInterval.readOnly = true;
    if (annualInstallmentsIntervalField) {
      annualInstallmentsIntervalField.classList.add('is-locked');
      annualInstallmentsIntervalField.hidden = isRentToOwn;
    }
  } else {
    annualInstallmentsInterval.readOnly = false;
    if (annualInstallmentsIntervalField) {
      annualInstallmentsIntervalField.classList.remove('is-locked');
      annualInstallmentsIntervalField.hidden = false;
    }
  }

  if (usesInterest && interestType === 'mortgage') {
    const amortizationYears = Number(annualMortgageAmortization?.value);
    if (Number.isFinite(amortizationYears) && amortizationYears > 0) annualInstallmentsCount.value = String(Math.round(amortizationYears * 12));
    annualInstallmentsCount.readOnly = true;
    if (annualInstallmentsCountLabel) annualInstallmentsCountLabel.textContent = 'Meses restantes no orçamento';
  } else {
    annualInstallmentsCount.readOnly = false;
    annualInstallmentsCount.min = isRentToOwn ? '1' : '2';
    if (annualInstallmentsCountLabel) {
      annualInstallmentsCountLabel.textContent = isRentToOwn
        ? 'Meses de aluguel'
        : mode === 'repeat'
          ? paymentFrequency === 'biweekly'
            ? 'Meses no orçamento'
            : 'Total de lançamentos'
          : paymentFrequency === 'biweekly'
            ? 'Prazo restante (meses)'
            : 'Total de parcelas';
    }
  }

  if (annualAmountLabel) {
    annualAmountLabel.textContent = enabled
      ? isRentToOwn
        ? 'Valor do equipamento (CAD)'
        : mode === 'purchase'
          ? usesInterest && interestType === 'mortgage'
            ? 'Saldo devedor atual (CAD)'
            : 'Valor financiado / da compra (CAD)'
          : paymentFrequency === 'biweekly'
            ? 'Valor de cada pagamento bisemanal (CAD)'
            : 'Valor (CAD)'
      : 'Valor (CAD)';
  }
  if (annualDateLabel) annualDateLabel.textContent = enabled ? 'Data da primeira parcela' : 'Data (O ano será ignorado)';
  if (annualInstallmentAmountHint) {
    annualInstallmentAmountHint.classList.toggle('visible', enabled);
    annualInstallmentAmountHint.textContent = enabled
      ? mode === 'purchase'
        ? usesInterest
          ? interestType === 'mortgage'
            ? 'Informe o saldo que ainda falta pagar. O cálculo usa a regra canadense de hipoteca fixa.'
            : 'Informe o valor financiado antes dos juros.'
          : 'O sistema dividirá este total sem perder centavos.'
        : isRentToOwn
          ? 'Informe o preço para compra. Os aluguéis pagos serão descontados deste valor.'
          : paymentFrequency === 'biweekly'
            ? 'O sistema converterá os 26 pagamentos anuais para a média mensal do orçamento.'
            : 'Este valor será usado em cada lançamento.'
      : '';
  }

  if (enabled && annualOneOffCheckbox) {
    annualOneOffCheckbox.checked = true;
    annualOneOffCheckbox.disabled = true;
  } else if (annualOneOffCheckbox) {
    annualOneOffCheckbox.disabled = false;
  }

  if (!annualInstallmentPreview) return;
  if (!enabled) {
    annualInstallmentPreview.innerHTML = '';
    return;
  }

  const amount = parseAmount(annualAmountInput.value);
  const count = Math.min(600, Math.max(isRentToOwn ? 1 : 2, parseInt(annualInstallmentsCount.value, 10) || (isRentToOwn ? 3 : 2)));
  const interval = Math.max(1, parseInt(annualInstallmentsInterval.value, 10) || 1);
  const firstDate = annualDateInput.value;
  if (!Number.isFinite(amount) || amount <= 0) {
    annualInstallmentPreview.innerHTML = 'Informe o valor para visualizar a transformação.';
    return;
  }

  const lastDate = firstDate ? addMonthsToAnnualDate(firstDate, (count - 1) * interval) : '';
  if (isRentToOwn) {
    const rentalPayment = parseAmount(annualRentalAmount?.value);
    if (!Number.isFinite(rentalPayment) || rentalPayment <= 0) {
      annualInstallmentPreview.innerHTML = 'Informe o valor do aluguel para visualizar o controle.';
      return;
    }
    const monthlyRental = paymentFrequency === 'biweekly' ? convertBiweeklyToMonthly(rentalPayment) : rentalPayment;
    const rentalCredit = Math.min(amount, Math.round(monthlyRental * count * 100) / 100);
    const remainingBalance = Math.max(0, Math.round((amount - rentalCredit) * 100) / 100);
    const buyAtEnd = Boolean(annualRentBuyAtEnd?.checked);
    const lastRentalDate = firstDate ? addMonthsToAnnualDate(firstDate, count - 1) : '';
    const buyoutDate = firstDate ? addMonthsToAnnualDate(firstDate, count) : '';
    annualInstallmentPreview.innerHTML = `<strong>${count} ${count === 1 ? 'mês' : 'meses'} de aluguel</strong> × ${formatCurrency(monthlyRental)} = ${formatCurrency(rentalCredit)} em créditos${paymentFrequency === 'biweekly' ? `<br>${formatCurrency(rentalPayment)} a cada duas semanas → ${formatCurrency(monthlyRental)} por mês no orçamento.` : ''}<br>Saldo estimado para compra: <strong>${formatCurrency(remainingBalance)}</strong>${lastRentalDate ? `<br>Aluguel até ${formatShortDate(lastRentalDate)}.` : ''}${buyAtEnd && buyoutDate ? ` Compra pelo saldo em <strong>${formatShortDate(buyoutDate)}</strong>.` : '<br>Sem compra automática ao final.'}`;
  } else if (mode === 'purchase') {
    const rate = Number(annualInterestRate?.value);
    if (usesInterest && (!Number.isFinite(rate) || rate <= 0)) {
      annualInstallmentPreview.innerHTML = 'Informe a taxa anual para calcular as parcelas.';
      return;
    }
    if (usesInterest && interestType === 'mortgage' && (!Number(annualMortgageAmortization?.value) || Number(annualMortgageAmortization.value) <= 0)) {
      annualInstallmentPreview.innerHTML = 'Informe quantos anos ainda faltam na amortização da hipoteca.';
      return;
    }

    const calculation = paymentFrequency === 'biweekly' || usesInterest ? calculateInstallmentScheduleWithInterest(amount, usesInterest ? rate : 0, count, interestType, paymentFrequency) : null;
    const portions = calculation?.amounts || distributeCurrencyAmount(amount, count);
    const grouped = portions.reduce((result, value) => {
      const key = value.toFixed(2);
      result[key] = (result[key] || 0) + 1;
      return result;
    }, {});
    const composition = Object.entries(grouped)
      .map(([value, quantity]) => `${quantity} × ${formatCurrency(Number(value))}`)
      .join(' + ');
    annualInstallmentPreview.innerHTML = paymentFrequency === 'biweekly'
      ? `<strong>${calculation.paymentCount} pagamentos bisemanais de aproximadamente ${formatCurrency(calculation.periodicPayment)}</strong><br>No orçamento mensal: <strong>${formatCurrency(calculation.monthlyEquivalent)}</strong> (26 pagamentos ÷ 12 meses)<br>${usesInterest ? `Valor financiado: ${formatCurrency(amount)} • Juros estimados: ${formatCurrency(calculation.totalInterest)} • Total estimado: ${formatCurrency(calculation.totalPaid)}` : `Valor total da compra: ${formatCurrency(amount)}`}${lastDate ? `<br>Controle mensal de ${formatShortDate(firstDate)} até ${formatShortDate(lastDate)}.` : ''}`
      : usesInterest
        ? `<strong>${count} parcelas mensais de aproximadamente ${formatCurrency(calculation.periodicPayment)}</strong><br>Valor financiado: ${formatCurrency(amount)} • Juros estimados: ${formatCurrency(calculation.totalInterest)} • Total estimado: ${formatCurrency(calculation.totalPaid)}${lastDate ? `<br>De ${formatShortDate(firstDate)} até ${formatShortDate(lastDate)}.` : ''}`
        : `<strong>${count} parcelas:</strong> ${composition} = ${formatCurrency(amount)}${lastDate ? `<br>De ${formatShortDate(firstDate)} até ${formatShortDate(lastDate)}.` : ''}`;
  } else {
    const repeatedAmount = paymentFrequency === 'biweekly' ? convertBiweeklyToMonthly(amount) : amount;
    annualInstallmentPreview.innerHTML = `<strong>${count} lançamentos</strong> de ${formatCurrency(repeatedAmount)} • Total do período: ${formatCurrency(repeatedAmount * count)}${paymentFrequency === 'biweekly' ? `<br>${formatCurrency(amount)} a cada duas semanas → ${formatCurrency(repeatedAmount)} por mês no orçamento.` : ''}${lastDate ? `<br>De ${formatShortDate(firstDate)} até ${formatShortDate(lastDate)}.` : ''}`;
  }
}

if (annualInstallmentCheck) {
  annualInstallmentCheck.addEventListener('change', updateAnnualInstallmentBuilder);
}
annualInstallmentModeInputs.forEach((input) => input.addEventListener('change', updateAnnualInstallmentBuilder));
annualInterestCheck?.addEventListener('change', updateAnnualInstallmentBuilder);
annualInterestTypeInputs.forEach((input) => input.addEventListener('change', updateAnnualInstallmentBuilder));
annualPaymentFrequencyInputs.forEach((input) => input.addEventListener('change', updateAnnualInstallmentBuilder));
[annualAmountInput, annualDateInput, annualInstallmentsCount, annualInstallmentsInterval, annualInterestRate, annualMortgageAmortization, annualRentalAmount].forEach((input) =>
  input?.addEventListener('input', updateAnnualInstallmentBuilder),
);
annualRentBuyAtEnd?.addEventListener('change', updateAnnualInstallmentBuilder);

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

function getInstallmentPlan(planId) {
  return installmentPlans.find((plan) => plan.id === planId) || null;
}

function canFullyEditInstallmentPlan(plan) {
  const installments = plan?.installments || [];
  const protectedInstallments = installments.filter((installment) => ['paid', 'budgeted'].includes(installment.status));
  if (protectedInstallments.length === 0) return true;

  // A primeira parcela de uma compra nova é criada automaticamente no Orçamento
  // e em Notas. Enquanto ela for o único histórico, os dois registros ainda podem
  // ser reconstruídos com segurança pela edição completa do cadastro.
  if (plan.automationMode !== 'fixed-static-clone' || protectedInstallments.length !== 1) return false;
  const firstInstallment = protectedInstallments[0];
  return Number(firstInstallment.number) === 1 && Boolean(firstInstallment.plannedId && firstInstallment.receiptId);
}

async function deleteInstallmentLinkedRecords(plan, keep = {}) {
  if (!plan) return;
  const keepAnnualEventIds = keep.annualEventIds || new Set();
  const keepPlannedKeys = keep.plannedKeys || new Set();
  const keepReceiptKeys = keep.receiptKeys || new Set();
  const deletedAnnualEventIds = new Set();
  const deletedPlannedKeys = new Set();
  const deletedReceiptKeys = new Set();

  for (const installment of plan.installments || []) {
    if (installment.annualEventId && !keepAnnualEventIds.has(installment.annualEventId) && !deletedAnnualEventIds.has(installment.annualEventId)) {
      await FinanceAPI.deleteAnnualEvent(installment.annualEventId);
      deletedAnnualEventIds.add(installment.annualEventId);
    }

    const plannedMonth = installment.plannedMonth || installment.targetDate?.substring(0, 7);
    const plannedKey = plannedMonth && installment.plannedId ? `${plannedMonth}:${installment.plannedId}` : '';
    if (plannedKey && !keepPlannedKeys.has(plannedKey) && !deletedPlannedKeys.has(plannedKey)) {
      await FinanceAPI.deletePlanned(plannedMonth, installment.plannedId);
      deletedPlannedKeys.add(plannedKey);
    }

    const receiptMonth = installment.receiptMonth || installment.targetDate?.substring(0, 7);
    const receiptKey = receiptMonth && installment.receiptId ? `${receiptMonth}:${installment.receiptId}` : '';
    if (receiptKey && !keepReceiptKeys.has(receiptKey) && !deletedReceiptKeys.has(receiptKey)) {
      await FinanceAPI.deleteReceipt(receiptMonth, installment.receiptId);
      deletedReceiptKeys.add(receiptKey);
    }
  }
}

async function updateInstallmentPlanEntry(planId, installmentNumber, changes) {
  const plan = getInstallmentPlan(planId);
  if (!plan) return;
  const updatedInstallments = (plan.installments || []).map((installment) =>
    installment.number === Number(installmentNumber) ? { ...installment, ...changes } : installment,
  );
  const updatedPlan = {
    ...plan,
    installments: updatedInstallments,
    totalAmount: updatedInstallments.reduce((total, installment) => total + (Number(installment.amount) || 0), 0),
    updatedAt: new Date().toISOString(),
  };
  await FinanceAPI.saveInstallmentPlan(updatedPlan);
}

function getInstallmentStatusPresentation(status) {
  if (status === 'paid') return { label: 'Paga', className: 'paid' };
  if (status === 'budgeted') return { label: 'No orçamento', className: 'budgeted' };
  if (status === 'cancelled') return { label: 'Cancelada', className: 'cancelled' };
  return { label: 'Pendente', className: 'pending' };
}

function renderInstallmentPlans() {
  if (!installmentPlansCard || !installmentPlansList) return;
  const activePlans = installmentPlans
    .filter((plan) => (plan.installments || []).some((installment) => !['paid', 'cancelled'].includes(installment.status)))
    .sort((a, b) => String(a.startDate || '').localeCompare(String(b.startDate || '')));

  installmentPlansCard.hidden = activePlans.length === 0;
  installmentPlansList.innerHTML = '';
  if (activePlans.length === 0) return;

  activePlans.forEach((plan) => {
    const installments = plan.installments || [];
    const paid = installments.filter((installment) => installment.status === 'paid');
    const paidAmount = paid.reduce((total, installment) => total + Math.abs(Number(installment.paidAmount ?? installment.amount) || 0), 0);
    const totalAmount = Math.abs(Number(plan.totalAmount) || installments.reduce((total, installment) => total + Math.abs(Number(installment.amount) || 0), 0));
    const progress = plan.mode === 'rent_to_own' && totalAmount > 0
      ? Math.min(100, (paidAmount / totalAmount) * 100)
      : installments.length
        ? Math.min(100, (paid.length / installments.length) * 100)
        : 0;
    const canFullyEdit = canFullyEditInstallmentPlan(plan);
    const modeLabel = plan.mode === 'repeat' ? 'Repetição' : plan.mode === 'rent_to_own' ? 'Aluguel → compra' : 'Parcelamento';
    const interestLabel = plan.hasInterest
      ? `${plan.interestType === 'mortgage' ? 'Hipoteca' : 'Financiamento'} • ${Number(plan.annualInterestRate).toLocaleString('pt-BR')}% a.a.${plan.paymentFrequency === 'biweekly' ? ' • Bisemanal → mensal' : ''}`
      : '';
    const rentalLabel = plan.mode === 'rent_to_own'
      ? ` • ${plan.rentalMonths} ${Number(plan.rentalMonths) === 1 ? 'mês' : 'meses'} de aluguel${plan.buyAtEnd ? ' • compra automática pelo saldo' : ''}${plan.paymentFrequency === 'biweekly' ? ' • Bisemanal → mensal' : ''}`
      : '';
    const paidRentals = paid.filter((installment) => installment.type === 'rental');
    const futureRentals = installments.filter((installment) => installment.type === 'rental' && !['paid', 'cancelled'].includes(installment.status));
    const rentalCreditPaid = paidRentals.reduce((total, installment) => total + Math.abs(Number(installment.paidAmount ?? installment.amount) || 0), 0);
    const remainingBuyout = Math.max(0, Math.round((Math.abs(Number(plan.assetPrice || plan.principalAmount) || 0) - rentalCreditPaid) * 100) / 100);
    const countLabel = plan.mode === 'rent_to_own'
      ? `${paidRentals.length} de ${plan.rentalMonths} aluguéis pagos${plan.buyAtEnd ? ` • saldo ${formatCurrency(remainingBuyout)}` : ''}`
      : `${paid.length} de ${installments.length} pagas`;
    const details = document.createElement('details');
    details.className = 'installment-plan';
    details.innerHTML = `
      <summary class="installment-plan-summary">
        <div class="installment-plan-title">
          <div class="installment-plan-title-line">
            <strong>${escapeCardDetail(plan.name || 'Sem nome')}</strong>
            <span class="installment-plan-badge">${modeLabel}</span>
          </div>
          <div class="installment-plan-meta">${escapeCardDetail(plan.category || '')} • ${escapeCardDetail(plan.owner || '')} • início em ${formatShortDate(plan.startDate)}${interestLabel ? ` • ${interestLabel}` : ''}${rentalLabel}</div>
        </div>
        <div class="installment-plan-numbers">
          <strong>${formatCurrency(paidAmount)}</strong> de ${formatCurrency(totalAmount)}
          <div class="installment-plan-count">${countLabel}</div>
        </div>
        <div class="installment-plan-progress" aria-label="${progress.toFixed(0)}% concluído"><span style="width:${progress}%"></span></div>
      </summary>
      <div class="installment-plan-installments">
        ${installments
          .map((installment) => {
            const presentation = getInstallmentStatusPresentation(installment.status);
            const stageLabel = getInstallmentStageLabel(installment, plan);
            return `<div class="installment-plan-item">
              <strong>${stageLabel || `${installment.number}/${installments.length}`}</strong>
              <span>${formatShortDate(installment.targetDate)} • ${formatCurrency(Math.abs(installment.amount))}</span>
              <span class="installment-status installment-status--${presentation.className}">${presentation.label}</span>
            </div>`;
          })
          .join('')}
      </div>
      <div class="installment-plan-actions">
        <button type="button" class="action-btn${canFullyEdit ? '' : ' is-locked'}" onclick="startEditInstallmentPlan('${plan.id}', event)" title="${canFullyEdit ? 'Voltar este parcelamento ao formulário' : 'Há parcelas lançadas; o histórico está protegido'}">${canFullyEdit ? 'Editar cadastro' : '🔒 Editar cadastro'}</button>
        ${plan.mode !== 'rent_to_own' || futureRentals.length > 0 ? `<button type="button" class="action-btn" onclick="adjustFutureInstallments('${plan.id}', event)">${plan.mode === 'rent_to_own' ? 'Ajustar aluguéis' : 'Ajustar futuras'}</button>` : ''}
        ${
          canFullyEdit
            ? `<button type="button" class="action-btn danger" onclick="deleteInstallmentPlanFully('${plan.id}', event)">Excluir parcelamento</button>`
            : `<button type="button" class="action-btn danger" onclick="cancelFutureInstallments('${plan.id}', event)">Encerrar parcelamento</button>`
        }
      </div>
    `;
    installmentPlansList.appendChild(details);
  });
}

window.startEditInstallmentPlan = function (planId, event) {
  event?.preventDefault();
  event?.stopPropagation();
  const plan = getInstallmentPlan(planId);
  if (!plan) return showToast('Não foi possível localizar o parcelamento.', 'error');
  if (!canFullyEditInstallmentPlan(plan)) {
    return showToast('Este parcelamento já possui parcela lançada ou paga. Para proteger o histórico, ajuste somente as parcelas futuras.', 'info');
  }

  editingInstallmentPlanId = plan.id;
  editingAnnualId = null;
  annualNameInput.value = plan.name || '';
  annualCategoryInput.value = plan.category || '';
  annualDateInput.value = plan.startDate || '';
  annualAmountInput.value = Math.abs(Number(plan.principalAmount ?? plan.totalAmount) || 0);
  annualOwnerSelect.value = plan.owner || 'Ambos';
  annualPaymentSelect.value = plan.paymentMethodId || 'dinheiro';
  annualObservationInput.value = plan.observation || '';
  const incomeCheck = document.getElementById('annual-is-income');
  if (incomeCheck) incomeCheck.checked = Boolean(plan.isIncome);
  if (annualInstallmentCheck) {
    annualInstallmentCheck.checked = true;
    annualInstallmentCheck.parentElement.parentElement.style.display = 'flex';
  }
  annualInstallmentModeInputs.forEach((input) => (input.checked = input.value === (plan.mode || 'purchase')));
  annualInstallmentsCount.value = String(plan.mode === 'rent_to_own' ? plan.rentalMonths || 3 : plan.installmentCount || plan.installments?.length || 2);
  annualInstallmentsInterval.value = String(plan.intervalMonths || 1);
  if (annualRentalAmount) annualRentalAmount.value = plan.mode === 'rent_to_own' ? Math.abs(Number(plan.rentalAmount) || 0) : '';
  if (annualRentBuyAtEnd) annualRentBuyAtEnd.checked = plan.mode === 'rent_to_own' ? Boolean(plan.buyAtEnd) : true;
  if (annualInterestCheck) annualInterestCheck.checked = Boolean(plan.hasInterest);
  annualInterestTypeInputs.forEach((input) => (input.checked = input.value === (plan.interestType || 'financing')));
  annualPaymentFrequencyInputs.forEach((input) => (input.checked = input.value === (plan.paymentFrequency || 'monthly')));
  if (annualInterestRate) annualInterestRate.value = plan.annualInterestRate || '';
  if (annualMortgageAmortization) annualMortgageAmortization.value = plan.amortizationYears || '';
  if (annualOneOffCheckbox) annualOneOffCheckbox.checked = true;

  selectedAnnualType = plan.category || getCategories()[0] || '';
  updateAnnualChips();
  updateAnnualInstallmentBuilder();
  annualSubmitBtn.textContent = 'Salvar alterações do parcelamento';
  formAnnual.scrollIntoView({ behavior: 'smooth', block: 'start' });
  showToast('Parcelamento carregado para edição.', 'info');
};

window.adjustFutureInstallments = async function (planId, event) {
  event?.preventDefault();
  event?.stopPropagation();
  const plan = getInstallmentPlan(planId);
  const allFuture = plan?.installments?.filter((installment) => !['paid', 'cancelled'].includes(installment.status)) || [];
  const future = plan?.mode === 'rent_to_own' ? allFuture.filter((installment) => installment.type === 'rental') : allFuture;
  if (!plan || future.length === 0) return showToast('Não há parcelas futuras para ajustar.', 'info');

  const currentSourceValue = plan.mode === 'rent_to_own' && plan.paymentFrequency === 'biweekly' ? plan.rentalAmount : future[0].amount;
  const currentValue = Math.abs(Number(currentSourceValue) || 0).toFixed(2).replace('.', ',');
  const answer = await showPrompt(
    plan.mode === 'rent_to_own'
      ? `Novo valor para os ${future.length} aluguéis futuros de "${plan.name}"?\n\nO saldo final para compra será recalculado. Os aluguéis já pagos não serão alterados.`
      : `Novo valor para as ${future.length} parcelas futuras de "${plan.name}"?\n\nAs parcelas já pagas não serão alteradas.`,
    currentValue,
  );
  if (answer === null) return;
  const newAmount = parseAmount(answer);
  if (!Number.isFinite(newAmount) || newAmount <= 0) return showToast('Informe um valor válido.', 'error');
  if (!(await showConfirm(`Aplicar ${formatCurrency(newAmount)} em ${plan.mode === 'rent_to_own' ? 'todos os aluguéis futuros' : 'todas as parcelas futuras'}?`))) return;

  if (plan.mode === 'rent_to_own') {
    const monthlyRental = plan.paymentFrequency === 'biweekly' ? convertBiweeklyToMonthly(newAmount) : newAmount;
    const signedRental = plan.isIncome ? -monthlyRental : monthlyRental;
    const futureRentalNumbers = new Set(future.map((installment) => installment.number));
    const paidRentalCredit = (plan.installments || [])
      .filter((installment) => installment.type === 'rental' && installment.status === 'paid')
      .reduce((total, installment) => total + Math.abs(Number(installment.paidAmount ?? installment.amount) || 0), 0);
    const projectedCredit = Math.min(
      Math.abs(Number(plan.assetPrice || plan.principalAmount) || 0),
      Math.round((paidRentalCredit + monthlyRental * future.length) * 100) / 100,
    );
    const buyoutAmount = Math.max(0, Math.round((Math.abs(Number(plan.assetPrice || plan.principalAmount) || 0) - projectedCredit) * 100) / 100);
    const updatedInstallments = plan.installments.map((installment) => {
      if (futureRentalNumbers.has(installment.number)) return { ...installment, amount: signedRental };
      if (installment.type === 'buyout' && !['paid', 'cancelled'].includes(installment.status)) {
        return { ...installment, amount: plan.isIncome ? -buyoutAmount : buyoutAmount };
      }
      return installment;
    });
    await FinanceAPI.saveInstallmentPlan({
      ...plan,
      installments: updatedInstallments,
      rentalAmount: newAmount,
      rentalMonthlyAmount: monthlyRental,
      paymentAmount: newAmount,
      monthlyEquivalentAmount: monthlyRental,
      projectedRentalCredit: projectedCredit,
      projectedBuyoutAmount: buyoutAmount,
      totalAmount: updatedInstallments.reduce((total, installment) => total + (Number(installment.amount) || 0), 0),
      futureAmountAdjusted: true,
      updatedAt: new Date().toISOString(),
    });
    showToast('Aluguéis futuros e saldo para compra recalculados.', 'success');
    return;
  }

  const signedAmount = plan.isIncome ? -Math.abs(newAmount) : Math.abs(newAmount);
  const futureNumbers = new Set(future.map((installment) => installment.number));
  const updatedInstallments = plan.installments.map((installment) => (futureNumbers.has(installment.number) ? { ...installment, amount: signedAmount } : installment));

  for (const installment of future) {
    if (!installment.annualEventId) continue;
    const eventItem = annualEvents.find((annualEvent) => annualEvent.id === installment.annualEventId);
    if (eventItem) await FinanceAPI.saveAnnualEvent({ ...eventItem, id: eventItem.id, amount: signedAmount });
  }

  await FinanceAPI.saveInstallmentPlan({
    ...plan,
    installments: updatedInstallments,
    totalAmount: updatedInstallments.reduce((total, installment) => total + (Number(installment.amount) || 0), 0),
    paymentAmount: plan.paymentFrequency === 'biweekly' ? Math.round(newAmount * (12 / 26) * 100) / 100 : newAmount,
    monthlyEquivalentAmount: newAmount,
    futureAmountAdjusted: true,
    updatedAt: new Date().toISOString(),
  });
  showToast('Parcelas futuras ajustadas.', 'success');
};

window.deleteInstallmentPlanFully = async function (planId, event) {
  event?.preventDefault();
  event?.stopPropagation();
  const plan = getInstallmentPlan(planId);
  if (!plan) return showToast('Não foi possível localizar o parcelamento.', 'error');
  if (!canFullyEditInstallmentPlan(plan)) {
    return showToast('Este parcelamento já possui histórico em outros meses. Encerre-o para preservar os lançamentos pagos.', 'info');
  }

  const linkedPlannedCount = (plan.installments || []).filter((installment) => installment.plannedId).length;
  const linkedReceiptCount = (plan.installments || []).filter((installment) => installment.receiptId).length;
  const message = `Excluir todo o parcelamento "${plan.name}"?\n\nTambém serão removidos ${linkedPlannedCount} item(ns) do Orçamento e ${linkedReceiptCount} lançamento(s) de Notas vinculados. Esta ação não pode ser desfeita.`;
  if (!(await showConfirm(message, true))) return;

  try {
    await deleteInstallmentLinkedRecords(plan);
    await FinanceAPI.deleteInstallmentPlan(plan.id);
    logActivity('Excluiu', `Parcelamento completo: ${plan.name}`);
    showToast('Parcelamento e lançamentos vinculados excluídos.', 'success');
  } catch (error) {
    console.error('Erro ao excluir parcelamento completo:', error);
    showToast('Não foi possível excluir todo o parcelamento. Tente novamente.', 'error');
  }
};

window.cancelFutureInstallments = async function (planId, event) {
  event?.preventDefault();
  event?.stopPropagation();
  const plan = getInstallmentPlan(planId);
  const future = plan?.installments?.filter((installment) => !['paid', 'cancelled'].includes(installment.status)) || [];
  if (!plan || future.length === 0) return showToast('Este parcelamento já foi encerrado.', 'info');
  if (!(await showConfirm(`Encerrar "${plan.name}" e cancelar as ${future.length} parcelas futuras? O histórico já pago será preservado.`, true))) return;

  for (const installment of future) {
    if (installment.annualEventId) await FinanceAPI.deleteAnnualEvent(installment.annualEventId);
  }
  const futureNumbers = new Set(future.map((installment) => installment.number));
  await FinanceAPI.saveInstallmentPlan({
    ...plan,
    status: 'cancelled',
    installments: plan.installments.map((installment) =>
      futureNumbers.has(installment.number) ? { ...installment, status: 'cancelled', annualEventId: null } : installment,
    ),
    cancelledAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  showToast('Parcelamento encerrado. O histórico pago foi mantido.', 'success');
};

if (formAnnual) {
  formAnnual.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = annualNameInput.value.trim();
    const category = annualCategoryInput.value.trim();
    const dateVal = annualDateInput.value;
    const [targetYear, monthTarget, dayTarget] = dateVal ? dateVal.split('-') : ['', '', ''];
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

    try {
      await autoRegisterCompany(category, name);

      const isInstallment = Boolean(annualInstallmentCheck?.checked && !editingAnnualId);
      if (isInstallment) {
        const mode = getAnnualInstallmentMode();
        const isRentToOwn = mode === 'rent_to_own';
        const count = Math.min(600, Math.max(isRentToOwn ? 1 : 2, parseInt(annualInstallmentsCount.value, 10) || (isRentToOwn ? 3 : 2)));
        const interval = mode === 'purchase' || isRentToOwn ? 1 : Math.min(12, Math.max(1, parseInt(annualInstallmentsInterval.value, 10) || 1));
        const hasInterest = mode === 'purchase' && Boolean(annualInterestCheck?.checked);
        const interestType = getAnnualInterestType();
        const paymentFrequency = getAnnualPaymentFrequency();
        const annualRate = hasInterest ? Number(annualInterestRate?.value) : 0;
        const amortizationYears = hasInterest && interestType === 'mortgage' ? Number(annualMortgageAmortization?.value) : null;
        const rentalPayment = isRentToOwn ? parseAmount(annualRentalAmount?.value) : null;
        const buyAtEnd = isRentToOwn ? Boolean(annualRentBuyAtEnd?.checked) : false;

        if (hasInterest && (!Number.isFinite(annualRate) || annualRate <= 0)) {
          return showToast('Informe uma taxa anual válida.', 'error');
        }
        if (hasInterest && interestType === 'mortgage' && (!Number.isFinite(amortizationYears) || amortizationYears <= 0)) {
          return showToast('Informe a amortização restante da hipoteca.', 'error');
        }
        if (isRentToOwn && (!Number.isFinite(rentalPayment) || rentalPayment <= 0)) {
          return showToast('Informe o valor mensal do aluguel.', 'error');
        }

        const paymentCalculation = mode === 'purchase' && (hasInterest || paymentFrequency === 'biweekly')
          ? calculateInstallmentScheduleWithInterest(rawAmount, annualRate, count, interestType, paymentFrequency)
          : null;
        const rentCalculation = isRentToOwn
          ? buildRentToOwnSchedule({
              assetPrice: rawAmount,
              rentalPayment,
              rentalMonths: count,
              startDate: dateVal,
              paymentFrequency,
              buyAtEnd,
              isIncome,
            })
          : null;
        const repeatedMonthlyAmount = mode === 'repeat' && paymentFrequency === 'biweekly' ? convertBiweeklyToMonthly(rawAmount) : Math.abs(rawAmount);
        const absoluteAmounts = mode === 'purchase'
          ? paymentCalculation?.amounts || distributeCurrencyAmount(rawAmount, count)
          : Array.from({ length: count }, () => repeatedMonthlyAmount);
        const signedAmounts = absoluteAmounts.map((value) => (isIncome ? -value : value));
        const schedule = rentCalculation?.schedule || signedAmounts.map((installmentAmount, index) => ({
          number: index + 1,
          amount: installmentAmount,
          targetDate: addMonthsToAnnualDate(dateVal, index * interval),
          status: 'pending',
        }));
        const scheduleCount = schedule.length;
        const existingPlan = editingInstallmentPlanId ? getInstallmentPlan(editingInstallmentPlanId) : null;
        if (editingInstallmentPlanId && !existingPlan) return showToast('Não foi possível localizar o parcelamento em edição.', 'error');
        if (existingPlan && !canFullyEditInstallmentPlan(existingPlan)) {
          return showToast('O histórico deste parcelamento mudou durante a edição. Ajuste somente as parcelas futuras.', 'info');
        }

        const planData = {
          name,
          category,
          owner,
          paymentMethodId,
          observation,
          isIncome,
          mode,
          automationMode: mode === 'purchase' || isRentToOwn ? 'fixed-static-clone' : 'annual-events',
          status: 'active',
          startDate: dateVal,
          intervalMonths: interval,
          installmentCount: scheduleCount,
          principalAmount: mode === 'purchase' || isRentToOwn ? Math.abs(rawAmount) : null,
          totalAmount: schedule.reduce((total, value) => total + (Number(value.amount) || 0), 0),
          hasInterest,
          interestType: hasInterest ? interestType : null,
          annualInterestRate: hasInterest ? annualRate : null,
          paymentFrequency,
          paymentCount: paymentCalculation?.paymentCount || count,
          paymentAmount: isRentToOwn ? Math.abs(rentalPayment) : paymentCalculation?.periodicPayment || (paymentFrequency === 'biweekly' ? Math.abs(rawAmount) : null),
          monthlyEquivalentAmount: isRentToOwn ? rentCalculation.monthlyRental : paymentCalculation?.monthlyEquivalent || (paymentFrequency === 'biweekly' ? repeatedMonthlyAmount : null),
          amortizationYears: hasInterest && interestType === 'mortgage' ? amortizationYears : null,
          estimatedInterest: paymentCalculation?.totalInterest || 0,
          rentalMonths: isRentToOwn ? count : null,
          rentalAmount: isRentToOwn ? Math.abs(rentalPayment) : null,
          rentalMonthlyAmount: isRentToOwn ? rentCalculation.monthlyRental : null,
          assetPrice: isRentToOwn ? Math.abs(rawAmount) : null,
          buyAtEnd: isRentToOwn ? buyAtEnd : null,
          projectedRentalCredit: isRentToOwn ? rentCalculation.creditedRental : null,
          projectedBuyoutAmount: isRentToOwn ? rentCalculation.buyoutAmount : null,
          installments: schedule,
          createdAt: existingPlan?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        if (existingPlan) planData.id = existingPlan.id;
        const planId = existingPlan ? existingPlan.id : await FinanceAPI.saveInstallmentPlan(planData);
        const savedSchedule = [];

        if (mode === 'purchase' || isRentToOwn) {
          const firstInstallment = schedule[0];
          const targetMonth = firstInstallment.targetDate.substring(0, 7);
          const currentName = isRentToOwn ? `${name} • ${getInstallmentStageLabel(firstInstallment, planData)}` : `${name} (1/${scheduleCount})`;
          const staticSyncId = `installment_${planId}_1`;
          const previousFirstInstallment = existingPlan?.installments?.find((installment) => Number(installment.number) === 1);
          const previousPlannedMonth = previousFirstInstallment?.plannedMonth || previousFirstInstallment?.targetDate?.substring(0, 7);
          const previousReceiptMonth = previousFirstInstallment?.receiptMonth || previousFirstInstallment?.targetDate?.substring(0, 7);
          const plannedData = {
            date: firstInstallment.targetDate,
            category,
            description: currentName,
            amount: firstInstallment.amount,
            owner,
            paymentMethodId,
            observation,
            fixed: true,
            isStatic: true,
            month: targetMonth,
            staticSyncId,
            installmentPlanId: planId,
            installmentNumber: 1,
            installmentCount: scheduleCount,
            installmentMode: mode,
            installmentStage: firstInstallment.type || null,
            rentalNumber: firstInstallment.rentalNumber || null,
            rentalCount: firstInstallment.rentalCount || null,
            installmentOriginalName: name,
            installmentAutomationMode: 'fixed-static-clone',
          };
          if (previousFirstInstallment?.plannedId && previousPlannedMonth === targetMonth) {
            plannedData.id = previousFirstInstallment.plannedId;
          }
          if (paymentFrequency === 'biweekly') {
            plannedData.isBiweeklyConverted = true;
            plannedData.biweeklyAmount = isRentToOwn ? rentalPayment : paymentCalculation?.periodicPayment || rawAmount;
            plannedData.biweeklyMonthlyAmount = firstInstallment.amount;
          }
          const plannedId = await FinanceAPI.savePlanned(targetMonth, plannedData);
          const receiptData = {
            date: firstInstallment.targetDate,
            category,
            merchant: currentName,
            amount: firstInstallment.amount,
            owner,
            paymentMethodId,
            observation,
            isStatic: true,
            staticSyncId,
            linkedPlannedId: plannedId,
            installmentPlanId: planId,
            installmentNumber: 1,
            installmentCount: scheduleCount,
            installmentMode: mode,
            installmentStage: firstInstallment.type || null,
            rentalNumber: firstInstallment.rentalNumber || null,
            rentalCount: firstInstallment.rentalCount || null,
            installmentOriginalName: name,
            installmentAutomationMode: 'fixed-static-clone',
          };
          if (previousFirstInstallment?.receiptId && previousReceiptMonth === targetMonth) {
            receiptData.id = previousFirstInstallment.receiptId;
          }
          if (paymentFrequency === 'biweekly') {
            receiptData.isBiweeklyConverted = true;
            receiptData.biweeklyAmount = isRentToOwn ? rentalPayment : paymentCalculation?.periodicPayment || rawAmount;
            receiptData.biweeklyMonthlyAmount = firstInstallment.amount;
          }
          const receiptId = await FinanceAPI.saveReceipt(targetMonth, receiptData);
          savedSchedule.push({
            ...firstInstallment,
            status: 'paid',
            plannedId,
            plannedMonth: targetMonth,
            receiptId,
            receiptMonth: targetMonth,
            paidAmount: firstInstallment.amount,
            paidAt: firstInstallment.targetDate,
          });
          savedSchedule.push(...schedule.slice(1));
          await FinanceAPI.saveInstallmentPlan({
            ...planData,
            id: planId,
            status: scheduleCount === 1 ? 'completed' : 'active',
            installments: savedSchedule,
            completedAt: scheduleCount === 1 ? firstInstallment.targetDate : null,
            updatedAt: new Date().toISOString(),
          });
          if (existingPlan) {
            await deleteInstallmentLinkedRecords(existingPlan, {
              plannedKeys: new Set([`${targetMonth}:${plannedId}`]),
              receiptKeys: new Set([`${targetMonth}:${receiptId}`]),
            });
          }
          const wasEditingPlan = Boolean(existingPlan);
          resetAnnualForm();
          showToast(
            wasEditingPlan
              ? 'Controle atualizado e recriado sem duplicar pagamentos.'
              : isRentToOwn
                ? `Aluguel controlado por ${count} ${count === 1 ? 'mês' : 'meses'}${buyAtEnd ? '; a compra pelo saldo entrará no mês seguinte.' : '.'}`
                : 'Parcelamento criado como Fixo e Estático. A próxima parcela entrará ao clonar o mês.',
            'success',
          );
          return;
        }

        for (const installment of schedule) {
          const [, currentTargetMonth, currentDay] = installment.targetDate.split('-');
          const currentTargetYear = installment.targetDate.split('-')[0];
          const currentName = `${name} (${installment.number}/${scheduleCount})`;
          const itemData = {
            name: currentName,
            installmentOriginalName: name,
            category,
            monthTarget: currentTargetMonth,
            targetYear: currentTargetYear,
            dayTarget: currentDay,
            amount: installment.amount,
            owner,
            paymentMethodId,
            observation,
            isOneOff: true,
            isIncome,
            installmentPlanId: planId,
            installmentNumber: installment.number,
            installmentCount: scheduleCount,
            installmentMode: mode,
          };
          if (paymentFrequency === 'biweekly') {
            itemData.isBiweeklyConverted = true;
            itemData.biweeklyAmount = rawAmount;
            itemData.biweeklyMonthlyAmount = installment.amount;
          }
          const annualEventId = await FinanceAPI.saveAnnualEvent(itemData);
          savedSchedule.push({ ...installment, annualEventId });
          logActivity('Adicionou', `Evento Anual: ${currentName} - ${formatCurrency(installment.amount)}`);
        }

        await FinanceAPI.saveInstallmentPlan({ ...planData, id: planId, installments: savedSchedule, updatedAt: new Date().toISOString() });
        if (existingPlan) {
          await deleteInstallmentLinkedRecords(existingPlan, {
            annualEventIds: new Set(savedSchedule.map((installment) => installment.annualEventId).filter(Boolean)),
          });
        }
        const wasEditingPlan = Boolean(existingPlan);
        resetAnnualForm();
        showToast(wasEditingPlan ? 'Planejamento atualizado sem duplicar lançamentos.' : mode === 'purchase' ? `Compra dividida em ${count} parcelas.` : `${count} repetições programadas.`, 'success');
        return;
      }

      const oldEvent = editingAnnualId ? annualEvents.find((event) => event.id === editingAnnualId) : null;
      const itemData = {
        ...(oldEvent || {}),
        name,
        category,
        monthTarget,
        dayTarget,
        amount,
        owner,
        paymentMethodId,
        observation,
        isOneOff,
        isIncome,
      };
      if (editingAnnualId) itemData.id = editingAnnualId;
      if (oldEvent?.installmentPlanId) itemData.targetYear = targetYear;
      await FinanceAPI.saveAnnualEvent(itemData);
      if (oldEvent?.installmentPlanId) {
        await updateInstallmentPlanEntry(oldEvent.installmentPlanId, oldEvent.installmentNumber, {
          amount,
          targetDate: `${targetYear}-${monthTarget}-${dayTarget}`,
        });
      }
      logActivity(editingAnnualId ? 'Editou' : 'Adicionou', `Evento Anual: ${name} - ${formatCurrency(amount)}`);
      resetAnnualForm();
      showToast(editingAnnualId ? 'Evento anual atualizado.' : 'Evento anual salvo com sucesso!', 'success');
    } catch (error) {
      console.error('Erro ao salvar planejamento anual:', error);
      showToast('Não foi possível salvar o planejamento.', 'error');
    } finally {
      annualSubmitBtn.textContent = editingInstallmentPlanId ? 'Salvar alterações do parcelamento' : editingAnnualId ? 'Salvar Alterações' : 'Salvar Evento Anual';
      annualSubmitBtn.disabled = false;
    }
  });
}

function resetAnnualForm() {
  formAnnual.reset();
  editingAnnualId = null;
  editingInstallmentPlanId = null;
  annualSubmitBtn.textContent = 'Salvar Evento Anual';

  selectedAnnualType = getCategories()[0] || '';
  if (annualCategoryInput) annualCategoryInput.value = selectedAnnualType;
  if (annualObservationInput) annualObservationInput.value = '';
  if (annualOneOffCheckbox) annualOneOffCheckbox.checked = false;
  const isIncomeCheck = document.getElementById('annual-is-income');
  if (isIncomeCheck) isIncomeCheck.checked = false;
  if (annualInstallmentCheck) annualInstallmentCheck.checked = false;
  annualInstallmentModeInputs.forEach((input) => (input.checked = input.value === 'purchase'));
  if (annualInterestCheck) annualInterestCheck.checked = false;
  annualInterestTypeInputs.forEach((input) => (input.checked = input.value === 'financing'));
  annualPaymentFrequencyInputs.forEach((input) => (input.checked = input.value === 'monthly'));
  if (annualRentalAmount) annualRentalAmount.value = '';
  if (annualRentBuyAtEnd) annualRentBuyAtEnd.checked = true;
  if (annualInterestRate) annualInterestRate.value = '';
  if (annualMortgageAmortization) annualMortgageAmortization.value = '';
  if (annualInstallmentsCount) annualInstallmentsCount.readOnly = false;
  if (annualInstallmentsInterval) annualInstallmentsInterval.readOnly = false;
  if (annualInstallmentFields) annualInstallmentFields.hidden = true;
  if (annualInstallmentCheck) annualInstallmentCheck.parentElement.parentElement.style.display = 'flex'; // Garante que volta a aparecer caso estivesse editando
  updateAnnualInstallmentBuilder();
  updateAnnualChips();
}

function startEditAnnual(id) {
  const item = annualEvents.find((a) => a.id === id);
  if (!item) return;

  editingAnnualId = id;
  annualNameInput.value = item.name;
  annualCategoryInput.value = item.category;

  const dummyYear = item.targetYear || new Date().getFullYear();
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
  if (annualInstallmentCheck) {
    annualInstallmentCheck.checked = false;
    annualInstallmentCheck.parentElement.parentElement.style.display = 'none';
  }
  updateAnnualInstallmentBuilder();

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
  if (ev?.installmentPlanId) {
    await updateInstallmentPlanEntry(ev.installmentPlanId, ev.installmentNumber, { status: 'cancelled', annualEventId: null });
  }
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
  if (item.installmentPlanId) {
    const year = item.targetYear || new Date().getFullYear();
    await updateInstallmentPlanEntry(item.installmentPlanId, item.installmentNumber, {
      targetDate: `${year}-${targetMonth}-${adjustedDayText}`,
    });
  }
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
    const yearA = a.targetYear || '0000';
    const yearB = b.targetYear || '0000';
    if (yearA !== yearB) return yearA.localeCompare(yearB);
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
        const installmentBadge = item.installmentPlanId
          ? ` <span class="annual-plan-badge">${item.installmentMode === 'repeat' ? 'Repetição' : 'Parcela'}</span>`
          : '';
        const biweeklyBadge = renderBiweeklyConversionBadge(item);
        const targetYearBadge = item.targetYear ? ` <span class="annual-plan-badge">${item.targetYear}</span>` : '';

        const isIncome = item.amount < 0 || item.isIncome;
        const amountColor = isIncome ? '#62c462' : '#ff7b7b';
        const displayAmount = isIncome ? `+ ${formatCurrency(Math.abs(item.amount))}` : `- ${formatCurrency(Math.abs(item.amount))}`;
        const incomeBadge = isIncome ? ' <span style="color:#62c462; font-size:0.7rem; font-weight:bold; margin-left: 4px;">(Entrada)</span>' : '';

        el.innerHTML = `
        <button type="button" class="annual-drag-handle" aria-label="Mover ${item.name}" title="Pressione e arraste para outro mês">⠿</button>
        <div class="receipt-main">
          <div class="receipt-line">${item.name}${oneOffBadge}${installmentBadge}${biweeklyBadge}${targetYearBadge}${incomeBadge} <span style="color:#fddf7b; font-size: 0.75rem; margin-left: 4px;">[${diaText}]</span></div>
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
  const currentYear = currentMonthStr.split('-')[0];

  const pendingEvents = annualEvents.filter((ev) => {
    if (ev.monthTarget !== currentMonthNum) return false;
    if (ev.targetYear && ev.targetYear !== currentYear) return false;

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
    const biweeklyBadge = renderBiweeklyConversionBadge(ev);
    const obsHtml = ev.observation ? `<div style="font-size: 0.75rem; color: #a6a6c0; margin-top: 2px;">↳ ${ev.observation}</div>` : '';

    const isIncome = ev.amount < 0 || ev.isIncome;
    const amountColor = isIncome ? '#62c462' : '#ff7b7b';
    const displayAmount = isIncome ? `+ ${formatCurrency(Math.abs(ev.amount))}` : `- ${formatCurrency(Math.abs(ev.amount))}`;
    const incomeBadge = isIncome ? ' <span style="color:#62c462; font-size:0.7rem; font-weight:bold; margin-left: 4px;">(Entrada)</span>' : '';

    el.innerHTML = `
      <div>
        <div style="font-weight: 600; font-size: 0.9rem; color: #f5f5f5;">${ev.name}${oneOffBadge}${biweeklyBadge}${incomeBadge} (Dia ${ev.dayTarget || '01'})</div>
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

  if (ev.installmentPlanId) {
    itemData.installmentPlanId = ev.installmentPlanId;
    itemData.installmentNumber = ev.installmentNumber;
    itemData.installmentCount = ev.installmentCount;
    itemData.installmentMode = ev.installmentMode;
  }
  if (ev.isBiweeklyConverted) {
    itemData.isBiweeklyConverted = true;
    itemData.biweeklyAmount = ev.biweeklyAmount;
    itemData.biweeklyMonthlyAmount = ev.biweeklyMonthlyAmount ?? ev.amount;
  }

  const plannedId = await FinanceAPI.savePlanned(targetMonthStr, itemData);
  if (ev.installmentPlanId) {
    await updateInstallmentPlanEntry(ev.installmentPlanId, ev.installmentNumber, {
      status: 'budgeted',
      annualEventId: null,
      plannedId,
      plannedMonth: targetMonthStr,
    });
  }
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
