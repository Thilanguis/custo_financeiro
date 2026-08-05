// Utilitários de foto do Carrinho de Compras no plano gratuito Spark.
// As imagens ficam compactadas como Data URL no próprio documento do produto no Firestore.
(function attachShoppingPhotoStorage(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ShoppingPhotoStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  // Os valores abaixo consideram o tamanho da string Data URL já codificada,
  // que é o que efetivamente ocupa espaço no documento do Firestore.
  const TARGET_FIRESTORE_PHOTO_BYTES = 160 * 1024;
  const WARNING_FIRESTORE_PHOTO_BYTES = 220 * 1024;
  const MAX_FIRESTORE_PHOTO_BYTES = 320 * 1024;

  function isDataUrl(value) {
    return /^data:image\/[a-z0-9.+-]+(?:;[^,]*)?,/i.test(String(value || ''));
  }

  function utf8ByteLength(value) {
    const text = String(value || '');
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
    if (typeof Buffer !== 'undefined') return Buffer.byteLength(text, 'utf8');
    return unescape(encodeURIComponent(text)).length;
  }

  function getDataUrlSize(value) {
    return isDataUrl(value) ? utf8ByteLength(value) : 0;
  }

  function formatBytes(bytes) {
    const amount = Math.max(0, Number(bytes) || 0);
    if (amount < 1024) return `${Math.round(amount)} B`;
    if (amount < 1024 * 1024) return `${Math.round(amount / 1024)} KB`;
    return `${(amount / (1024 * 1024)).toFixed(2).replace('.', ',')} MB`;
  }

  function getPhotoSizeStatus(value) {
    if (!isDataUrl(value)) {
      return {
        bytes: 0,
        level: 'empty',
        message: 'Fotos novas são compactadas e salvas no Firestore do plano Spark.',
      };
    }

    const bytes = getDataUrlSize(value);
    if (bytes > MAX_FIRESTORE_PHOTO_BYTES) {
      return {
        bytes,
        level: 'danger',
        message: `Foto com ${formatBytes(bytes)}. Ela está acima do limite seguro de ${formatBytes(MAX_FIRESTORE_PHOTO_BYTES)}.`,
      };
    }
    if (bytes > WARNING_FIRESTORE_PHOTO_BYTES) {
      return {
        bytes,
        level: 'warning',
        message: `Foto compactada com ${formatBytes(bytes)}. Está dentro do limite, mas ainda ocupa bastante espaço.`,
      };
    }
    return {
      bytes,
      level: 'ok',
      message: `Foto compactada com ${formatBytes(bytes)} e pronta para salvar no Firestore.`,
    };
  }

  function validateFirestorePhoto(value, maxBytes = MAX_FIRESTORE_PHOTO_BYTES) {
    if (!isDataUrl(value)) throw new Error('A foto não está em um formato válido.');
    const bytes = getDataUrlSize(value);
    if (bytes <= 0) throw new Error('A foto está vazia.');
    if (bytes > maxBytes) {
      throw new Error(`A foto ficou com ${formatBytes(bytes)}, acima do limite seguro de ${formatBytes(maxBytes)}. Escolha outra foto ou recorte mais perto do produto.`);
    }
    return true;
  }

  function getProductPhotoSource(product) {
    // No modo Spark, a Data URL é a fonte principal. photoUrl é mantida somente
    // para compatibilidade com algum produto que já tenha sido enviado ao Storage.
    return String(product?.photoDataUrl || product?.photoUrl || '');
  }

  return {
    TARGET_FIRESTORE_PHOTO_BYTES,
    WARNING_FIRESTORE_PHOTO_BYTES,
    MAX_FIRESTORE_PHOTO_BYTES,
    isDataUrl,
    utf8ByteLength,
    getDataUrlSize,
    formatBytes,
    getPhotoSizeStatus,
    validateFirestorePhoto,
    getProductPhotoSource,
  };
});
