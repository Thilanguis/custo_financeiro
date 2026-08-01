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

  async deleteReceipt(month, id) {
    await db.collection('familias').doc(this.familyId).collection('meses').doc(month).collection('notas_fiscais').doc(id).delete();
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

  async deleteInstallmentPlan(id) {
    await db.collection('familias').doc(this.familyId).collection('parcelamentos').doc(id).delete();
  },

  // ===== BACKUP E RESTAURAÇÃO =====
  async ensureMonth(month) {
    await db.collection('familias').doc(this.familyId).collection('meses').doc(month).set({ backupMonthMarker: true }, { merge: true });
  },

  async getFullBackupData() {
    const familyRef = db.collection('familias').doc(this.familyId);
    const [familyDoc, configurationsSnapshot, annualEventsSnapshot, installmentPlansSnapshot, userPreferencesSnapshot, logsSnapshot, monthsSnapshot] = await Promise.all([
      familyRef.get(),
      familyRef.collection('configuracoes').get(),
      familyRef.collection('eventos_anuais').get(),
      familyRef.collection('parcelamentos').get(),
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
      const [configurationsSnapshot, annualEventsSnapshot, installmentPlansSnapshot, userPreferencesSnapshot, logsSnapshot, monthsSnapshot] = await Promise.all([
        familyRef.collection('configuracoes').get(),
        familyRef.collection('eventos_anuais').get(),
        familyRef.collection('parcelamentos').get(),
        familyRef.collection('user_prefs').get(),
        familyRef.collection('logs').get(),
        familyRef.collection('meses').get(),
      ]);

      for (const document of configurationsSnapshot.docs) await queueOperation('delete', document.ref);
      for (const document of annualEventsSnapshot.docs) await queueOperation('delete', document.ref);
      for (const document of installmentPlansSnapshot.docs) await queueOperation('delete', document.ref);
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
