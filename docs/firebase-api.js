// firebase-api.js

const db = window.db;
const auth = window.auth;

window.FinanceAPI = {
  uid: null,
  familyId: 'familia-gabriel-luana', // ID compartilhado para unificar os dados
  unsubscribers: [],

  clearListeners() {
    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];
  },

  onAuthStateChanged(callback) {
    auth.onAuthStateChanged((user) => {
      this.uid = user ? user.uid : null;
      callback(user);
    });
  },

  async login(email, password) {
    // Força a sessão a ficar salva no celular até que se clique em "Sair"
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    return auth.signInWithEmailAndPassword(email, password);
  },

  async logout() {
    return auth.signOut();
  },

  // ===== EMPRESAS =====
  listenCompanies(callback) {
    const unsub = db
      .collection('familias')
      .doc(this.familyId)
      .collection('configuracoes')
      .doc('empresas')
      .onSnapshot((doc) => callback(doc.exists ? doc.data() : {}));
    this.unsubscribers.push(unsub);
  },

  async saveCompanies(companyDirectory) {
    await db.collection('familias').doc(this.familyId).collection('configuracoes').doc('empresas').set(companyDirectory);
  },

  listenCompanyFavorites(callback) {
    const unsub = db
      .collection('familias')
      .doc(this.familyId)
      .collection('configuracoes')
      .doc('empresas_favoritas')
      .onSnapshot((doc) => callback(doc.exists ? doc.data().items || [] : []));
    this.unsubscribers.push(unsub);
  },

  async saveCompanyFavorites(items) {
    await db.collection('familias').doc(this.familyId).collection('configuracoes').doc('empresas_favoritas').set({ items });
  },

  // ===== MÉTODOS DE PAGAMENTO (CARTÕES) =====
  listenPaymentMethods(callback) {
    const unsub = db
      .collection('familias')
      .doc(this.familyId)
      .collection('configuracoes')
      .doc('pagamentos')
      .onSnapshot((doc) => callback(doc.exists ? doc.data().methods || [] : []));
    this.unsubscribers.push(unsub);
  },

  async savePaymentMethods(methods) {
    await db.collection('familias').doc(this.familyId).collection('configuracoes').doc('pagamentos').set({ methods });
  },

  // ===== PAGAMENTOS INFORMATIVOS DAS FATURAS =====
  // Estes registros nunca geram uma nota e nunca alteram o saldo Livre. Servem
  // somente para acompanhar se a fatura calculada pelo sistema foi paga.
  listenCreditCardPayments(month, callback) {
    const unsub = db
      .collection('familias')
      .doc(this.familyId)
      .collection('meses')
      .doc(month)
      .onSnapshot((doc) => callback(doc.exists ? doc.data().creditCardPayments || {} : {}));
    this.unsubscribers.push(unsub);
  },

  async saveCreditCardPayment(month, cardId, payment) {
    await this.ensureMonth(month);
    await db
      .collection('familias')
      .doc(this.familyId)
      .collection('meses')
      .doc(month)
      .update({ [`creditCardPayments.${cardId}`]: payment });
  },

  async deleteCreditCardPayment(month, cardId) {
    await this.ensureMonth(month);
    await db
      .collection('familias')
      .doc(this.familyId)
      .collection('meses')
      .doc(month)
      .update({ [`creditCardPayments.${cardId}`]: firebase.firestore.FieldValue.delete() });
  },

  // ===== FATURAS FECHADAS DOS CARTÕES =====
  // Pagamentos e ajustes são informativos e vivem dentro da própria fatura.
  // Nenhuma operação desta coleção cria Nota ou altera o Livre.
  listenCreditCardStatements(callback) {
    const unsub = db
      .collection('familias')
      .doc(this.familyId)
      .collection('faturas_cartoes')
      .onSnapshot((snap) => callback(snap.docs.map((document) => ({ id: document.id, ...document.data() }))));
    this.unsubscribers.push(unsub);
  },

  async saveCreditCardStatement(statement) {
    const data = { ...statement };
    const id = data.id;
    delete data.id;
    await db.collection('familias').doc(this.familyId).collection('faturas_cartoes').doc(id).set(data);
    return id;
  },

  // ===== RENDAS =====
  listenIncome(month, callback) {
    const unsub = db
      .collection('familias')
      .doc(this.familyId)
      .collection('meses')
      .doc(month)
      .onSnapshot((doc) => {
        const data = doc.exists ? doc.data() : null;
        const hasIncome = data && (data.luana !== undefined || data.gabriel !== undefined);
        callback(hasIncome ? data : null);
      });
    this.unsubscribers.push(unsub);
  },

  async getIncomeOnce(month) {
    const document = await db.collection('familias').doc(this.familyId).collection('meses').doc(month).get();
    if (!document.exists) return null;
    const data = document.data();
    return data.luana !== undefined || data.gabriel !== undefined ? data : null;
  },

  async saveIncome(month, luana, gabriel, conversionData = {}) {
    await db.collection('familias').doc(this.familyId).collection('meses').doc(month).set({ luana, gabriel, ...conversionData }, { merge: true });
  },

  listenTemporaryIncome(callback) {
    const unsub = db
      .collection('familias')
      .doc(this.familyId)
      .collection('configuracoes')
      .doc('renda_temporaria')
      .onSnapshot((doc) => callback(doc.exists ? doc.data() : null));
    this.unsubscribers.push(unsub);
  },

  async saveTemporaryIncome(data) {
    await db.collection('familias').doc(this.familyId).collection('configuracoes').doc('renda_temporaria').set(data);
  },

  // ===== ORÇAMENTO (PREVISTO) =====
  listenPlanned(month, callback) {
    const unsub = db
      .collection('familias')
      .doc(this.familyId)
      .collection('meses')
      .doc(month)
      .collection('orcamento_previsto')
      .onSnapshot((snap) => callback(snap.docs.map((d) => ({ id: d.id, month, ...d.data() }))));
    this.unsubscribers.push(unsub);
  },

  async savePlanned(month, item) {
    await this.ensureMonth(month);
    const coll = db.collection('familias').doc(this.familyId).collection('meses').doc(month).collection('orcamento_previsto');
    if (item.id && typeof item.id === 'string') {
      await coll.doc(item.id).set(item);
      return item.id;
    } else {
      delete item.id;
      const docRef = await coll.add(item);
      return docRef.id;
    }
  },

  // Adicione logo abaixo de savePlanned(...) e antes de deletePlanned(...)
  async getPlannedOnce(month) {
    const snap = await db.collection('familias').doc(this.familyId).collection('meses').doc(month).collection('orcamento_previsto').get();
    return snap.docs.map((d) => ({ id: d.id, month, ...d.data() }));
  },

  async deletePlanned(month, id) {
    await db.collection('familias').doc(this.familyId).collection('meses').doc(month).collection('orcamento_previsto').doc(id).delete();
  },

  // ===== NOTAS FISCAIS (REAL) =====
  listenReceipts(month, callback) {
    const unsub = db
      .collection('familias')
      .doc(this.familyId)
      .collection('meses')
      .doc(month)
      .collection('notas_fiscais')
      .onSnapshot((snap) => callback(snap.docs.map((d) => ({ id: d.id, date: d.data().date, ...d.data() }))));
    this.unsubscribers.push(unsub);
  },

  async saveReceipt(month, item) {
    await this.ensureMonth(month);
    const coll = db.collection('familias').doc(this.familyId).collection('meses').doc(month).collection('notas_fiscais');
    if (item.id && typeof item.id === 'string') {
      await coll.doc(item.id).set(item);
      return item.id;
    } else {
      delete item.id;
      const docRef = await coll.add(item);
      return docRef.id;
    }
  },

  async getReceiptsOnce(month) {
    const snapshot = await db.collection('familias').doc(this.familyId).collection('meses').doc(month).collection('notas_fiscais').get();
    return snapshot.docs.map((document) => ({ id: document.id, month, ...document.data() }));
  },

  async getReceiptsForMonths(months) {
    const uniqueMonths = [...new Set((months || []).filter((month) => /^\d{4}-\d{2}$/.test(month)))];
    const groups = await Promise.all(uniqueMonths.map((month) => this.getReceiptsOnce(month)));
    return groups.flat();
  },

  // Grava a nota e o marcador de importação na mesma transação. O ID da nota é
  // derivado da impressão digital da operação, portanto uma repetição segura
  // apenas devolve o vínculo já existente.
  async saveImportedReceiptAtomic(month, item, metadata = {}) {
    const fingerprint = String(item.bankImportFingerprint || metadata.fingerprint || '').trim();
    if (!/^[-_a-z0-9]{8,128}$/i.test(fingerprint)) throw new Error('Impressão digital de importação inválida.');
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Mês de importação inválido.');
    const familyRef = db.collection('familias').doc(this.familyId);
    const monthRef = familyRef.collection('meses').doc(month);
    const receiptId = `bank_${fingerprint}`;
    const receiptRef = monthRef.collection('notas_fiscais').doc(receiptId);
    const importRef = familyRef.collection('importacoes_bancarias').doc(`tx_${fingerprint}`);
    const receiptData = { ...item };
    delete receiptData.id;
    delete receiptData.month;
    if (!String(receiptData.category || '').trim() || !String(receiptData.merchant || '').trim()) {
      throw new Error('Categoria e estabelecimento são obrigatórios para importar uma Nota Real.');
    }
    if (receiptData.isStatic || receiptData.staticSyncId) throw new Error('Uma importação bancária não pode criar nem reutilizar um vínculo estático.');
    const installmentGuard = metadata.installmentGuard || null;
    const plannedGuard = metadata.plannedGuard || null;
    if (receiptData.installmentPlanId && !installmentGuard) throw new Error('A parcela precisa ser revalidada antes da importação.');
    if (installmentGuard && (String(installmentGuard.planId || '') !== String(receiptData.installmentPlanId || '') || Number(installmentGuard.installmentNumber) !== Number(receiptData.installmentNumber))) {
      throw new Error('O vínculo da parcela mudou durante a importação.');
    }
    if (receiptData.linkedPlannedId && !plannedGuard) throw new Error('O item previsto precisa ser revalidado antes da importação.');
    if (plannedGuard && (String(plannedGuard.plannedId || '') !== String(receiptData.linkedPlannedId || '') || !/^\d{4}-\d{2}$/.test(String(plannedGuard.plannedMonth || '')))) {
      throw new Error('O vínculo com o item previsto mudou durante a importação.');
    }

    return db.runTransaction(async (transaction) => {
      const importDocument = await transaction.get(importRef);
      if (importDocument.exists) {
        const previous = importDocument.data();
        return { alreadyImported: true, receiptId: previous.receiptId || receiptId, month: previous.month || month };
      }
      let planRef = null;
      let updatedInstallments = null;
      let completed = false;
      if (installmentGuard) {
        planRef = familyRef.collection('parcelamentos').doc(String(installmentGuard.planId));
        const planDocument = await transaction.get(planRef);
        if (!planDocument.exists) throw new Error('O parcelamento não existe mais. Revise antes de importar.');
        const plan = planDocument.data();
        if (plan.automationMode === 'fixed-static-clone') throw new Error('Uma parcela estática deve usar a Nota Real criada automaticamente.');
        const position = (plan.installments || []).findIndex((entry) => Number(entry.number) === Number(installmentGuard.installmentNumber));
        if (position < 0) throw new Error('A parcela não existe mais no plano.');
        const current = plan.installments[position];
        const currentStatus = current.status || 'pending';
        if (currentStatus !== (installmentGuard.expectedStatus || 'pending') || !['pending', 'budgeted'].includes(currentStatus)) {
          throw new Error('O status da parcela mudou durante a revisão.');
        }
        if (String(current.receiptId || '') !== String(installmentGuard.expectedReceiptId || '')) {
          throw new Error('A parcela já foi vinculada a outra Nota Real.');
        }
        if (String(current.plannedId || '') !== String(installmentGuard.expectedPlannedId || '')) {
          throw new Error('O vínculo da parcela com o orçamento mudou durante a revisão.');
        }
        if (Number.isFinite(Number(installmentGuard.expectedAmount)) && Math.round(Number(current.amount) * 100) !== Math.round(Number(installmentGuard.expectedAmount) * 100)) {
          throw new Error('O valor cadastrado da parcela mudou durante a revisão.');
        }
        updatedInstallments = plan.installments.map((entry, index) =>
          index === position
            ? { ...entry, status: 'paid', receiptId, receiptMonth: month, paidAmount: receiptData.amount, paidAt: receiptData.date }
            : entry
        );
        completed = updatedInstallments.every((entry) => ['paid', 'cancelled'].includes(entry.status));
      }
      let plannedRef = null;
      if (plannedGuard) {
        plannedRef = familyRef
          .collection('meses')
          .doc(String(plannedGuard.plannedMonth))
          .collection('orcamento_previsto')
          .doc(String(plannedGuard.plannedId));
        const plannedDocument = await transaction.get(plannedRef);
        if (!plannedDocument.exists) throw new Error('O item previsto não existe mais. Revise antes de importar.');
        const current = plannedDocument.data();
        const expected = plannedGuard.expected || {};
        const textFields = ['date', 'description', 'category', 'owner', 'paymentMethodId', 'staticSyncId', 'bankImportReceiptId'];
        if (textFields.some((field) => String(current[field] || '') !== String(expected[field] || ''))) {
          throw new Error('O item previsto foi alterado durante a revisão.');
        }
        if (Math.round(Number(current.amount) * 100) !== Math.round(Number(expected.amount) * 100) || Boolean(current.fixed) !== Boolean(expected.fixed) || Boolean(current.isStatic) !== Boolean(expected.isStatic)) {
          throw new Error('Os dados financeiros do item previsto mudaram durante a revisão.');
        }
        if (current.isStatic || current.staticSyncId) throw new Error('Um item estático não pode receber uma segunda Nota Real pela importação.');
        if (current.bankImportReceiptId && current.bankImportReceiptId !== receiptId) {
          throw new Error('O item previsto já foi reservado por outra Nota Real.');
        }
      }
      transaction.set(monthRef, { backupMonthMarker: true }, { merge: true });
      transaction.set(receiptRef, receiptData);
      transaction.set(importRef, {
        recordType: 'transaction',
        fingerprint,
        receiptId,
        month,
        paymentMethodId: receiptData.paymentMethodId || '',
        bankTransactionId: receiptData.bankTransactionId || '',
        source: String(metadata.source || 'pdf').slice(0, 24),
        importedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      if (planRef) {
        const planUpdate = {
          installments: updatedInstallments,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (completed) {
          planUpdate.status = 'completed';
          planUpdate.completedAt = firebase.firestore.FieldValue.serverTimestamp();
        }
        transaction.update(planRef, planUpdate);
      }
      if (plannedRef) {
        transaction.update(plannedRef, {
          bankImportReceiptId: receiptId,
          bankImportReceiptMonth: month,
          bankImportFingerprint: fingerprint,
          bankImportLinkedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
      return { alreadyImported: false, receiptId, month, installmentUpdated: Boolean(planRef), plannedLinked: Boolean(plannedRef) };
    });
  },

  async saveBankImportExistingDecision(item = {}) {
    const fingerprint = String(item.fingerprint || item.bankImportFingerprint || '');
    const month = String(item.month || item.date || '').slice(0, 7);
    if (!/^[-_a-z0-9]{8,128}$/i.test(fingerprint)) throw new Error('Impressão digital de importação inválida.');
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Mês da movimentação inválido.');
    const familyRef = db.collection('familias').doc(this.familyId);
    const importRef = familyRef.collection('importacoes_bancarias').doc(`tx_${fingerprint}`);
    return db.runTransaction(async (transaction) => {
      const current = await transaction.get(importRef);
      if (current.exists) return { alreadyRecorded: true, ...current.data() };
      const data = {
        recordType: 'transaction',
        fingerprint,
        decision: 'already-registered',
        receiptId: String(item.matchedReceipt?.id || '').slice(0, 160),
        month,
        paymentMethodId: String(item.paymentMethodId || '').slice(0, 160),
        bankTransactionId: String(item.bankTransactionId || '').slice(0, 160),
        source: String(item.source || 'pdf').slice(0, 24),
        decidedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      transaction.set(importRef, data);
      return { alreadyRecorded: false, ...data };
    });
  },

  async getBankImportState() {
    const snapshot = await db.collection('familias').doc(this.familyId).collection('importacoes_bancarias').get();
    const records = [];
    const aliases = {};
    snapshot.docs.forEach((document) => {
      const data = document.data();
      if (data.recordType === 'alias' && data.normalizedDescription) aliases[data.normalizedDescription] = data;
      else if (data.recordType === 'transaction') records.push({ id: document.id, ...data });
    });
    return { records, aliases };
  },

  async saveBankImportAlias(aliasId, alias) {
    if (!/^[-_a-z0-9]{8,128}$/i.test(aliasId)) throw new Error('Identificador de associação inválido.');
    const data = {
      recordType: 'alias',
      normalizedDescription: String(alias.normalizedDescription || '').slice(0, 240),
      merchant: String(alias.merchant || '').slice(0, 160),
      category: String(alias.category || '').slice(0, 120),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await db.collection('familias').doc(this.familyId).collection('importacoes_bancarias').doc(`alias_${aliasId}`).set(data, { merge: true });
  },

  async deleteReceipt(month, id) {
    await db.collection('familias').doc(this.familyId).collection('meses').doc(month).collection('notas_fiscais').doc(id).delete();
  },

  async deleteImportedReceiptAndReleasePlannedClaim(month, id, plannedId, plannedMonth = month) {
    const familyRef = db.collection('familias').doc(this.familyId);
    const receiptRef = familyRef.collection('meses').doc(month).collection('notas_fiscais').doc(id);
    const plannedRef = familyRef.collection('meses').doc(plannedMonth).collection('orcamento_previsto').doc(plannedId);
    await db.runTransaction(async (transaction) => {
      const plannedDocument = await transaction.get(plannedRef);
      transaction.delete(receiptRef);
      if (plannedDocument.exists && plannedDocument.data().bankImportReceiptId === id) {
        const claimedFingerprint = String(plannedDocument.data().bankImportFingerprint || '');
        if (/^[-_a-z0-9]{8,128}$/i.test(claimedFingerprint)) {
          transaction.delete(familyRef.collection('importacoes_bancarias').doc(`tx_${claimedFingerprint}`));
        }
        transaction.update(plannedRef, {
          bankImportReceiptId: firebase.firestore.FieldValue.delete(),
          bankImportReceiptMonth: firebase.firestore.FieldValue.delete(),
          bankImportFingerprint: firebase.firestore.FieldValue.delete(),
          bankImportLinkedAt: firebase.firestore.FieldValue.delete()
        });
      }
    });
  },

  // ===== PLANEJAMENTO ANUAL =====
  listenAnnualEvents(callback) {
    const unsub = db
      .collection('familias')
      .doc(this.familyId)
      .collection('eventos_anuais')
      .onSnapshot((snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    this.unsubscribers.push(unsub);
  },

  async saveAnnualEvent(item) {
    const coll = db.collection('familias').doc(this.familyId).collection('eventos_anuais');
    if (item.id && typeof item.id === 'string') {
      await coll.doc(item.id).set(item);
      return item.id;
    } else {
      delete item.id;
      const docRef = await coll.add(item);
      return docRef.id;
    }
  },

  async deleteAnnualEvent(id) {
    await db.collection('familias').doc(this.familyId).collection('eventos_anuais').doc(id).delete();
  },

  // ===== PARCELAMENTOS ATIVOS =====
  listenInstallmentPlans(callback) {
    const unsub = db
      .collection('familias')
      .doc(this.familyId)
      .collection('parcelamentos')
      .onSnapshot((snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    this.unsubscribers.push(unsub);
  },

  async saveInstallmentPlan(item) {
    const coll = db.collection('familias').doc(this.familyId).collection('parcelamentos');
    if (item.id && typeof item.id === 'string') {
      const id = item.id;
      const data = { ...item };
      delete data.id;
      await coll.doc(id).set(data);
      return id;
    }
    const data = { ...item };
    delete data.id;
    const docRef = await coll.add(data);
    return docRef.id;
  },

  async getInstallmentPlan(id) {
    if (!id) return null;
    const document = await db.collection('familias').doc(this.familyId).collection('parcelamentos').doc(id).get();
    return document.exists ? { id: document.id, ...document.data() } : null;
  },

  async getInstallmentPlansOnce() {
    const snapshot = await db.collection('familias').doc(this.familyId).collection('parcelamentos').get();
    return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
  },

  async deleteInstallmentPlan(id) {
    await db.collection('familias').doc(this.familyId).collection('parcelamentos').doc(id).delete();
  },

  // ===== BACKUP E RESTAURAÇÃO =====
  async ensureMonth(month) {
    await db.collection('familias').doc(this.familyId).collection('meses').doc(month).set({ backupMonthMarker: true }, { merge: true });
  },

  async getFullBackupData() {
    const familyRef = db.collection('familias').doc(this.familyId);
    const [familyDoc, configurationsSnapshot, annualEventsSnapshot, installmentPlansSnapshot, cardStatementsSnapshot, bankImportsSnapshot, userPreferencesSnapshot, logsSnapshot, monthsSnapshot] = await Promise.all([
      familyRef.get(),
      familyRef.collection('configuracoes').get(),
      familyRef.collection('eventos_anuais').get(),
      familyRef.collection('parcelamentos').get(),
      familyRef.collection('faturas_cartoes').get(),
      familyRef.collection('importacoes_bancarias').get(),
      familyRef.collection('user_prefs').get(),
      familyRef.collection('logs').get(),
      familyRef.collection('meses').get(),
    ]);

    const configurations = {};
    configurationsSnapshot.docs.forEach((document) => {
      configurations[document.id] = document.data();
    });

    const annualEvents = annualEventsSnapshot.docs.map((document) => ({ id: document.id, data: document.data() }));
    const installmentPlans = installmentPlansSnapshot.docs.map((document) => ({ id: document.id, data: document.data() }));
    const cardStatements = cardStatementsSnapshot.docs.map((document) => ({ id: document.id, data: document.data() }));
    const bankImports = bankImportsSnapshot.docs.map((document) => ({ id: document.id, data: document.data() }));
    const userPreferences = userPreferencesSnapshot.docs.map((document) => ({ id: document.id, data: document.data() }));
    const logs = logsSnapshot.docs.map((document) => ({ id: document.id, data: document.data() }));
    const months = {};

    await Promise.all(
      monthsSnapshot.docs.map(async (monthDocument) => {
        const [plannedSnapshot, receiptsSnapshot] = await Promise.all([
          monthDocument.ref.collection('orcamento_previsto').get(),
          monthDocument.ref.collection('notas_fiscais').get(),
        ]);

        months[monthDocument.id] = {
          data: monthDocument.data(),
          planned: plannedSnapshot.docs.map((document) => ({ id: document.id, data: document.data() })),
          receipts: receiptsSnapshot.docs.map((document) => ({ id: document.id, data: document.data() })),
        };
      }),
    );

    return {
      family: familyDoc.exists ? familyDoc.data() : null,
      configurations,
      annualEvents,
      installmentPlans,
      cardStatements,
      bankImports,
      userPreferences,
      logs,
      months,
    };
  },

  async restoreFullBackupData(backupData, mode = 'merge') {
    const familyRef = db.collection('familias').doc(this.familyId);
    let batch = db.batch();
    let operationCount = 0;

    const flushBatch = async () => {
      if (!operationCount) return;
      await batch.commit();
      batch = db.batch();
      operationCount = 0;
    };

    const queueOperation = async (operation, reference, data = null, options = null) => {
      if (operation === 'delete') batch.delete(reference);
      else if (options) batch.set(reference, data, options);
      else batch.set(reference, data);
      operationCount++;
      if (operationCount >= 400) await flushBatch();
    };

    if (mode === 'replace') {
      const [configurationsSnapshot, annualEventsSnapshot, installmentPlansSnapshot, cardStatementsSnapshot, bankImportsSnapshot, userPreferencesSnapshot, logsSnapshot, monthsSnapshot] = await Promise.all([
        familyRef.collection('configuracoes').get(),
        familyRef.collection('eventos_anuais').get(),
        familyRef.collection('parcelamentos').get(),
        familyRef.collection('faturas_cartoes').get(),
        familyRef.collection('importacoes_bancarias').get(),
        familyRef.collection('user_prefs').get(),
        familyRef.collection('logs').get(),
        familyRef.collection('meses').get(),
      ]);

      for (const document of configurationsSnapshot.docs) await queueOperation('delete', document.ref);
      for (const document of annualEventsSnapshot.docs) await queueOperation('delete', document.ref);
      for (const document of installmentPlansSnapshot.docs) await queueOperation('delete', document.ref);
      for (const document of cardStatementsSnapshot.docs) await queueOperation('delete', document.ref);
      for (const document of bankImportsSnapshot.docs) await queueOperation('delete', document.ref);
      for (const document of userPreferencesSnapshot.docs) await queueOperation('delete', document.ref);
      for (const document of logsSnapshot.docs) await queueOperation('delete', document.ref);

      for (const monthDocument of monthsSnapshot.docs) {
        const [plannedSnapshot, receiptsSnapshot] = await Promise.all([
          monthDocument.ref.collection('orcamento_previsto').get(),
          monthDocument.ref.collection('notas_fiscais').get(),
        ]);
        for (const document of plannedSnapshot.docs) await queueOperation('delete', document.ref);
        for (const document of receiptsSnapshot.docs) await queueOperation('delete', document.ref);
        await queueOperation('delete', monthDocument.ref);
      }
      await flushBatch();
    }

    if (backupData.family) await queueOperation('set', familyRef, backupData.family, mode === 'merge' ? { merge: true } : null);

    for (const [configurationId, configurationData] of Object.entries(backupData.configurations || {})) {
      await queueOperation('set', familyRef.collection('configuracoes').doc(configurationId), configurationData, mode === 'merge' ? { merge: true } : null);
    }

    for (const event of backupData.annualEvents || []) {
      await queueOperation('set', familyRef.collection('eventos_anuais').doc(event.id), event.data);
    }

    for (const plan of backupData.installmentPlans || []) {
      await queueOperation('set', familyRef.collection('parcelamentos').doc(plan.id), plan.data);
    }

    for (const statement of backupData.cardStatements || []) {
      await queueOperation('set', familyRef.collection('faturas_cartoes').doc(statement.id), statement.data);
    }

    for (const importRecord of backupData.bankImports || []) {
      await queueOperation('set', familyRef.collection('importacoes_bancarias').doc(importRecord.id), importRecord.data);
    }

    for (const preference of backupData.userPreferences || []) {
      await queueOperation('set', familyRef.collection('user_prefs').doc(preference.id), preference.data);
    }

    for (const log of backupData.logs || []) {
      await queueOperation('set', familyRef.collection('logs').doc(log.id), log.data);
    }

    for (const [month, monthData] of Object.entries(backupData.months || {})) {
      const monthRef = familyRef.collection('meses').doc(month);
      await queueOperation('set', monthRef, monthData.data || { backupMonthMarker: true }, mode === 'merge' ? { merge: true } : null);
      for (const item of monthData.planned || []) await queueOperation('set', monthRef.collection('orcamento_previsto').doc(item.id), item.data);
      for (const item of monthData.receipts || []) await queueOperation('set', monthRef.collection('notas_fiscais').doc(item.id), item.data);
    }

    await flushBatch();
  },
};
