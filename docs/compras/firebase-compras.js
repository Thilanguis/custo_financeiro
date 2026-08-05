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

    async findProductByScan(scan = {}) {
      const identifiers = [...new Set([scan.code, scan.identifier, ...(scan.identifiers || [])].filter(Boolean).map(String))];
      for (const identifier of identifiers) {
        const direct = await this.getProduct(identifier);
        if (direct) return direct;
      }

      const normalizedValue = String(scan.normalizedValue || '');
      const snapshot = await productsRef().get();
      for (const doc of snapshot.docs) {
        const product = { id: doc.id, ...doc.data() };
        const productIdentifiers = new Set([
          product.barcode,
          product.scanFingerprint,
          ...(Array.isArray(product.scanIdentifiers) ? product.scanIdentifiers : []),
        ].filter(Boolean).map(String));
        if (identifiers.some((identifier) => productIdentifiers.has(identifier))) return product;
        if (normalizedValue && String(product.scanNormalizedValue || '') === normalizedValue) return product;
        if (normalizedValue && product.scanRawValue && window.ShoppingBarcodeScanner.normalizeContentForIdentifier(product.scanRawValue) === normalizedValue) return product;
        if (scan.code && product.scanRawValue) {
          const extracted = window.ShoppingBarcodeScanner.extractProductCode(product.scanRawValue, product.scanFormat || 'unknown');
          if (extracted?.code === String(scan.code)) return product;
        }
      }
      return null;
    },

    async saveProduct(product) {
      const barcode = String(product.barcode || product.id || '').trim();
      if (!barcode) throw new Error('Código do produto não informado.');
      if (!window.ShoppingPhotoStorage) throw new Error('Módulo de fotos do carrinho não foi carregado.');

      const docRef = productsRef().doc(barcode);
      const existingSnapshot = await docRef.get();
      const existing = existingSnapshot.exists ? existingSnapshot.data() : {};
      const photoChanged = Boolean(product.photoChanged);

      let photoDataUrl = photoChanged
        ? String(product.photoDataUrl || '')
        : String(product.photoDataUrl || existing.photoDataUrl || '');
      let photoUrl = photoChanged
        ? ''
        : String(product.photoUrl || existing.photoUrl || '');
      let photoStoragePath = photoChanged
        ? ''
        : String(product.photoStoragePath || existing.photoStoragePath || '');

      if (photoChanged && photoDataUrl) {
        window.ShoppingPhotoStorage.validateFirestorePhoto(photoDataUrl);
        // Ao substituir uma foto antiga do Storage, a nova passa a ficar somente
        // no Firestore para manter o projeto compatível com o plano Spark.
        photoUrl = '';
        photoStoragePath = '';
      }

      if (photoChanged && !photoDataUrl) {
        photoDataUrl = '';
        photoUrl = '';
        photoStoragePath = '';
      }

      const payload = cleanUndefined({
        barcode,
        name: String(product.name || '').trim(),
        category: String(product.category || '').trim(),
        unit: String(product.unit || 'unidade').trim(),
        defaultQuantity: Math.max(1, Number(product.defaultQuantity) || 1),
        photoDataUrl,
        // Campos mantidos apenas para compatibilidade com produtos que já possuam
        // uma URL antiga. Fotos novas não usam Firebase Storage.
        photoUrl,
        photoStoragePath,
        photoStorageMode: photoDataUrl ? 'firestore-data-url-v2' : photoUrl ? 'legacy-storage-url' : 'none',
        isManual: Boolean(product.isManual),
        scanRawValue: String(product.scanRawValue || ''),
        scanFormat: String(product.scanFormat || ''),
        scanIsUrl: Boolean(product.scanIsUrl),
        scanNormalizedValue: String(product.scanNormalizedValue || ''),
        scanFingerprint: String(product.scanFingerprint || ''),
        scanIdentifiers: Array.isArray(product.scanIdentifiers) ? product.scanIdentifiers.map(String) : [],
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        ...(!existingSnapshot.exists ? { createdAt: firebase.firestore.FieldValue.serverTimestamp() } : {}),
      });

      await docRef.set(payload, { merge: true });

      return {
        barcode,
        photoUrl,
        photoStoragePath,
        photoDataUrl,
      };
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
