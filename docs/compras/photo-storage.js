// Utilitários de foto do Carrinho de Compras.
// Mantém a transformação de Data URL e a criação de caminhos testáveis fora do Firebase.
(function attachShoppingPhotoStorage(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ShoppingPhotoStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

  function isDataUrl(value) {
    return /^data:image\/[a-z0-9.+-]+(?:;[^,]*)?,/i.test(String(value || ''));
  }

  function dataUrlToBlob(dataUrl) {
    const value = String(dataUrl || '');
    const match = value.match(/^data:([^;,]+)(;base64)?,(.*)$/s);
    if (!match) throw new Error('A foto não está em um formato válido.');

    const contentType = match[1] || 'image/jpeg';
    const isBase64 = Boolean(match[2]);
    const payload = match[3] || '';
    let bytes;

    if (isBase64) {
      const decode = typeof atob === 'function'
        ? atob
        : (input) => Buffer.from(input, 'base64').toString('binary');
      const binary = decode(payload);
      bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    } else {
      const decoded = decodeURIComponent(payload);
      bytes = new TextEncoder().encode(decoded);
    }

    return new Blob([bytes], { type: contentType });
  }

  function hashIdentifier(value) {
    let hash = 0x811c9dc5;
    const text = String(value || '');
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function sanitizePathSegment(value, fallback = 'item') {
    const cleaned = String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
    return cleaned || fallback;
  }

  function extensionForContentType(contentType) {
    const type = String(contentType || '').toLowerCase();
    if (type === 'image/png') return 'png';
    if (type === 'image/webp') return 'webp';
    if (type === 'image/gif') return 'gif';
    return 'jpg';
  }

  function buildPhotoStoragePath(familyId, barcode, options = {}) {
    const timestamp = Number(options.timestamp) || Date.now();
    const contentType = options.contentType || 'image/jpeg';
    const family = sanitizePathSegment(familyId, 'familia');
    const product = sanitizePathSegment(barcode, 'produto');
    const hash = hashIdentifier(barcode);
    const extension = extensionForContentType(contentType);
    return `shopping-products/${family}/${product}-${hash}/photo-${timestamp}.${extension}`;
  }

  function validateImageBlob(blob, maxBytes = MAX_IMAGE_BYTES) {
    if (!blob || typeof blob.size !== 'number') throw new Error('Não foi possível preparar a foto.');
    if (!String(blob.type || '').startsWith('image/')) throw new Error('O arquivo selecionado não é uma imagem.');
    if (blob.size <= 0) throw new Error('A foto está vazia.');
    if (blob.size > maxBytes) throw new Error('A foto ficou maior que 2 MB mesmo após a compressão.');
    return true;
  }

  function getProductPhotoSource(product) {
    return String(product?.photoUrl || product?.photoDataUrl || '');
  }

  return {
    MAX_IMAGE_BYTES,
    isDataUrl,
    dataUrlToBlob,
    hashIdentifier,
    sanitizePathSegment,
    extensionForContentType,
    buildPhotoStoragePath,
    validateImageBlob,
    getProductPhotoSource,
  };
});
