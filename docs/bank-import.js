(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BankImport = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STATUS = Object.freeze({
    NEW: 'new',
    EXISTING: 'existing',
    REVIEW: 'review',
    INVALID: 'invalid',
    IGNORED: 'ignored'
  });

  const TYPE = Object.freeze({
    EXPENSE: 'expense',
    CREDIT: 'credit',
    REFUND: 'refund',
    PAYMENT: 'payment',
    TRANSFER: 'transfer'
  });

  const REVIEW_KIND = Object.freeze({
    PROTECTED: 'protected',
    POSSIBLE_DUPLICATE: 'possible-duplicate',
    PLANNED: 'planned',
    PLANNED_ALREADY_USED: 'planned-already-used',
    INSTALLMENT: 'installment',
    USER_CONFIRMABLE: 'user-confirmable',
    MISSING_FIELDS: 'missing-fields'
  });

  const MONTHS = {
    jan: 1, january: 1, janvier: 1,
    feb: 2, february: 2, fev: 2, fevr: 2, fevrier: 2,
    mar: 3, march: 3, mars: 3,
    apr: 4, april: 4, avr: 4, avril: 4,
    may: 5, mai: 5,
    jun: 6, june: 6, juin: 6,
    jul: 7, july: 7, juil: 7, juillet: 7,
    aug: 8, august: 8, aou: 8, aout: 8,
    sep: 9, sept: 9, september: 9, septembre: 9,
    oct: 10, october: 10, octobre: 10,
    nov: 11, november: 11, novembre: 11,
    dec: 12, december: 12, decembre: 12
  };

  function stripAccents(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function normalizeText(value) {
    return stripAccents(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeMerchant(value) {
    const noise = /\b(?:pos|debit|credit|purchase|achat|transaction|terminal|term|ref|reference|authorization|autorisation|online|internet|visa|mastercard|mc)\b/gi;
    return normalizeText(String(value || '')
      .replace(/[#*]\s*[a-z0-9-]{3,}/gi, ' ')
      .replace(/\b\d{5,}\b/g, ' ')
      .replace(noise, ' ')
      .replace(/\b(?:qc|quebec|on|ontario|ca|canada)\b/gi, ' '));
  }

  function parseMoney(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
    let raw = String(value || '').trim();
    if (!raw) return null;
    const negative = /^-/.test(raw) || /-$/.test(raw) || /^\(.*\)$/.test(raw) || /\bCR\b/i.test(raw);
    raw = raw.replace(/(?:CAD|CAN|CA\$|\$|CR|DR)/gi, '').replace(/[()\s'+-]/g, '');
    if (!/\d/.test(raw)) return null;
    const lastComma = raw.lastIndexOf(',');
    const lastDot = raw.lastIndexOf('.');
    let decimal = null;
    if (lastComma >= 0 && lastDot >= 0) decimal = lastComma > lastDot ? ',' : '.';
    else if (lastComma >= 0 && raw.length - lastComma - 1 <= 2) decimal = ',';
    else if (lastDot >= 0 && raw.length - lastDot - 1 <= 2) decimal = '.';
    if (decimal) {
      const thousands = decimal === ',' ? /\./g : /,/g;
      raw = raw.replace(thousands, '').replace(decimal, '.');
    } else raw = raw.replace(/[,.]/g, '');
    const number = Number(raw);
    if (!Number.isFinite(number)) return null;
    return Math.round((negative ? -Math.abs(number) : number) * 100) / 100;
  }

  function toIso(year, month, day) {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function parseDate(value, options = {}) {
    const raw = String(value || '').trim().replace(/\s+/g, ' ');
    if (!raw) return { value: '', missing: true, ambiguous: false };
    let match = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (match) return { value: toIso(+match[1], +match[2], +match[3]), ambiguous: false };

    match = raw.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?$/);
    if (match) {
      const first = +match[1];
      const second = +match[2];
      if (!match[3] && !options.defaultYear) return { value: '', raw, ambiguous: true, missingYear: true };
      let year = +(match[3] || options.defaultYear);
      if (year < 100) year += year >= 70 ? 1900 : 2000;
      const order = options.dateOrder || (first > 12 ? 'DMY' : second > 12 ? 'MDY' : '');
      if (!order) return { value: '', raw, ambiguous: true };
      const month = order === 'DMY' ? second : first;
      const day = order === 'DMY' ? first : second;
      const selectedValue = toIso(year, month, day);
      if (selectedValue) return { value: selectedValue, ambiguous: false, dateOrder: order };

      // Se a ordem escolhida produzir uma data impossível (por exemplo 08/13
      // como dia/mês), tenta automaticamente a interpretação contrária.
      const oppositeOrder = order === 'DMY' ? 'MDY' : 'DMY';
      const oppositeMonth = oppositeOrder === 'DMY' ? second : first;
      const oppositeDay = oppositeOrder === 'DMY' ? first : second;
      const oppositeValue = toIso(year, oppositeMonth, oppositeDay);
      return oppositeValue ? { value: oppositeValue, ambiguous: false, dateOrder: oppositeOrder, usedOppositeOrder: true } : { value: '', raw, invalid: true, ambiguous: false };
    }

    match = normalizeText(raw).match(/^([a-z]+)\s+(\d{1,2})(?:\s+(\d{4}))?$/);
    if (match && MONTHS[match[1]]) {
      if (!match[3] && !options.defaultYear) return { value: '', raw, ambiguous: true, missingYear: true };
      return { value: toIso(+(match[3] || options.defaultYear), MONTHS[match[1]], +match[2]), ambiguous: false };
    }
    match = normalizeText(raw).match(/^(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?$/);
    if (match && MONTHS[match[2]]) {
      if (!match[3] && !options.defaultYear) return { value: '', raw, ambiguous: true, missingYear: true };
      return { value: toIso(+(match[3] || options.defaultYear), MONTHS[match[2]], +match[1]), ambiguous: false };
    }
    return { value: '', raw, invalid: true, ambiguous: false };
  }

  function classifyType(description, amount) {
    const text = normalizeText(description);
    if (/\b(?:payment received|paiement recu|credit card payment|paiement carte|thank you|merci)\b/.test(text)) return TYPE.PAYMENT;
    if (/\b(?:transfer|transfert|e transfer|etransfer|virement)\b/.test(text)) return TYPE.TRANSFER;
    if (/\b(?:refund|remboursement|reversal|annulation|chargeback|retour)\b/.test(text)) return TYPE.REFUND;
    if (/\b(?:credit|credit memo|ajustement crediteur|cashback|reward)\b/.test(text) || Number(amount) < 0) return TYPE.CREDIT;
    return TYPE.EXPENSE;
  }

  function signedAmount(amount, type) {
    const absolute = Math.abs(Number(amount) || 0);
    return [TYPE.CREDIT, TYPE.REFUND].includes(type) ? -absolute : absolute;
  }

  function hashString(value) {
    const text = String(value || '');
    let a = 2166136261;
    let b = 2246822519;
    for (let i = 0; i < text.length; i += 1) {
      a ^= text.charCodeAt(i);
      a = Math.imul(a, 16777619);
      b ^= text.charCodeAt(i) + i;
      b = Math.imul(b, 3266489917);
    }
    return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
  }

  const MONTH_TOKEN_SOURCE = '(?:JAN(?:UARY|V(?:IER)?)?|FEB(?:RUARY)?|F[ÉE]V(?:R(?:IER)?)?|MAR(?:CH|S)?|APR(?:IL)?|AVR(?:IL)?|MAY|MAI|JUN(?:E|IN)?|JUL(?:Y|LET)?|JUIL(?:LET)?|AUG(?:UST)?|AO[ÛU](?:T)?|SEP(?:TEMBER|TEMBRE)?|OCT(?:OBER|OBRE)?|NOV(?:EMBER|EMBRE)?|DEC(?:EMBER)?|D[ÉE]C(?:EMBRE)?)\\.?';
  const DATE_TOKEN_SOURCE = `(?:\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}|\\d{1,2}[-/.]\\d{1,2}(?:[-/.]\\d{2,4})?|${MONTH_TOKEN_SOURCE}\\s+\\d{1,2}(?:,?\\s+\\d{4})?|\\d{1,2}\\s+${MONTH_TOKEN_SOURCE}(?:\\s+\\d{4})?)`;
  const DATE_START_RE = new RegExp(`^\\s*(${DATE_TOKEN_SOURCE})(?:\\s+(${DATE_TOKEN_SOURCE}))?\\s+(.+)$`, 'i');
  const MONEY_RE = /(?:CA\$|CAD|CAN|\$)?\s*[-(]?(?:(?:\d{1,3}(?:[ ,.'\u00a0]\d{3})+|\d+)(?:[,.]\d{2}))\s*(?:CA\$|CAD|CAN|\$)?\s*[)]?-?\s*(?:CR|DR)?/gi;

  function extractStatementYear(text, fallback) {
    const normalized = normalizeText(text);
    // Rodapés legais podem conter anos antigos (por exemplo, o código da versão
    // do contrato). O ano do período do extrato tem prioridade sobre esses anos.
    const periodMatch = normalized.match(/\b(?:statement period|statement date|releve du|revel du|periode du|period du)\b.{0,100}?\b(20\d{2})\b/);
    if (periodMatch) return +periodMatch[1];
    const years = String(text || '').match(/\b20\d{2}\b/g) || [];
    const uniqueYears = [...new Set(years)];
    if (uniqueYears.length === 1) return +uniqueYears[0];

    // O PDF.js pode separar visualmente o texto do cabeçalho e colocar o ano
    // muito longe de "Relevé" na sequência extraída. Nesse caso, usa o ano
    // predominante no documento e ignora uma versão antiga isolada do rodapé.
    const counts = years.reduce((result, year) => {
      result[year] = (result[year] || 0) + 1;
      return result;
    }, {});
    const rankedYears = Object.entries(counts).sort((left, right) => right[1] - left[1]);
    if (rankedYears.length && (rankedYears.length === 1 || rankedYears[0][1] > rankedYears[1][1])) return +rankedYears[0][0];

    const dueDateMatch = normalized.match(/\b(?:due date|date d echeance)\b.{0,60}?\b(20\d{2})\b/);
    if (dueDateMatch) return +dueDateMatch[1];
    return +(fallback || 0);
  }

  function detectNumericDateOrder(text) {
    let dmyEvidence = 0;
    let mdyEvidence = 0;
    const raw = String(text || '');
    for (const match of raw.matchAll(/(?:^|\s)(\d{1,2})[-/.](\d{1,2})(?:[-/.]\d{2,4})?(?=\s|$)/g)) {
      const first = Number(match[1]);
      const second = Number(match[2]);
      if (first > 12 && second <= 12) dmyEvidence += 3;
      if (second > 12 && first <= 12) mdyEvidence += 3;
    }
    if (dmyEvidence > 0 && mdyEvidence === 0) return { order: 'DMY', source: 'unambiguous-date' };
    if (mdyEvidence > 0 && dmyEvidence === 0) return { order: 'MDY', source: 'unambiguous-date' };

    const normalized = normalizeText(raw);
    const frenchSignals = (normalized.match(/\b(?:releve|periode|date de l operation|date d inscription|paiement|montant)\b/g) || []).length;
    const englishSignals = (normalized.match(/\b(?:statement period|transaction date|posting date|payment|amount)\b/g) || []).length;
    if (frenchSignals > englishSignals && frenchSignals >= 1) return { order: 'DMY', source: 'document-language' };
    if (englishSignals > frenchSignals && englishSignals >= 2) return { order: 'MDY', source: 'document-language' };
    return { order: '', source: 'unresolved' };
  }

  function parseTransactionLine(line, options, lineNumber) {
    const match = String(line || '').match(DATE_START_RE);
    if (!match) return null;
    const transactionDate = parseDate(match[1], options);
    const postedDate = match[2] ? parseDate(match[2], options) : { value: '', missing: true };
    const remainder = match[3].trim();
    const amountMatches = [...remainder.matchAll(MONEY_RE)].filter((item) => /[.,]\d{2}|\b(?:CR|DR)\b/i.test(item[0]));
    if (!amountMatches.length) return null;
    const amountMatch = amountMatches[amountMatches.length - 1];
    let descriptionEnd = amountMatches[0].index;
    let rawAmount = amountMatch[0].trim();
    let amountRecoveredFromSplit = false;
    // OCR de telas pode separar a dezena do restante do valor, por exemplo
    // "$1 0.96". O prefixo continua visível e deve formar 10.96, não virar
    // parte do estabelecimento enquanto somente 0.96 é importado.
    if (amountMatches.length === 1) {
      const beforeAmount = remainder.slice(0, amountMatch.index);
      const splitPrefix = beforeAmount.match(/(?:CA\$|CAD|CAN|\$)\s*(\d{1,3})\s*$/i);
      const amountWithoutCurrency = rawAmount.replace(/(?:CA\$|CAD|CAN|\$)/gi, '').trim();
      if (splitPrefix && /^\d[,.]\d{2}$/.test(amountWithoutCurrency)) {
        rawAmount = `${splitPrefix[1]}${amountWithoutCurrency}`;
        descriptionEnd = beforeAmount.length - splitPrefix[0].length;
        amountRecoveredFromSplit = true;
      }
    }
    const rawDescription = remainder.slice(0, descriptionEnd).trim();
    if (!rawDescription) return null;
    const parsedAmount = parseMoney(rawAmount);
    if (parsedAmount === null) return null;
    const type = classifyType(rawDescription, parsedAmount);
    const bankIdMatch = rawDescription.match(/\b(?:ref(?:erence)?|auth(?:orization)?|autorisation|id)\s*[:#-]?\s*([a-z0-9-]{5,})\b/i);
    return {
      lineNumber,
      rawLine: line,
      rawDate: match[1],
      rawPostedDate: match[2] || '',
      date: transactionDate.value,
      postedDate: postedDate.value,
      dateAmbiguous: Boolean(transactionDate.ambiguous),
      postedDateAmbiguous: Boolean(postedDate.ambiguous),
      rawDescription,
      normalizedMerchant: normalizeMerchant(rawDescription),
      merchant: rawDescription.replace(/\s+/g, ' ').trim(),
      rawAmount,
      amount: signedAmount(parsedAmount, type),
      amountRecoveredFromSplit,
      type,
      bankTransactionId: bankIdMatch ? bankIdMatch[1] : '',
      multipleAmountColumns: amountMatches.length > 1,
      source: options.source || 'pdf'
    };
  }

  function identityKey(transaction, context = {}) {
    const method = transaction.paymentMethodId || context.paymentMethodId || '';
    if (transaction.bankTransactionId) return `${method}|bank:${normalizeText(transaction.bankTransactionId)}`;
    const cents = Math.round(Number(transaction.amount) * 100);
    // A identidade bancária precisa permanecer estável mesmo quando o usuário
    // corrige o nome exibido (por exemplo, "PHARMACIE GA..." -> "JEAN COUTU").
    // O texto original do extrato é imutável e, por isso, deve ter prioridade.
    return [method, transaction.date || '', transaction.postedDate || '', cents, transaction.type || '', normalizeMerchant(transaction.rawDescription || transaction.merchant), transaction.occurrence || 1].join('|');
  }

  function fingerprint(transaction, context = {}) {
    return hashString(identityKey(transaction, context));
  }

  function parseGenericStatementText(input, options = {}) {
    const pages = Array.isArray(input) ? input : String(input || '').split('\f');
    const fullText = pages.join('\n');
    const defaultYear = options.defaultYear || extractStatementYear(fullText);
    const manualDateOrder = ['MDY', 'DMY'].includes(options.dateOrder) ? options.dateOrder : '';
    const detectedDateOrder = manualDateOrder ? { order: manualDateOrder, source: 'manual' } : detectNumericDateOrder(fullText);
    const effectiveOptions = { ...options, dateOrder: detectedDateOrder.order, defaultYear };
    const parsed = [];
    const warnings = [];
    pages.forEach((page, pageIndex) => {
      String(page || '').split(/\r?\n/).forEach((line, lineIndex) => {
        const transaction = parseTransactionLine(line, effectiveOptions, lineIndex + 1);
        if (!transaction) return;
        transaction.page = pageIndex + 1;
        parsed.push(transaction);
      });
    });
    const occurrences = new Map();
    parsed.forEach((transaction) => {
      const base = [transaction.date, transaction.postedDate, Math.round(transaction.amount * 100), transaction.type, transaction.normalizedMerchant].join('|');
      const occurrence = (occurrences.get(base) || 0) + 1;
      occurrences.set(base, occurrence);
      transaction.occurrence = occurrence;
      transaction.fingerprint = fingerprint(transaction, options);
      transaction.validationIssues = [];
      if (!transaction.date) transaction.validationIssues.push(transaction.dateAmbiguous ? 'Data ambígua' : 'Data não identificada');
      if (!transaction.postedDate) transaction.validationIssues.push('Data de processamento ausente');
      if (transaction.multipleAmountColumns) transaction.validationIssues.push('Linha com mais de uma coluna monetária');
      if ([TYPE.PAYMENT, TYPE.TRANSFER].includes(transaction.type)) transaction.importable = false;
      else transaction.importable = true;
    });
    if (!fullText.trim()) warnings.push('O documento não possui texto selecionável.');
    if (fullText.trim() && !parsed.length) warnings.push('Nenhuma movimentação foi identificada com segurança.');
    return { adapter: 'generic-ca', pageCount: pages.length, transactions: parsed, warnings, statementYear: defaultYear || null, numericDateOrder: detectedDateOrder.order, numericDateOrderSource: detectedDateOrder.source };
  }

  const IMAGE_DATE_HEADER_RE = new RegExp(`(?:^|\\s)(${MONTH_TOKEN_SOURCE}\\s+\\d{1,2}(?:,?\\s+20\\d{2})?|\\d{1,2}\\s+${MONTH_TOKEN_SOURCE}(?:\\s+20\\d{2})?)(?:\\s|$)`, 'i');
  const IMAGE_NOISE_RE = /^(?:summary|transactions?|transaction glossary|search transactions?|check installment eligibility|pending|credit|cibc mastercard|rbc|royal bank|banque royale)$/i;

  function nextIsoDay(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return '';
    const date = new Date(`${value}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  }

  function imageDateHeader(line, defaultYear) {
    const normalizedLine = String(line || '')
      .replace(/(\d{1,2})\.\s*(20\d{2})\b/g, '$1, $2')
      .replace(/\s+/g, ' ')
      .trim();
    const match = normalizedLine.match(IMAGE_DATE_HEADER_RE);
    if (!match) return '';
    return parseDate(match[1].replace(',', ''), { defaultYear }).value;
  }

  function isImageNoise(line) {
    const compact = String(line || '').replace(/\s+/g, ' ').trim();
    if (!compact) return true;
    if (IMAGE_NOISE_RE.test(compact)) return true;
    // O modo sparse-text do OCR preserva valores isolados, mas também captura
    // texto da barra de navegação, números mascarados e banners do CIBC.
    if (/\b(?:transaction glossary|search transactions?|check installment eligibility|cibc mastercard)\b/i.test(compact)) return true;
    if (/\b(?:summary|transactions?)\b/i.test(compact) && compact.length < 30) return true;
    if (/\b(?:USD|EUR|GBP)\b.*@/i.test(compact)) return true; // Cotação de moeda estrangeira, não outra compra.
    if (/^.{0,9}\b(?:ull|full)\b.{0,12}$/i.test(compact)) return true; // Ícones/status do telefone via OCR.
    if (/^[a-z]{1,2}$/i.test(compact)) return true; // Ícones isolados reconhecidos como letras.
    if (/^(?:[\d]+(?:[.,]\d+)?|\d{1,2}:\d{2}|\d+%|[<>›]+)$/.test(compact)) return true;
    if (/^\d{1,2}:\d{2}\s+.{0,30}$/.test(compact)) return true; // Barra de status com hora do celular.
    if (/^.{0,10}(?:F[l1]\s+ED|[xX]9\s+Fl\s+ED)$/.test(compact)) return true;
    if (/^\d{4}\*{4,}\d{3,4}$/.test(compact.replace(/\s/g, ''))) return true;
    if (/(?:^52[2-3B][A-Z0-9*#\s]{4,}|^.{0,8}[A-Z0-9*#]{6,}\s*3[8B][0O]\b|5223|5380|5\s*3\s*[8B]\s*[0O]|5[3B][8B][0O])/i.test(compact) && /^[\w*#\s$?+©.,-]+$/.test(compact)) return true;
    if (/^[\W\dA-Z]*\b(?:FULL|WIFI)\b/i.test(compact) && compact.length < 24) return true;
    return false;
  }

  function prepareImageStatementText(input, options = {}) {
    const pages = Array.isArray(input) ? input : [String(input || '')];
    const statementYear = options.defaultYear || extractStatementYear(pages.join('\n')) || new Date().getFullYear();
    const extractedPages = [];
    const seenAcrossImages = new Set();
    const warnings = [];
    let pendingCount = 0;
    let inferredDates = 0;
    let unreadableValues = 0;

    pages.forEach((page) => {
      const entries = [];
      const beforeFirstDate = [];
      let currentDate = '';
      let pendingDescription = [];
      let lastEntry = null;
      let immediatelyAfterAmount = false;
      const lines = String(page || '').split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);

      const flushAmountLine = (line) => {
        // OCR pode inserir um espaço entre dígitos do preço: '$1 0.96'.
        // Recupere somente um dígito isolado antes de N,NN, sem supor preços
        // quando parte do valor estiver coberta ou fora da imagem.
        line = String(line).replace(/(\$)\s*(\d{1,2})\s+(\d[,.]\d{2})\b/g, (_, symbol, high, low) => `${symbol}${high}${low}`);
        // Imagens CIBC possuem sinal de moeda. Números sem '$' podem ser câmbio
        // (ex.: 23.00 USD @ 1.434782) ou parte de uma referência do cartão.
        const amountMatches = [...line.matchAll(MONEY_RE)].filter((item) => /[.,]\d{2}/.test(item[0]) && /(?:CA\$|CAD|\$)/i.test(item[0]));
        if (!amountMatches.length) return false;
        const amountMatch = amountMatches[amountMatches.length - 1];
        const prefix = line.slice(0, amountMatches[0].index);
        const hasLeadingCreditSign = /[-\u2212]\s*$/.test(prefix);
        const inlineDescription = prefix.replace(/[-\u2212]\s*$/, '').replace(/[>›]+$/g, '').trim();
        const description = [...pendingDescription, inlineDescription]
          .filter((part) => part && !isImageNoise(part))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        pendingDescription = [];
        if (!description) return true;
        let amountText = amountMatch[0].trim();
        if ((hasLeadingCreditSign || /\bcredit\b/i.test(line)) && !/^[-(]/.test(amountText)) amountText = `-${amountText}`;
        const entry = {
          date: currentDate, description, amountText,
          pending: /\bpending\b/i.test(line),
          credit: /\bcredit\b/i.test(line)
        };
        if (currentDate) entries.push(entry);
        else beforeFirstDate.push(entry);
        lastEntry = entry;
        immediatelyAfterAmount = true;
        return true;
      };

      lines.forEach((line) => {
        const headerDate = imageDateHeader(line, statementYear);
        if (headerDate) {
          if (!currentDate && beforeFirstDate.length) {
            const inferredDate = nextIsoDay(headerDate);
            beforeFirstDate.forEach((entry) => {
              entries.push({ ...entry, date: inferredDate, dateInferred: true });
            });
            beforeFirstDate.length = 0;
          }
          currentDate = headerDate;
          pendingDescription = [];
          lastEntry = null;
          immediatelyAfterAmount = false;
          return;
        }
        // O status costuma vir depois de número do cartão, em outra linha.
        if (/^(?:[^A-Za-z]{0,6})?(?:pending|credit)\W*$/i.test(line) || (line.length < 22 && /\b(?:pending|credit)\b/i.test(line) && !/\b(?:card|store|thank you)\b/i.test(line))) {
          if (lastEntry) {
            if (/pending/i.test(line)) lastEntry.pending = true;
            if (/credit/i.test(line)) lastEntry.credit = true;
          }
          return;
        }
        if (isImageNoise(line)) {
          // A próxima linha após o número mascarado já pode ser outra compra.
          if (/(?:5223|5380|5\s*3\s*[8B]\s*[0O]|5[3B][8B][0O]|\b380\b)/i.test(line)) immediatelyAfterAmount = false;
          return;
        }
        if (immediatelyAfterAmount && lastEntry && /^(?:[\p{L} .'-]{2,40},\s*(?:QC|ON|NS|BC|AB|MB|NB|SK|NL|PE|CA)|QC|ON|NS)$/iu.test(line)) {
          lastEntry.description += ` ${line}`;
          immediatelyAfterAmount = false;
          return;
        }
        if (flushAmountLine(line)) return;
        immediatelyAfterAmount = false;
        if (/^[$S]\s*\d{1,4}\s*[>›]?$/i.test(line) && pendingDescription.length) unreadableValues += 1;
        if (!/^\d+(?:[,.]\d+)?$/.test(line)) pendingDescription.push(line);
        if (pendingDescription.length > 3) pendingDescription.shift();
      });

      if (beforeFirstDate.length) warnings.push('Algumas compras no topo de uma imagem ficaram sem cabeçalho de data e não foram incluídas.');
      const canonicalLines = [];
      const seenOnPage = new Set();
      entries.forEach((entry) => {
        if (entry.pending) {
          pendingCount += 1;
          return; // Compras pendentes podem mudar de valor e ainda não possuem data confirmada.
        }
        const parsedAmount = parseMoney(entry.amountText);
        if (!entry.date || parsedAmount === null) return;
        const type = classifyType(entry.description, entry.credit ? -Math.abs(parsedAmount) : parsedAmount);
        const signed = signedAmount(entry.credit ? -Math.abs(parsedAmount) : parsedAmount, type);
        const key = [entry.date, normalizeMerchant(entry.description), Math.round(signed * 100), type].join('|');
        // Mantém duas compras reais iguais na mesma captura, mas elimina
        // movimentações repetidas entre imagens consecutivas sobrepostas.
        if (seenAcrossImages.has(key) && !seenOnPage.has(key)) return;
        seenAcrossImages.add(key);
        seenOnPage.add(key);
        if (entry.dateInferred) inferredDates += 1;
        // Delimita o valor positivo com CAD, impedindo que o último dígito
        // de um código Amazon (ex.: *ABC123) se una ao valor 111.25.
        // Para créditos, deixa o sinal antes do número, como o parser exige.
        const canonicalAmount = signed < 0 ? `${signed.toFixed(2)} CAD` : `CAD ${signed.toFixed(2)}`;
        canonicalLines.push(`${entry.date} ${entry.description} ${canonicalAmount}`);
      });
      extractedPages.push(canonicalLines.join('\n'));
    });

    if (pendingCount) warnings.push(`${pendingCount} compra(s) pendente(s) não incluída(s); aguarde a confirmação do banco.`);
    if (inferredDates) warnings.push(`A data de ${inferredDates} movimentação(ões) acima do primeiro cabeçalho foi inferida. Confira antes de importar.`);
    if (unreadableValues) warnings.push(`${unreadableValues} valor(es) ficaram ilegíveis ou cortados na captura; envie outra imagem mostrando o valor completo.`);
    if (!extractedPages.some((page) => page.trim())) warnings.push('Nenhuma movimentação com data e valor foi reconhecida nas imagens.');
    return { pages: extractedPages, warnings, statementYear };
  }

  function detectInstitution(input) {
    const text = normalizeText(Array.isArray(input) ? input.join('\n') : input);
    if (/\b(?:rbc|royal bank|banque royale)\b/.test(text)) return 'rbc';
    if (/\b(?:cibc|canadian imperial bank|banque canadienne imperiale)\b/.test(text)) return 'cibc';
    return 'generic';
  }

  function applyInstitutionAdapter(result, institution) {
    const adapted = {
      ...result,
      institution,
      adapter: institution === 'generic' ? result.adapter : `${institution}-ca-v1`,
      transactions: result.transactions.map((transaction) => ({
        ...transaction,
        institution,
        source: institution === 'generic' ? transaction.source : `${transaction.source === 'image' ? 'image' : 'pdf'}-${institution}`
      }))
    };
    adapted.transactions.forEach((transaction) => {
      const text = normalizeText(transaction.rawDescription);
      const issues = transaction.validationIssues || (transaction.validationIssues = []);
      if (institution === 'rbc' && /^\s*\^/.test(transaction.rawDescription)) {
        transaction.installmentCandidate = true;
        issues.push('Possível plano de parcelamento RBC');
      }
      if (institution === 'cibc' && /\b(?:pace it|plan de versements)\b/.test(text)) {
        transaction.installmentCandidate = true;
        issues.push('Possível plano CIBC Pace It');
      }
      if (transaction.multipleAmountColumns && !issues.includes('Confirme o valor correto entre as colunas do extrato')) {
        issues.push('Confirme o valor correto entre as colunas do extrato');
      }
    });
    return adapted;
  }

  function parseStatementText(input, options = {}) {
    const institution = options.institution || detectInstitution(input);
    return applyInstitutionAdapter(parseGenericStatementText(input, options), institution);
  }

  function cents(value) {
    return Math.round((Number(value) || 0) * 100);
  }

  function dateDistanceDays(left, right) {
    if (!left || !right) return Infinity;
    return Math.abs((new Date(`${left}T00:00:00Z`) - new Date(`${right}T00:00:00Z`)) / 86400000);
  }

  function merchantTokensApproximatelyEqual(leftToken, rightToken) {
    if (leftToken === rightToken) return true;
    if (Math.abs(leftToken.length - rightToken.length) > 1) return false;
    let leftIndex = 0;
    let rightIndex = 0;
    let differences = 0;
    while (leftIndex < leftToken.length && rightIndex < rightToken.length) {
      if (leftToken[leftIndex] === rightToken[rightIndex]) {
        leftIndex += 1;
        rightIndex += 1;
        continue;
      }
      differences += 1;
      if (differences > 1) return false;
      if (leftToken.length > rightToken.length) leftIndex += 1;
      else if (rightToken.length > leftToken.length) rightIndex += 1;
      else {
        leftIndex += 1;
        rightIndex += 1;
      }
    }
    if (leftIndex < leftToken.length || rightIndex < rightToken.length) differences += 1;
    return differences <= 1;
  }

  function merchantSimilarity(left, right) {
    const a = normalizeMerchant(left);
    const b = normalizeMerchant(right);
    if (!a || !b) return 0;
    if (a === b) return 1;
    // Nomes muito curtos (ex.: T&T) só podem casar exatamente. Procurá-los como
    // substring produz falsos positivos em frases como "PAYMENT - THANK YOU".
    const compactA = a.replace(/\s+/g, '');
    const compactB = b.replace(/\s+/g, '');
    if (compactA.length >= 4 && compactB.length >= 4 && (` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `))) return 1;
    // O banco frequentemente junta palavras que foram cadastradas separadas
    // (COUCHETARD/COUCHE-TARD, SUSHISHOP/SUSHI SHOP) e acrescenta a cidade.
    // Exigimos um núcleo com pelo menos 6 caracteres para não repetir o falso
    // positivo de nomes curtos como T&T.
    const shorterCompact = compactA.length <= compactB.length ? compactA : compactB;
    const longerCompact = compactA.length > compactB.length ? compactA : compactB;
    if (shorterCompact.length >= 6 && longerCompact.includes(shorterCompact)) return 1;
    const aTokenList = a.split(' ').filter((token) => token.length > 2 && /[a-z]/.test(token));
    const bTokenList = b.split(' ').filter((token) => token.length > 2 && /[a-z]/.test(token));
    const shorterTokens = aTokenList.length <= bTokenList.length ? aTokenList : bTokenList;
    const longerTokens = aTokenList.length > bTokenList.length ? aTokenList : bTokenList;
    const fuzzyCoreMatch =
      shorterTokens.length > 0 &&
      shorterTokens.join('').length >= 6 &&
      shorterTokens.every((token) => longerTokens.some((candidate) => token === candidate || (token.length >= 4 && candidate.length >= 4 && merchantTokensApproximatelyEqual(token, candidate))));
    if (fuzzyCoreMatch) return 0.9;
    const aTokens = new Set(aTokenList);
    const bTokens = new Set(bTokenList);
    if (!aTokens.size || !bTokens.size) return 0;
    const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
    return intersection / Math.max(aTokens.size, bTokens.size);
  }

  function reconciliationMerchantSimilarity(bankValue, registeredValue) {
    const similarity = merchantSimilarity(bankValue, registeredValue);
    const normalizedBank = normalizeMerchant(bankValue);
    const normalizedRegistered = normalizeMerchant(registeredValue);
    const bankTokens = normalizedBank.split(' ').filter(Boolean);
    const registeredTokens = normalizedRegistered.split(' ').filter(Boolean);
    if (!bankTokens.length || !registeredTokens.length) return similarity;
    const compactBank = normalizedBank.replace(/\s+/g, '');
    const compactRegistered = normalizedRegistered.replace(/\s+/g, '');
    if (compactRegistered.length >= 6 && compactBank.includes(compactRegistered)) return similarity;

    // "Amazon" pode identificar a empresa para fins de categoria, mas não
    // prova que a compra é o serviço específico "Amazon Prime". Quando o nome
    // cadastrado possui qualificadores que não aparecem no extrato, reduzimos
    // a confiança para a cobertura real desses termos.
    const covered = registeredTokens.filter((token) => bankTokens.some((candidate) =>
      token === candidate || (token.length >= 4 && candidate.length >= 4 && merchantTokensApproximatelyEqual(token, candidate))
    )).length;
    return Math.min(similarity, covered / registeredTokens.length);
  }

  function companiesForCategory(directory = {}, category = '') {
    const normalizedCategory = normalizeText(category);
    if (!normalizedCategory) return [];
    const matchingKey = Object.keys(directory || {}).find((key) => normalizeText(key) === normalizedCategory);
    if (!matchingKey) return [];
    const seen = new Set();
    return (directory[matchingKey] || []).map((company) => String(company || '').trim()).filter((company) => {
      const key = normalizeText(company);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function receiptIdentity(receipt) {
    return `${receipt.month || ''}:${receipt.id || hashString(JSON.stringify(receipt))}`;
  }

  function transactionMonths(transaction) {
    return new Set([transaction.date, transaction.postedDate].filter(Boolean).map((date) => String(date).slice(0, 7)));
  }

  function recordMonth(record) {
    return String(record.date || record.targetDate || record.month || record.receiptMonth || record.plannedMonth || '').slice(0, 7);
  }

  function isSameRelevantMonth(transaction, record) {
    const month = recordMonth(record);
    return Boolean(month && transactionMonths(transaction).has(month));
  }

  function protectedReceiptKind(receipt) {
    if (receipt.installmentPlanId) return 'installment';
    if (receipt.isStatic || receipt.staticSyncId) return 'static';
    return '';
  }

  function plannedIdentity(item) {
    return String(item?.id || '');
  }

  function createPlannedGuard(planned) {
    if (!plannedIdentity(planned)) return null;
    return {
      plannedId: plannedIdentity(planned),
      plannedMonth: planned.month || recordMonth(planned),
      expected: {
        date: planned.date || '',
        description: planned.description || planned.merchant || '',
        category: planned.category || '',
        owner: planned.owner || '',
        paymentMethodId: planned.paymentMethodId || '',
        amount: Number(planned.amount),
        fixed: Boolean(planned.fixed),
        isStatic: Boolean(planned.isStatic),
        staticSyncId: planned.staticSyncId || '',
        bankImportReceiptId: planned.bankImportReceiptId || ''
      }
    };
  }

  function installmentIdentity(planId, installmentNumber) {
    return `${planId || ''}:${Number(installmentNumber)}`;
  }

  function revalidationMatchKey(transaction) {
    if (transaction?.reviewMatchKey) return transaction.reviewMatchKey;
    if (transaction?.installmentPlanId && transaction.installmentNumber !== undefined && transaction.installmentNumber !== null) {
      return `installment:${installmentIdentity(transaction.installmentPlanId, transaction.installmentNumber)}`;
    }
    if (transaction?.linkedPlannedId) return `planned:${transaction.linkedPlannedId}`;
    if (transaction?.matchedReceipt?.id) return `receipt:${transaction.matchedReceipt.month || ''}:${transaction.matchedReceipt.id}`;
    return '';
  }

  function findDuplicate(transaction, existingReceipts, consumed = new Set()) {
    const available = (existingReceipts || []).filter((receipt) => !consumed.has(receiptIdentity(receipt)));
    const method = transaction.paymentMethodId || '';
    const exactImport = available.find((receipt) => receipt.bankImportFingerprint && receipt.bankImportFingerprint === transaction.fingerprint);
    if (exactImport) {
      return {
        status: STATUS.EXISTING,
        receipt: exactImport,
        reason: exactImport.bankImportDecision === 'already-registered' ? 'Confirmado anteriormente como já cadastrado' : 'Já importado anteriormente',
        confidence: 1
      };
    }
    if (transaction.bankTransactionId) {
      const exactBank = available.find((receipt) => receipt.paymentMethodId === method && receipt.bankTransactionId === transaction.bankTransactionId);
      if (exactBank) return { status: STATUS.EXISTING, receipt: exactBank, reason: 'Mesmo identificador bancário', confidence: 1 };
    }

    let possible = null;
    for (const receipt of available) {
      if ((receipt.paymentMethodId || '') !== method) continue;
      const sameNature = Math.sign(Number(receipt.amount)) === Math.sign(Number(transaction.amount));
      if (!sameNature) continue;
      const transactionDates = [transaction.date, transaction.postedDate].filter(Boolean);
      const receiptDates = [receipt.date, receipt.postedDate].filter(Boolean);
      const distance = Math.min(...transactionDates.flatMap((date) => receiptDates.map((other) => dateDistanceDays(date, other))), Infinity);
      // A sugestão de categoria pode trocar "AMAZON.CA*..." pelo nome genérico
      // "Amazon". Ela serve para preencher a interface, mas não é evidência de
      // que a compra corresponde a um fixo específico como "Amazon Prime".
      // Para conciliar duplicatas usamos primeiro a descrição original do banco.
      const similarity = reconciliationMerchantSimilarity(transaction.rawDescription || transaction.merchant, receipt.merchant || receipt.description);
      const displayedNameSimilarity = reconciliationMerchantSimilarity(transaction.merchant || transaction.rawDescription, receipt.merchant || receipt.description);
      const sameAmount = cents(receipt.amount) === cents(transaction.amount);
      const sameOwner = !receipt.owner || !transaction.owner || normalizeText(receipt.owner) === normalizeText(transaction.owner);
      const sameCategory = Boolean(
        receipt.category && transaction.category && normalizeText(receipt.category) === normalizeText(transaction.category)
      );
      const protectedKind = protectedReceiptKind(receipt);
      const contextualStaticMatch = protectedKind === 'static' && sameAmount && sameOwner && sameCategory && Math.max(similarity, displayedNameSimilarity) >= 0.4;
      if (protectedKind && isSameRelevantMonth(transaction, receipt) && (similarity >= 0.75 || contextualStaticMatch)) {
        if (protectedKind === 'installment' && sameAmount) {
          return { status: STATUS.EXISTING, receipt, reason: 'Parcela já possui Nota Real vinculada', confidence: 1, protectedMatch: true, allowImport: false };
        }
        if (protectedKind === 'static' && sameAmount && distance === 0) {
          return { status: STATUS.EXISTING, receipt, reason: 'Fixo estático já lançado automaticamente', confidence: 1, protectedMatch: true, allowImport: false };
        }
        const differences = [];
        if (!sameAmount) differences.push('valor');
        if (protectedKind === 'static' && distance !== 0) differences.push('data');
        return {
          status: STATUS.REVIEW,
          receipt,
          reason: `Divergência de ${differences.join(' e ') || 'dados'} com ${protectedKind === 'static' ? 'o fixo estático' : 'a parcela vinculada'}`,
          confidence: 0.99,
          protectedMatch: true,
          allowImport: false,
          reviewKind: REVIEW_KIND.PROTECTED
        };
      }
      // Notas criadas por esta importação têm identidade própria. Uma segunda
      // ocorrência legítima, embora visualmente idêntica, não pode ser absorvida
      // pela primeira apenas por método/valor/data/estabelecimento.
      if (receipt.bankImportFingerprint && transaction.fingerprint && receipt.bankImportFingerprint !== transaction.fingerprint) {
        // Importações antigas podiam recalcular a impressão depois de o nome do
        // estabelecimento ser corrigido. Nesses casos, permita a conciliação
        // visual somente quando a ocorrência também for a mesma. Isso mantém a
        // compatibilidade sem voltar a absorver uma segunda compra legítima e
        // idêntica do mesmo extrato.
        const receiptOccurrence = Number(receipt.bankImportOccurrence);
        const transactionOccurrence = Number(transaction.occurrence);
        const sameKnownOccurrence =
          Number.isInteger(receiptOccurrence) &&
          receiptOccurrence > 0 &&
          Number.isInteger(transactionOccurrence) &&
          transactionOccurrence > 0 &&
          receiptOccurrence === transactionOccurrence;
        if (!sameKnownOccurrence) continue;
      }
      if (!sameAmount) continue;
      if (distance === 0 && similarity >= 0.75) return { status: STATUS.EXISTING, receipt, reason: 'Mesmo método, valor, estabelecimento e data da compra ou processamento', confidence: 0.96 };
      if (distance === 0 && sameOwner && sameCategory) {
        return { status: STATUS.EXISTING, receipt, reason: 'Mesmo método, valor, data, categoria e responsável; descrição bancária diferente', confidence: 0.92 };
      }
      const transactionDate = transaction.date ? new Date(`${transaction.date}T00:00:00Z`) : null;
      const postedDate = transaction.postedDate ? new Date(`${transaction.postedDate}T00:00:00Z`) : null;
      const receiptDate = receipt.date ? new Date(`${receipt.date}T00:00:00Z`) : null;
      const processingSpanDays = transactionDate && postedDate ? Math.abs((postedDate - transactionDate) / 86400000) : Infinity;
      const processingStart = transactionDate && postedDate ? Math.min(transactionDate.getTime(), postedDate.getTime()) : 0;
      const processingEnd = transactionDate && postedDate ? Math.max(transactionDate.getTime(), postedDate.getTime()) : 0;
      const withinProvidedProcessingWindow = Boolean(receiptDate && processingSpanDays <= 5 && receiptDate.getTime() >= processingStart && receiptDate.getTime() <= processingEnd);
      if (withinProvidedProcessingWindow && similarity >= 0.9 && sameOwner) {
        return { status: STATUS.EXISTING, receipt, reason: 'Mesmo método, valor e estabelecimento, dentro do prazo normal de processamento do cartão', confidence: 0.94 };
      }
      if ((distance === 0 && similarity < 0.75) || (distance <= 5 && similarity >= 0.75)) {
        const candidate = { status: STATUS.REVIEW, receipt, reason: 'Possível lançamento correspondente', confidence: distance === 0 ? 0.72 : 0.68, reviewKind: REVIEW_KIND.POSSIBLE_DUPLICATE };
        if (!possible || candidate.confidence > possible.confidence) possible = candidate;
      }
    }
    return possible;
  }

  function findPlannedMatch(transaction, plannedItems = [], options = {}) {
    const linkedPlannedIds = options.linkedPlannedIds || new Set();
    const reservedPlannedIds = options.reservedPlannedIds || new Set();
    const candidates = (plannedItems || [])
      .filter((item) => (item.paymentMethodId || '') === (transaction.paymentMethodId || '') && isSameRelevantMonth(transaction, item))
      .map((item) => {
        const similarity = reconciliationMerchantSimilarity(transaction.rawDescription || transaction.merchant, item.description || item.merchant);
        const amountMatches = cents(item.amount) === cents(transaction.amount);
        const distance = Math.min(dateDistanceDays(transaction.date, item.date), dateDistanceDays(transaction.postedDate, item.date));
        const score = similarity * 100 + (amountMatches ? 20 : 0) + (distance === 0 ? 10 : distance <= 3 ? 4 : 0) + (item.fixed ? 5 : 0);
        const id = plannedIdentity(item);
        const unavailable = Boolean(item.bankImportReceiptId || linkedPlannedIds.has(id) || reservedPlannedIds.has(id));
        return { item, similarity, amountMatches, distance, score, unavailable };
      })
      .filter((candidate) => candidate.similarity >= 0.55)
      .sort((left, right) => right.score - left.score);
    return candidates.find((candidate) => !candidate.unavailable) || candidates[0] || null;
  }

  function findInstallmentMatch(transaction, installmentPlans = [], existingReceipts = [], plannedItems = [], options = {}) {
    const reservedInstallments = options.reservedInstallments || new Set();
    const candidates = [];
    for (const plan of installmentPlans || []) {
      if ((plan.paymentMethodId || '') !== (transaction.paymentMethodId || '')) continue;
      for (const installment of plan.installments || []) {
        if (!isSameRelevantMonth(transaction, installment)) continue;
        const amountMatches = cents(installment.paidAmount ?? installment.amount) === cents(transaction.amount);
        const linkedReceipt = (existingReceipts || []).find(
          (receipt) =>
            (installment.receiptId && receipt.id === installment.receiptId && (!installment.receiptMonth || receipt.month === installment.receiptMonth)) ||
            (receipt.installmentPlanId === plan.id && Number(receipt.installmentNumber) === Number(installment.number))
        );
        const linkedPlanned = (plannedItems || []).find(
          (item) =>
            (installment.plannedId && item.id === installment.plannedId && (!installment.plannedMonth || item.month === installment.plannedMonth)) ||
            (item.installmentPlanId === plan.id && Number(item.installmentNumber) === Number(installment.number))
        );
        const similarity = Math.max(
          reconciliationMerchantSimilarity(transaction.rawDescription || transaction.merchant, plan.name || ''),
          reconciliationMerchantSimilarity(transaction.rawDescription || transaction.merchant, linkedPlanned?.description || linkedPlanned?.merchant || '')
        );
        if (similarity < 0.55) continue;
        const score = similarity * 100 + (amountMatches ? 20 : 0) + (linkedReceipt ? 30 : 0) + (linkedPlanned ? 10 : 0);
        candidates.push({
          plan,
          installment,
          linkedReceipt,
          linkedPlanned,
          similarity,
          amountMatches,
          score,
          unavailable: reservedInstallments.has(installmentIdentity(plan.id, installment.number))
        });
      }
    }
    return candidates.sort((left, right) => right.score - left.score)[0] || null;
  }

  function installmentMatchResult(transaction, match) {
    if (!match) return null;
    const { plan, installment, linkedReceipt, linkedPlanned, amountMatches } = match;
    if (match.unavailable) {
      return {
        ...transaction,
        status: STATUS.REVIEW,
        statusReason: 'Esta parcela já foi reservada por outra movimentação deste extrato; trate esta compra separadamente',
        matchedReceipt: linkedPlanned || null,
        reviewKind: REVIEW_KIND.USER_CONFIRMABLE,
        reviewMatchKey: `installment-reserved:${installmentIdentity(plan.id, installment.number)}`,
        approved: false,
        allowImport: true
      };
    }
    const canonical = {
      ...transaction,
      merchant: plan.name || transaction.merchant,
      category: plan.category || transaction.category || '',
      owner: plan.owner || transaction.owner,
      paymentMethodId: plan.paymentMethodId || transaction.paymentMethodId,
      linkedPlannedId: linkedPlanned?.id || '',
      installmentPlanId: plan.id,
      installmentNumber: installment.number,
      installmentCount: plan.installmentCount || plan.installments?.length || null,
      installmentMode: plan.mode || '',
      installmentStage: installment.type || null,
      rentalNumber: installment.rentalNumber || null,
      rentalCount: installment.rentalCount || plan.rentalMonths || null,
      matchedInstallment: { planId: plan.id, number: installment.number, status: installment.status || 'pending' }
    };
    if (linkedReceipt) {
      if (amountMatches) {
        return { ...canonical, status: STATUS.EXISTING, statusReason: 'Parcela já possui Nota Real vinculada', matchedReceipt: linkedReceipt, approved: false, allowImport: false, protectedMatch: true, reviewKind: REVIEW_KIND.PROTECTED };
      }
      return { ...canonical, status: STATUS.REVIEW, statusReason: 'Divergência de valor com a parcela que já possui Nota Real', matchedReceipt: linkedReceipt, approved: false, allowImport: false, protectedMatch: true, reviewKind: REVIEW_KIND.PROTECTED };
    }
    if (installment.receiptId || ['paid', 'cancelled'].includes(installment.status)) {
      return { ...canonical, status: STATUS.REVIEW, statusReason: 'A parcela já está protegida pelo plano e não pode gerar outra Nota Real', approved: false, allowImport: false, protectedMatch: true, reviewKind: REVIEW_KIND.PROTECTED };
    }
    const staticAutomation = plan.automationMode === 'fixed-static-clone' || linkedPlanned?.isStatic || linkedPlanned?.staticSyncId;
    if (staticAutomation) {
      return { ...canonical, status: STATUS.REVIEW, statusReason: 'Parcela estática deve ser conciliada com a Nota automática, sem criar outra', matchedReceipt: linkedPlanned || null, approved: false, allowImport: false, protectedMatch: true, reviewKind: REVIEW_KIND.PROTECTED };
    }
    if (!['pending', 'budgeted'].includes(installment.status || 'pending')) {
      return { ...canonical, status: STATUS.REVIEW, statusReason: 'Status da parcela não permite criar uma Nota Real', approved: false, allowImport: false, protectedMatch: true, reviewKind: REVIEW_KIND.PROTECTED };
    }
    return {
      ...canonical,
      status: STATUS.REVIEW,
      statusReason: amountMatches ? 'Parcela pendente encontrada; confirme a conciliação' : 'Valor diferente da parcela pendente; confirme a conciliação',
      approved: false,
      allowImport: true,
      reviewKind: REVIEW_KIND.INSTALLMENT,
      reviewMatchKey: `installment:${installmentIdentity(plan.id, installment.number)}`,
      plannedGuard: linkedPlanned ? createPlannedGuard(linkedPlanned) : null,
      installmentGuard: {
        planId: plan.id,
        installmentNumber: installment.number,
        expectedStatus: installment.status || 'pending',
        expectedReceiptId: '',
        expectedPlannedId: installment.plannedId || '',
        expectedAmount: installment.amount
      }
    };
  }

  function categoryCandidates(transaction, context = {}) {
    const candidates = [];
    const aliases = context.aliases || {};
    const normalized = normalizeMerchant(transaction.rawDescription || transaction.merchant);
    const alias = aliases[normalized];
    if (alias) candidates.push({ merchant: alias.merchant || transaction.merchant, category: alias.category || '', confidence: 1, source: 'alias' });

    // A descrição enviada pelo banco muda entre lojas, cidades e extratos. Uma
    // associação aprendida para "CO-QC-CARREFOUR ..." também deve servir para
    // outra descrição que ainda contenha o mesmo estabelecimento canônico.
    // Mantemos o limiar alto para não transformar nomes curtos em falsos
    // positivos (merchantSimilarity já exige igualdade para casos como T&T).
    if (!alias) {
      Object.values(aliases).forEach((savedAlias) => {
        if (!savedAlias?.merchant) return;
        const similarity = Math.max(
          reconciliationMerchantSimilarity(transaction.rawDescription || '', savedAlias.merchant),
          reconciliationMerchantSimilarity(transaction.merchant || '', savedAlias.merchant)
        );
        if (similarity >= 0.9) {
          candidates.push({
            merchant: savedAlias.merchant,
            category: savedAlias.category || '',
            confidence: similarity * 0.98,
            source: 'alias-similar'
          });
        }
      });
    }

    for (const receipt of context.existingReceipts || []) {
      const similarity = reconciliationMerchantSimilarity(transaction.rawDescription || transaction.merchant, receipt.merchant || receipt.description);
      if (similarity >= 0.75 && receipt.category) candidates.push({ merchant: receipt.merchant, category: receipt.category, confidence: similarity * 0.95, source: 'history' });
    }

    const directory = context.companyDirectory || {};
    Object.entries(directory).forEach(([category, companies]) => {
      (companies || []).forEach((company) => {
        const name = typeof company === 'string' ? company : company?.name;
        const similarity = merchantSimilarity(transaction.merchant || transaction.rawDescription, name);
        if (name && similarity >= 0.75) candidates.push({ merchant: name, category, confidence: similarity * 0.9, source: 'directory' });
      });
    });
    return candidates.sort((left, right) => right.confidence - left.confidence)[0] || null;
  }

  function buildMerchantAlias(transaction) {
    if (!transaction || [TYPE.PAYMENT, TYPE.TRANSFER].includes(transaction.type)) return null;
    const normalizedDescription = normalizeMerchant(transaction.rawDescription || '');
    const merchant = String(transaction.merchant || '').trim();
    if (!normalizedDescription || !merchant) return null;
    return {
      normalizedDescription,
      merchant,
      category: String(transaction.category || '').trim()
    };
  }

  function reconcileTransactions(transactions, existingReceipts = [], context = {}) {
    const consumed = new Set();
    const linkedPlannedIds = new Set(
      (existingReceipts || []).map((receipt) => plannedIdentity({ id: receipt.linkedPlannedId })).filter(Boolean)
    );
    const reservedPlannedIds = context.reservedPlannedIds || new Set();
    const reservedInstallments = context.reservedInstallments || new Set();
    return (transactions || []).map((original) => {
      const transaction = { ...original, paymentMethodId: original.paymentMethodId || context.paymentMethodId || '', owner: original.owner || context.owner || '' };
      transaction.fingerprint = transaction.fingerprint || fingerprint(transaction, context);
      if (!transaction.importable || [TYPE.PAYMENT, TYPE.TRANSFER].includes(transaction.type)) {
        return { ...transaction, status: STATUS.IGNORED, statusReason: transaction.type === TYPE.PAYMENT ? 'Pagamento de fatura não é uma nova despesa' : 'Transferência não é uma nova despesa', approved: false };
      }
      const suggestion = categoryCandidates(transaction, { ...context, existingReceipts });
      if (suggestion) {
        transaction.merchant = suggestion.merchant;
        transaction.category = transaction.category || suggestion.category;
        transaction.suggestion = suggestion;
      }
      if (transaction.multipleAmountColumns) {
        return { ...transaction, status: STATUS.INVALID, statusReason: 'Há mais de uma coluna monetária; confirme manualmente o valor da movimentação', approved: false };
      }
      if (!transaction.date || !transaction.paymentMethodId || !Number.isFinite(Number(transaction.amount)) || Number(transaction.amount) === 0) {
        return { ...transaction, status: STATUS.INVALID, statusReason: 'Complete data, método e valor antes de importar', approved: false };
      }
      const duplicate = findDuplicate(transaction, existingReceipts, consumed);
      if (duplicate) {
        if (duplicate.status === STATUS.EXISTING) consumed.add(receiptIdentity(duplicate.receipt));
        const hasRequiredFields = Boolean(String(transaction.category || '').trim() && String(transaction.merchant || '').trim());
        const possibleDuplicate = duplicate.status === STATUS.REVIEW;
        return {
          ...transaction,
          status: duplicate.status,
          statusReason: possibleDuplicate
            ? `${duplicate.reason}. Confira o lançamento encontrado abaixo antes de decidir.`
            : duplicate.reason,
          matchedReceipt: duplicate.receipt,
          approved: false,
          allowImport: duplicate.allowImport !== false && (!possibleDuplicate || hasRequiredFields),
          missingRequiredFields: possibleDuplicate && !hasRequiredFields,
          protectedMatch: Boolean(duplicate.protectedMatch),
          reviewKind: duplicate.reviewKind || (duplicate.protectedMatch ? REVIEW_KIND.PROTECTED : duplicate.status === STATUS.REVIEW ? REVIEW_KIND.POSSIBLE_DUPLICATE : '')
        };
      }

      const installmentMatch = findInstallmentMatch(transaction, context.installmentPlans || [], existingReceipts, context.plannedItems || [], { reservedInstallments });
      const installmentResult = installmentMatchResult(transaction, installmentMatch);
      if (installmentResult) {
        if (installmentResult.installmentGuard) reservedInstallments.add(installmentIdentity(installmentResult.installmentPlanId, installmentResult.installmentNumber));
        return installmentResult;
      }

      const plannedMatch = findPlannedMatch(transaction, context.plannedItems || [], { linkedPlannedIds, reservedPlannedIds });
      if (plannedMatch) {
        const planned = plannedMatch.item;
        const plannedId = plannedIdentity(planned);
        const isProtectedStatic = Boolean(planned.isStatic || planned.staticSyncId);
        if (plannedMatch.unavailable) {
          return {
            ...transaction,
            status: STATUS.REVIEW,
            statusReason: isProtectedStatic
              ? 'O item estático já está vinculado ou reservado e não pode gerar outra Nota Real'
              : 'O item previsto correspondente já está vinculado ou reservado; esta movimentação não herdará o vínculo',
            matchedReceipt: planned,
            reviewKind: isProtectedStatic ? REVIEW_KIND.PROTECTED : REVIEW_KIND.PLANNED_ALREADY_USED,
            reviewMatchKey: `planned-used:${plannedId}`,
            approved: false,
            protectedMatch: isProtectedStatic,
            allowImport: !isProtectedStatic
          };
        }
        reservedPlannedIds.add(plannedId);
        const canonicalName = planned.description || planned.merchant || transaction.merchant;
        return {
          ...transaction,
          category: planned.category || transaction.category || '',
          merchant: canonicalName,
          owner: planned.owner || transaction.owner,
          paymentMethodId: planned.paymentMethodId || transaction.paymentMethodId,
          linkedPlannedId: planned.id || '',
          installmentPlanId: planned.installmentPlanId || '',
          installmentNumber: planned.installmentNumber ?? null,
          installmentCount: planned.installmentCount ?? null,
          installmentMode: planned.installmentMode || '',
          installmentStage: planned.installmentStage || null,
          rentalNumber: planned.rentalNumber || null,
          rentalCount: planned.rentalCount || null,
          status: STATUS.REVIEW,
          statusReason: isProtectedStatic
            ? 'Item estático do orçamento: concilie com a Nota automática, sem criar outra'
            : planned.fixed
              ? 'Fixo do orçamento encontrado; confirme o lançamento com os dados cadastrados'
              : 'Pode corresponder a um item do orçamento',
          matchedReceipt: planned,
          matchedPlannedFixed: Boolean(planned.fixed),
          matchedPlannedIsStatic: isProtectedStatic,
          protectedMatch: isProtectedStatic,
          allowImport: !isProtectedStatic,
          reviewKind: isProtectedStatic ? REVIEW_KIND.PROTECTED : REVIEW_KIND.PLANNED,
          reviewMatchKey: `planned:${plannedId}`,
          plannedGuard: isProtectedStatic ? null : createPlannedGuard(planned),
          approved: false
        };
      }
      if (!transaction.category || !transaction.merchant) {
        return {
          ...transaction,
          status: STATUS.REVIEW,
          statusReason: 'Nenhum lançamento correspondente encontrado; o valor foi lido do extrato. Confirme estabelecimento e categoria',
          reviewKind: REVIEW_KIND.MISSING_FIELDS,
          allowImport: false,
          approved: false
        };
      }
      const hasReviewIssue = (transaction.validationIssues || []).some((issue) => issue !== 'Data de processamento ausente');
      if (hasReviewIssue) return { ...transaction, status: STATUS.REVIEW, statusReason: transaction.validationIssues.join('; '), reviewKind: REVIEW_KIND.USER_CONFIRMABLE, allowImport: true, approved: false };
      return { ...transaction, status: STATUS.NEW, statusReason: 'Nenhuma correspondência relevante', approved: true };
    });
  }

  function decideRevalidation(original, fresh) {
    if (!fresh) return { action: 'blocked', transaction: { ...original, approved: false, statusReason: 'Não foi possível revalidar este lançamento.' } };
    if (original?.allowImport === false || original?.protectedMatch || original?.reviewKind === REVIEW_KIND.PROTECTED) {
      return { action: 'blocked', transaction: { ...fresh, approved: false, allowImport: false, protectedMatch: true, reviewKind: REVIEW_KIND.PROTECTED, statusReason: original.statusReason || fresh.statusReason } };
    }
    if (fresh.status === STATUS.EXISTING) return { action: 'existing', transaction: fresh };
    if (fresh.allowImport === false || fresh.protectedMatch || fresh.reviewKind === REVIEW_KIND.PROTECTED || [STATUS.INVALID, STATUS.IGNORED].includes(fresh.status)) {
      return { action: 'blocked', transaction: fresh };
    }
    const previousMatch = revalidationMatchKey(original);
    const freshMatch = revalidationMatchKey(fresh);
    if (fresh.status === STATUS.REVIEW) {
      if (fresh.reviewKind === REVIEW_KIND.POSSIBLE_DUPLICATE) {
        if (original?.duplicateDecision === 'import' && original?.approved && previousMatch && previousMatch === freshMatch) {
          return { action: 'save', transaction: fresh };
        }
        return {
          action: 'blocked',
          transaction: { ...fresh, approved: false, statusReason: 'Decida explicitamente se já está cadastrado ou se é outra compra antes de importar' }
        };
      }
      if (fresh.reviewKind === REVIEW_KIND.USER_CONFIRMABLE && original?.approved) {
        return { action: 'save', transaction: fresh };
      }
      if (original?.approved && previousMatch && previousMatch === freshMatch) {
        return { action: 'save', transaction: fresh };
      }
      return {
        action: 'blocked',
        transaction: { ...fresh, approved: false, statusReason: `${fresh.statusReason || 'Nova correspondência encontrada'}; revise novamente antes de importar` }
      };
    }
    if (previousMatch && previousMatch !== freshMatch) {
      return {
        action: 'blocked',
        transaction: { ...fresh, status: STATUS.REVIEW, approved: false, statusReason: 'O vínculo mudou durante a revisão; confira novamente antes de importar' }
      };
    }
    return { action: 'save', transaction: fresh };
  }

  function buildReceipt(transaction, context = {}) {
    if (transaction.allowImport === false || transaction.matchedPlannedIsStatic || transaction.staticSyncId) {
      throw new Error('Este lançamento está protegido por um vínculo estático ou já conciliado e não pode gerar outra Nota Real.');
    }
    if (!String(transaction.category || '').trim() || !String(transaction.merchant || '').trim()) {
      throw new Error('Categoria e estabelecimento são obrigatórios para criar uma Nota Real.');
    }
    const type = transaction.type || TYPE.EXPENSE;
    const receipt = {
      date: transaction.date,
      postedDate: transaction.postedDate || '',
      category: transaction.category,
      merchant: transaction.merchant,
      amount: signedAmount(transaction.amount, type),
      owner: transaction.owner || context.owner,
      paymentMethodId: transaction.paymentMethodId || context.paymentMethodId,
      observation: transaction.observation || `Importado de extrato • ${transaction.rawDescription || transaction.merchant}`,
      isStatic: false,
      isReimbursement: type === TYPE.REFUND,
      bankTransactionId: transaction.bankTransactionId || '',
      bankImportFingerprint: transaction.fingerprint || fingerprint(transaction, context),
      bankImportSource: transaction.source || 'pdf',
      bankImportType: type,
      bankImportOccurrence: Number(transaction.occurrence) || 1,
      bankImportIdentityKey: identityKey(transaction, context)
    };
    ['linkedPlannedId', 'installmentPlanId', 'installmentNumber', 'installmentCount', 'installmentMode', 'installmentStage', 'rentalNumber', 'rentalCount'].forEach((field) => {
      if (transaction[field] !== undefined && transaction[field] !== null && transaction[field] !== '') receipt[field] = transaction[field];
    });
    return receipt;
  }

  function relevantMonths(transactions) {
    const months = new Set();
    (transactions || []).forEach((transaction) => {
      [transaction.date, transaction.postedDate].filter(Boolean).forEach((date) => {
        const base = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
        [-1, 0, 1].forEach((offset) => {
          const shifted = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + offset, 1));
          months.add(`${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`);
        });
      });
    });
    return [...months].sort();
  }

  function summarizeImportTotals(transactions = []) {
    const selectable = (transaction) =>
      transaction.approved &&
      transaction.allowImport !== false &&
      ![STATUS.EXISTING, STATUS.INVALID, STATUS.IGNORED].includes(transaction.status);
    return (transactions || []).reduce(
      (totals, transaction) => {
        const value = Math.abs(Number(transaction.amount) || 0);
        if (transaction.type === TYPE.EXPENSE) {
          totals.foundExpenses += value;
          if (selectable(transaction)) totals.selectedExpenses += value;
        } else if ([TYPE.CREDIT, TYPE.REFUND].includes(transaction.type)) {
          totals.foundCredits += value;
          if (selectable(transaction)) totals.selectedCredits += value;
        }
        return totals;
      },
      { foundExpenses: 0, selectedExpenses: 0, foundCredits: 0, selectedCredits: 0 }
    );
  }

  return {
    STATUS,
    TYPE,
    REVIEW_KIND,
    normalizeText,
    normalizeMerchant,
    parseMoney,
    parseDate,
    detectNumericDateOrder,
    classifyType,
    signedAmount,
    hashString,
    parseTransactionLine,
    detectInstitution,
    parseStatementText,
    prepareImageStatementText,
    fingerprint,
    identityKey,
    merchantSimilarity,
    companiesForCategory,
    findDuplicate,
    findPlannedMatch,
    findInstallmentMatch,
    installmentMatchResult,
    revalidationMatchKey,
    decideRevalidation,
    categoryCandidates,
    buildMerchantAlias,
    reconcileTransactions,
    buildReceipt,
    relevantMonths,
    summarizeImportTotals
  };
});
