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
      .onSnapshot((doc) => callback(doc.exists ? doc.data() : null));
    this.unsubscribers.push(unsub);
  },

  async saveIncome(month, luana, gabriel) {
    await db.collection('familias').doc(this.familyId).collection('meses').doc(month).set({ luana, gabriel }, { merge: true });
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
};
