(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PdfStatementReader = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class StatementFileError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'StatementFileError';
      this.code = code;
    }
  }

  const PDFJS_VERSION = '6.4.299';
  const PDFJS_MODULE_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`;
  const PDFJS_WORKER_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
  let pdfLibraryPromise = null;

  async function getPdfLibrary() {
    if (globalThis.pdfjsLib?.getDocument) return globalThis.pdfjsLib;
    if (!pdfLibraryPromise) {
      pdfLibraryPromise = import(PDFJS_MODULE_URL)
        .then((library) => {
          library.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
          globalThis.pdfjsLib = library;
          return library;
        })
        .catch((error) => {
          pdfLibraryPromise = null;
          throw error;
        });
    }
    try {
      return await pdfLibraryPromise;
    } catch (error) {
      throw new StatementFileError('library', 'O leitor local de PDF não pôde ser carregado. Verifique a conexão e tente novamente.');
    }
  }

  function normalizePdfError(error) {
    const name = String(error?.name || '');
    const message = String(error?.message || '');
    if (/password/i.test(name) || /password|senha|mot de passe/i.test(message)) {
      return new StatementFileError('protected', 'Este PDF é protegido por senha. Exporte uma cópia sem proteção para importar.');
    }
    if (/invalidpdf|missingpdf|unexpectedresponse/i.test(name) || /invalid pdf|arquivo.*inválido/i.test(message)) {
      return new StatementFileError('invalid', 'O arquivo não é um PDF válido ou está corrompido.');
    }
    return new StatementFileError('read-error', 'Não foi possível ler este PDF. Nenhum lançamento foi salvo.');
  }

  function linesFromTextItems(items) {
    const rows = [];
    for (const item of items || []) {
      const text = String(item.str || '').trim();
      if (!text) continue;
      const x = Number(item.transform?.[4] || 0);
      const y = Number(item.transform?.[5] || 0);
      let row = rows.find((candidate) => Math.abs(candidate.y - y) <= 2.5);
      if (!row) {
        row = { y, items: [] };
        rows.push(row);
      }
      row.items.push({ x, text });
    }
    return rows
      .sort((left, right) => right.y - left.y)
      .map((row) => row.items.sort((left, right) => left.x - right.x).map((item) => item.text).join(' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n');
  }

  async function readPdf(file, options = {}) {
    if (!file) throw new StatementFileError('missing', 'Selecione um arquivo PDF.');
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    if (!isPdf) throw new StatementFileError('invalid-type', 'Selecione um arquivo no formato PDF.');
    const maxBytes = options.maxBytes || 20 * 1024 * 1024;
    if (file.size > maxBytes) throw new StatementFileError('too-large', 'O PDF é grande demais. O limite é 20 MB.');
    const pdfjsLib = await getPdfLibrary();

    const bytes = new Uint8Array(await file.arrayBuffer());
    let loadingTask = null;
    let pdfDocument = null;
    const pages = [];
    try {
      loadingTask = pdfjsLib.getDocument({ data: bytes, isEvalSupported: false });
      pdfDocument = await loadingTask.promise;
      for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
        const page = await pdfDocument.getPage(pageNumber);
        const content = await page.getTextContent({ disableCombineTextItems: false });
        pages.push(linesFromTextItems(content.items));
        if (typeof page.cleanup === 'function') page.cleanup();
      }
      if (!pages.some((page) => page.trim())) {
        throw new StatementFileError('no-text', 'Este PDF não possui texto selecionável. PDFs digitalizados precisarão de OCR em uma etapa futura.');
      }
    } catch (error) {
      if (error instanceof StatementFileError) throw error;
      throw normalizePdfError(error);
    } finally {
      try {
        if (typeof pdfDocument?.destroy === 'function') await pdfDocument.destroy();
        else if (typeof loadingTask?.destroy === 'function') await loadingTask.destroy();
        else if (typeof pdfDocument?.cleanup === 'function') await pdfDocument.cleanup();
      } catch (_) {
        // A limpeza varia entre versões do PDF.js e não deve invalidar uma leitura concluída.
      }
      try {
        bytes.fill(0);
      } catch (_) {
        // O worker pode assumir e destacar o ArrayBuffer; nesse caso o destroy já o libera.
      }
    }
    return { pages, pageCount: pages.length, fileName: String(file.name || '').slice(0, 120) };
  }

  return { StatementFileError, normalizePdfError, linesFromTextItems, readPdf };
});
