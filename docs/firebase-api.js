// firebase-api.js
const db = window.db;
const auth = window.auth;

window.FinanceAPI = {
  uid: null,

  // Escuta mudanças de status (logado/deslogado)
  onAuthStateChanged(callback) {
    auth.onAuthStateChanged((user) => {
      if (user) {
        this.uid = user.uid;
        callback(user);
      } else {
        this.uid = null;
        callback(null);
      }
    });
  },

  async login(email, password) {
    return auth.signInWithEmailAndPassword(email, password);
  },

  async logout() {
    return auth.signOut();
  },

  // ===== EMPRESAS =====
  async loadCompanies() {
    if (!this.uid) return {};
    const docRef = db.collection('familias').doc(this.uid).collection('configuracoes').doc('empresas');
    const doc = await docRef.get();
    return doc.exists ? doc.data() : {};
  },

  async saveCompanies(companyDirectory) {
    if (!this.uid) return;
    const docRef = db.collection('familias').doc(this.uid).collection('configuracoes').doc('empresas');
    await docRef.set(companyDirectory);
  },

  // ===== RENDAS =====
  async loadIncome(month) {
    if (!this.uid) return null;
    const docRef = db.collection('familias').doc(this.uid).collection('meses').doc(month);
    const doc = await docRef.get();
    return doc.exists ? doc.data() : null;
  },

  async saveIncome(month, luana, gabriel) {
    if (!this.uid) return;
    const docRef = db.collection('familias').doc(this.uid).collection('meses').doc(month);
    await docRef.set({ luana, gabriel }, { merge: true });
  },

  // ===== ORÇAMENTO (PREVISTO) =====
  async loadPlanned(month) {
    if (!this.uid) return [];
    const snapshot = await db.collection('familias').doc(this.uid).collection('meses').doc(month).collection('orcamento_previsto').get();
    return snapshot.docs.map((doc) => ({ id: doc.id, month, ...doc.data() }));
  },

  async savePlanned(month, item) {
    if (!this.uid) return null;
    const collRef = db.collection('familias').doc(this.uid).collection('meses').doc(month).collection('orcamento_previsto');

    if (item.id && typeof item.id === 'string') {
      await collRef.doc(item.id).set(item);
      return item.id;
    } else {
      delete item.id; // Remove ID local provisório
      const docRef = await collRef.add(item);
      return docRef.id;
    }
  },

  async deletePlanned(month, id) {
    if (!this.uid) return;
    await db.collection('familias').doc(this.uid).collection('meses').doc(month).collection('orcamento_previsto').doc(id).delete();
  },

  // ===== NOTAS FISCAIS (REAL) =====
  async loadReceipts(month) {
    if (!this.uid) return [];
    const snapshot = await db.collection('familias').doc(this.uid).collection('meses').doc(month).collection('notas_fiscais').get();
    return snapshot.docs.map((doc) => ({ id: doc.id, date: doc.data().date, ...doc.data() }));
  },

  async saveReceipt(month, item) {
    if (!this.uid) return null;
    const collRef = db.collection('familias').doc(this.uid).collection('meses').doc(month).collection('notas_fiscais');

    if (item.id && typeof item.id === 'string') {
      await collRef.doc(item.id).set(item);
      return item.id;
    } else {
      delete item.id;
      const docRef = await collRef.add(item);
      return docRef.id;
    }
  },

  async deleteReceipt(month, id) {
    if (!this.uid) return;
    await db.collection('familias').doc(this.uid).collection('meses').doc(month).collection('notas_fiscais').doc(id).delete();
  },
};
