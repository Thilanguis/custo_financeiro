// Módulo de dados exclusivo da área de Compras.
(() => {
  const getFamilyId = () => window.FinanceAPI?.familyId || 'familia-gabriel-luana';
  const familyRef = () => window.db.collection('familias').doc(getFamilyId());
  const productsRef = () => familyRef().collection('produtos_compras');
  const activeListRef = () => familyRef().collection('listas_compras').doc('ativa');
  const activeItemsRef = () => activeListRef().collection('itens');

  function cleanUndefined(value) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
  }

  window.ShoppingAPI = {
    listenProducts(callback, onError = console.error) {
      return productsRef()
        .orderBy('name')
        .onSnapshot((snapshot) => callback(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))), onError);
    },

    async getProduct(barcode) {
      const snapshot = await productsRef().doc(String(barcode)).get();
      return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
    },

    async saveProduct(product) {
      const barcode = String(product.barcode || product.id || '').trim();
      if (!barcode) throw new Error('Código do produto não informado.');
      const payload = cleanUndefined({
        barcode,
        name: String(product.name || '').trim(),
        category: String(product.category || '').trim(),
        unit: String(product.unit || 'unidade').trim(),
        defaultQuantity: Math.max(1, Number(product.defaultQuantity) || 1),
        photoDataUrl: product.photoDataUrl || '',
        isManual: Boolean(product.isManual),
        scanRawValue: String(product.scanRawValue || ''),
        scanFormat: String(product.scanFormat || ''),
        scanIsUrl: Boolean(product.scanIsUrl),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      await productsRef()
        .doc(barcode)
        .set(
          {
            ...payload,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      return barcode;
    },

    async deleteProduct(barcode, { removeFromActiveList = false } = {}) {
      const productId = String(barcode || '').trim();
      if (!productId) throw new Error('Produto inválido.');

      const batch = window.db.batch();
      batch.delete(productsRef().doc(productId));

      if (removeFromActiveList) {
        batch.delete(activeItemsRef().doc(productId));
        batch.set(activeListRef(), { updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      }

      await batch.commit();
    },

    listenActiveItems(callback, onError = console.error) {
      return activeItemsRef().onSnapshot((snapshot) => callback(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))), onError);
    },

    async saveActiveItem(item) {
      const barcode = String(item.barcode || item.id || '').trim();
      if (!barcode) throw new Error('Produto inválido.');
      await activeListRef().set(
        {
          name: 'Lista ativa',
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      await activeItemsRef()
        .doc(barcode)
        .set(
          cleanUndefined({
            barcode,
            quantity: Math.max(1, Number(item.quantity) || 1),
            checked: Boolean(item.checked),
            note: String(item.note || '').trim(),
            addedAt: item.addedAt || firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          }),
          { merge: true },
        );
      return barcode;
    },

    async deleteActiveItem(barcode) {
      await activeItemsRef().doc(String(barcode)).delete();
      await activeListRef().set({ updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    },

    async clearPurchased(items) {
      const purchased = items.filter((item) => item.checked);
      if (!purchased.length) return 0;
      const batch = window.db.batch();
      purchased.forEach((item) => batch.delete(activeItemsRef().doc(String(item.barcode || item.id))));
      batch.set(activeListRef(), { updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      await batch.commit();
      return purchased.length;
    },
  };
})();
