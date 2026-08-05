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

  function getStorageInstance() {
    if (!window.storage) throw new Error('Firebase Storage não foi inicializado.');
    if (!window.ShoppingPhotoStorage) throw new Error('Módulo de fotos do carrinho não foi carregado.');
    return window.storage;
  }

  async function uploadProductPhoto(barcode, dataUrl) {
    const storage = getStorageInstance();
    const blob = window.ShoppingPhotoStorage.dataUrlToBlob(dataUrl);
    window.ShoppingPhotoStorage.validateImageBlob(blob);

    const path = window.ShoppingPhotoStorage.buildPhotoStoragePath(getFamilyId(), barcode, {
      contentType: blob.type,
    });
    const reference = storage.ref().child(path);
    const metadata = {
      contentType: blob.type || 'image/jpeg',
      cacheControl: 'public,max-age=31536000,immutable',
      customMetadata: {
        familyId: getFamilyId(),
        barcode: String(barcode),
      },
    };

    await reference.put(blob, metadata);
    const photoUrl = await reference.getDownloadURL();
    return { photoUrl, photoStoragePath: path };
  }

  async function deleteStoredPhoto(path) {
    const storagePath = String(path || '').trim();
    if (!storagePath || !window.storage) return false;
    try {
      await window.storage.ref().child(storagePath).delete();
      return true;
    } catch (error) {
      if (error?.code === 'storage/object-not-found') return false;
      console.warn('Não foi possível excluir a foto do Storage:', error);
      return false;
    }
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

      const docRef = productsRef().doc(barcode);
      const existingSnapshot = await docRef.get();
      const existing = existingSnapshot.exists ? existingSnapshot.data() : {};
      const originalStoragePath = String(product.previousPhotoStoragePath || existing.photoStoragePath || '');

      const photoChanged = Boolean(product.photoChanged);
      let photoUrl = photoChanged
        ? String(product.photoUrl || '')
        : String(product.photoUrl || existing.photoUrl || '');
      let photoStoragePath = photoChanged
        ? String(product.photoStoragePath || '')
        : String(product.photoStoragePath || existing.photoStoragePath || '');
      let legacyPhotoDataUrl = photoChanged
        ? String(product.photoDataUrl || '')
        : String(product.photoDataUrl || existing.photoDataUrl || '');
      let uploadedStoragePath = '';
      const shouldRemovePhoto = photoChanged && !legacyPhotoDataUrl;
      const shouldUploadPhoto = window.ShoppingPhotoStorage.isDataUrl(legacyPhotoDataUrl)
        && (photoChanged || !photoUrl || !photoStoragePath);

      if (shouldRemovePhoto) {
        photoUrl = '';
        photoStoragePath = '';
        legacyPhotoDataUrl = '';
      } else if (shouldUploadPhoto) {
        const uploaded = await uploadProductPhoto(barcode, legacyPhotoDataUrl);
        photoUrl = uploaded.photoUrl;
        photoStoragePath = uploaded.photoStoragePath;
        uploadedStoragePath = uploaded.photoStoragePath;
        legacyPhotoDataUrl = '';
      }

      const payload = cleanUndefined({
        barcode,
        name: String(product.name || '').trim(),
        category: String(product.category || '').trim(),
        unit: String(product.unit || 'unidade').trim(),
        defaultQuantity: Math.max(1, Number(product.defaultQuantity) || 1),
        photoUrl,
        photoStoragePath,
        // Mantém o campo apenas para compatibilidade. Novas fotos não ficam no Firestore.
        photoDataUrl: legacyPhotoDataUrl,
        isManual: Boolean(product.isManual),
        scanRawValue: String(product.scanRawValue || ''),
        scanFormat: String(product.scanFormat || ''),
        scanIsUrl: Boolean(product.scanIsUrl),
        scanNormalizedValue: String(product.scanNormalizedValue || ''),
        scanFingerprint: String(product.scanFingerprint || ''),
        scanIdentifiers: Array.isArray(product.scanIdentifiers) ? product.scanIdentifiers.map(String) : [],
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        ...(shouldUploadPhoto ? { photoMigratedAt: firebase.firestore.FieldValue.serverTimestamp() } : {}),
        ...(!existingSnapshot.exists ? { createdAt: firebase.firestore.FieldValue.serverTimestamp() } : {}),
      });

      try {
        await docRef.set(payload, { merge: true });
      } catch (error) {
        if (uploadedStoragePath) await deleteStoredPhoto(uploadedStoragePath);
        throw error;
      }

      if (originalStoragePath && originalStoragePath !== photoStoragePath) {
        await deleteStoredPhoto(originalStoragePath);
      }

      return {
        barcode,
        photoUrl,
        photoStoragePath,
        photoDataUrl: legacyPhotoDataUrl,
      };
    },

    async migrateLegacyPhotos(onProgress = () => {}) {
      const snapshot = await productsRef().get();
      const legacyProducts = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((product) => !product.photoUrl && window.ShoppingPhotoStorage.isDataUrl(product.photoDataUrl));

      let migrated = 0;
      const failures = [];
      for (const product of legacyProducts) {
        try {
          await this.saveProduct({
            ...product,
            barcode: product.barcode || product.id,
            photoDataUrl: product.photoDataUrl,
            photoChanged: false,
          });
          migrated += 1;
        } catch (error) {
          console.error(`Erro ao migrar foto de ${product.name || product.id}:`, error);
          failures.push({ barcode: product.barcode || product.id, name: product.name || '', error });
        }
        onProgress({ current: migrated + failures.length, total: legacyProducts.length, migrated, failures: failures.length });
      }

      return { total: legacyProducts.length, migrated, failures };
    },

    async deleteProduct(barcode, { removeFromActiveList = false, preservePhoto = false } = {}) {
      const productId = String(barcode || '').trim();
      if (!productId) throw new Error('Produto inválido.');

      const productSnapshot = await productsRef().doc(productId).get();
      const photoStoragePath = productSnapshot.exists ? String(productSnapshot.data().photoStoragePath || '') : '';
      const batch = window.db.batch();
      batch.delete(productsRef().doc(productId));

      if (removeFromActiveList) {
        batch.delete(activeItemsRef().doc(productId));
        batch.set(activeListRef(), { updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      }

      await batch.commit();
      if (!preservePhoto && photoStoragePath) await deleteStoredPhoto(photoStoragePath);
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
