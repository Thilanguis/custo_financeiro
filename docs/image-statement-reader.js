(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ImageStatementReader = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class StatementImageError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'StatementImageError';
      this.code = code;
    }
  }

  const SUPPORTED_IMAGE_RE = /\.(?:jpe?g|png|webp)$/i;

  function isSupportedImage(file) {
    return /^image\/(?:jpeg|png|webp)$/i.test(file?.type || '') || SUPPORTED_IMAGE_RE.test(file?.name || '');
  }

  async function readImages(files, options = {}) {
    const selected = Array.from(files || []);
    if (!selected.length) throw new StatementImageError('missing', 'Selecione ao menos uma imagem do extrato.');
    if (selected.length > (options.maxFiles || 20)) throw new StatementImageError('too-many', 'Selecione no máximo 20 imagens por vez.');
    if (selected.some((file) => !isSupportedImage(file))) {
      throw new StatementImageError('invalid-type', 'Use imagens JPG, PNG ou WebP.');
    }
    const maxFileBytes = options.maxFileBytes || 20 * 1024 * 1024;
    const maxTotalBytes = options.maxTotalBytes || 80 * 1024 * 1024;
    if (selected.some((file) => Number(file.size) > maxFileBytes)) {
      throw new StatementImageError('too-large', 'Uma das imagens ultrapassa o limite de 20 MB.');
    }
    if (selected.reduce((sum, file) => sum + (Number(file.size) || 0), 0) > maxTotalBytes) {
      throw new StatementImageError('too-large', 'O conjunto de imagens ultrapassa o limite de 80 MB.');
    }

    const createWorker = options.createWorker || globalThis.Tesseract?.createWorker;
    if (typeof createWorker !== 'function') {
      throw new StatementImageError('library', 'O leitor local de imagens não pôde ser carregado. Verifique a conexão e tente novamente.');
    }

    let worker = null;
    const pages = [];
    try {
      worker = await createWorker('eng+fra', undefined, {
        logger(message) {
          if (message?.status === 'recognizing text' && typeof options.onProgress === 'function') {
            options.onProgress({ fileIndex: pages.length, fileCount: selected.length, progress: Number(message.progress) || 0 });
          }
        }
      });
      // Capturas de aplicativos bancários têm descrições à esquerda e valores
      // à direita, muitas vezes em linhas separadas. PSM 11 (sparse text)
      // recupera os valores que o modo automático tende a truncar/omitir.
      if (typeof worker.setParameters === 'function') {
        await worker.setParameters({ tessedit_pageseg_mode: '11' });
      }
      for (let index = 0; index < selected.length; index += 1) {
        const result = await worker.recognize(selected[index]);
        pages.push(String(result?.data?.text || '').trim());
        if (typeof options.onProgress === 'function') {
          options.onProgress({ fileIndex: index + 1, fileCount: selected.length, progress: 1 });
        }
      }
    } catch (error) {
      if (error instanceof StatementImageError) throw error;
      throw new StatementImageError('read-error', 'Não foi possível reconhecer o texto das imagens. Nenhum lançamento foi salvo.');
    } finally {
      try {
        if (typeof worker?.terminate === 'function') await worker.terminate();
      } catch (_) {
        // A imagem e o texto ficam somente na memória desta tela.
      }
    }

    if (!pages.some((page) => page.trim())) {
      throw new StatementImageError('no-text', 'Nenhum texto foi reconhecido nas imagens. Tente imagens mais nítidas e sem cortes sobre os valores.');
    }
    return {
      pages,
      pageCount: pages.length,
      fileName: selected.length === 1 ? String(selected[0].name || 'imagem').slice(0, 120) : `${selected.length} imagens`
    };
  }

  return { StatementImageError, isSupportedImage, readImages };
});
