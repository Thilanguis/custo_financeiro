const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BankImport = require('../docs/bank-import');
const PdfStatementReader = require('../docs/pdf-statement-reader');
const ImageStatementReader = require('../docs/image-statement-reader');

function loadFinanceApiWithFakeFirestore(initialDocuments = {}) {
  const documents = new Map(Object.entries(initialDocuments));
  class Reference {
    constructor(parts) { this.parts = parts; this.path = parts.join('/'); }
    collection(name) { return new Reference([...this.parts, name]); }
    doc(id) { return new Reference([...this.parts, String(id)]); }
  }
  const db = {
    collection(name) { return new Reference([name]); },
    async runTransaction(callback) {
      const transaction = {
        async get(reference) {
          const data = documents.get(reference.path);
          return { exists: data !== undefined, data: () => (data === undefined ? undefined : structuredClone(data)) };
        },
        set(reference, data, options = {}) {
          const previous = documents.get(reference.path) || {};
          documents.set(reference.path, structuredClone(options.merge ? { ...previous, ...data } : data));
        },
        update(reference, data) {
          if (!documents.has(reference.path)) throw new Error(`Documento ausente: ${reference.path}`);
          const updated = { ...documents.get(reference.path) };
          Object.entries(data).forEach(([key, value]) => {
            if (value === '__DELETE_FIELD__') delete updated[key];
            else updated[key] = value;
          });
          documents.set(reference.path, structuredClone(updated));
        },
        delete(reference) { documents.delete(reference.path); }
      };
      return callback(transaction);
    }
  };
  const context = {
    window: { db, auth: {} },
    firebase: {
      firestore: { FieldValue: { serverTimestamp: () => '__SERVER_TIMESTAMP__', delete: () => '__DELETE_FIELD__' } },
      auth: { Auth: { Persistence: { LOCAL: 'local' } } }
    },
    console
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../docs/firebase-api.js'), 'utf8'), context);
  return { api: context.window.FinanceAPI, documents };
}

function transaction(overrides = {}) {
  const base = {
    date: '2026-08-20',
    postedDate: '2026-08-21',
    rawDescription: 'SUPERMARKET #88421 MONTREAL QC',
    merchant: 'Supermarket',
    normalizedMerchant: 'supermarket',
    category: 'Mercado',
    amount: 87.4,
    type: BankImport.TYPE.EXPENSE,
    paymentMethodId: 'visa-main',
    owner: 'Gabriel',
    occurrence: 1,
    importable: true,
    validationIssues: []
  };
  const value = { ...base, ...overrides };
  value.fingerprint = BankImport.fingerprint(value, { paymentMethodId: value.paymentMethodId });
  return value;
}

test('interpreta valores canadenses em inglês e francês sem perder centavos', () => {
  assert.equal(BankImport.parseMoney('CA$ 1,234.56'), 1234.56);
  assert.equal(BankImport.parseMoney('1 234,56 $'), 1234.56);
  assert.equal(BankImport.parseMoney('(54.30)'), -54.3);
  assert.equal(BankImport.parseMoney('87,40 CR'), -87.4);
});

test('interpreta datas inglesas e francesas e não inventa ordem numérica ambígua', () => {
  assert.equal(BankImport.parseDate('AUG 20 2026').value, '2026-08-20');
  assert.equal(BankImport.parseDate('20 AOÛT 2026').value, '2026-08-20');
  assert.equal(BankImport.parseDate('2026-09-01').value, '2026-09-01');
  assert.equal(BankImport.parseDate('08/09/2026').ambiguous, true);
  assert.equal(BankImport.parseDate('08/09/2026', { dateOrder: 'MDY' }).value, '2026-08-09');
  assert.equal(BankImport.parseDate('08/09/2026', { dateOrder: 'DMY' }).value, '2026-09-08');
});

test('detecta automaticamente a ordem numérica pelo documento e permite substituição manual', () => {
  assert.deepEqual(BankImport.detectNumericDateOrder('Relevé bancaire\nDATE DE L OPÉRATION\n08/09/2026'), { order: 'DMY', source: 'document-language' });
  assert.deepEqual(BankImport.detectNumericDateOrder('Statement period\nTransaction Date Posting Date Amount\n08/09/2026'), { order: 'MDY', source: 'document-language' });
  assert.deepEqual(BankImport.detectNumericDateOrder('13/08/2026'), { order: 'DMY', source: 'unambiguous-date' });

  const automatic = BankImport.parseStatementText('Relevé 2026\n08/09/2026 MERCADO 10,00', { paymentMethodId: 'rbc' });
  const forced = BankImport.parseStatementText('Relevé 2026\n08/09/2026 MERCADO 10,00', { paymentMethodId: 'rbc', dateOrder: 'MDY' });
  assert.equal(automatic.transactions[0].date, '2026-09-08');
  assert.equal(automatic.numericDateOrderSource, 'document-language');
  assert.equal(forced.transactions[0].date, '2026-08-09');
  assert.equal(forced.numericDateOrderSource, 'manual');
});

test('tenta a ordem numérica contrária quando a primeira produz uma data impossível', () => {
  const parsed = BankImport.parseDate('08/13/2026', { dateOrder: 'DMY' });
  assert.equal(parsed.value, '2026-08-13');
  assert.equal(parsed.dateOrder, 'MDY');
  assert.equal(parsed.usedOppositeOrder, true);
});

test('extrai PDF textual com múltiplas páginas e múltiplos meses', () => {
  const pages = [
    'Statement period 2026\nAUG 20 AUG 21 SUPERMARKET #1234 87.40\nAUG 22 RESTAURANT MONTRÉAL QC 36,90',
    'SEP 01 SEP 02 GAS STATION 54.00\nSEP 03 PAYMENT RECEIVED 500.00 CR'
  ];
  const result = BankImport.parseStatementText(pages, { paymentMethodId: 'visa-main' });
  assert.equal(result.pageCount, 2);
  assert.equal(result.transactions.length, 4);
  assert.deepEqual(result.transactions.slice(0, 3).map((item) => item.date), ['2026-08-20', '2026-08-22', '2026-09-01']);
  assert.equal(result.transactions[0].postedDate, '2026-08-21');
  assert.equal(result.transactions[1].postedDate, '');
  assert.equal(result.transactions[3].type, BankImport.TYPE.PAYMENT);
  assert.equal(result.transactions[3].importable, false);
});

test('reconhece abreviações francesas acentuadas e não inventa o ano em período cruzado', () => {
  const french = BankImport.parseStatementText('Relevé 2026\n20 AOÛT 21 AOÛT ÉPICERIE 44,10', { paymentMethodId: 'debit-main' });
  assert.equal(french.transactions[0].date, '2026-08-20');
  assert.equal(french.transactions[0].postedDate, '2026-08-21');
  const crossYear = BankImport.parseStatementText('Période 2026 - 2027\nDÉC. 31 MAGASIN 10,00', { paymentMethodId: 'debit-main' });
  assert.equal(crossYear.transactions[0].date, '');
  assert.equal(crossYear.transactions[0].dateAmbiguous, true);
});

test('usa o ano do cabeçalho RBC francês e ignora ano antigo do rodapé legal', () => {
  const result = BankImport.parseStatementText([
    'RBC Banque Royale',
    'Revel� du 05 SEPT au 05 OCT 2026',
    '04 SEP 08 SEP JEAN COUTU 0296 LONGUEUIL QC 14,94 $',
    '30 SEP 01 OCT HOMESENSE 040 POINTE-CLAIRE QC 14,94 $',
    'Renseignements contractuels (04/2023)'
  ].join('\n'), { paymentMethodId: 'rbc-luana' });

  assert.equal(result.institution, 'rbc');
  assert.equal(result.transactions.length, 2);
  assert.deepEqual(
    result.transactions.map((item) => [item.date, item.postedDate]),
    [
      ['2026-09-04', '2026-09-08'],
      ['2026-09-30', '2026-10-01']
    ]
  );
  assert.equal(result.transactions.every((item) => !item.validationIssues.includes('Data não identificada')), true);
});

test('usa o ano predominante quando o PDF.js fragmenta o cabeçalho RBC', () => {
  const fragmentedHeader = [
    'RBC Banque Royale Relevé du 05 SEPT',
    'CONTEÚDO POSICIONADO ENTRE AS COLUNAS '.repeat(8),
    '05 OCT 2026 Date d échéance 26 OCT 2026',
    '04 SEP 08 SEP JEAN COUTU LONGUEUIL QC 14,94 $',
    'Version contractuelle 04/2023'
  ].join('\n');
  const result = BankImport.parseStatementText(fragmentedHeader, { paymentMethodId: 'rbc-luana' });
  assert.equal(result.statementYear, 2026);
  assert.equal(result.transactions[0].date, '2026-09-04');
  assert.equal(result.transactions[0].postedDate, '2026-09-08');
});

test('detecta RBC e preserva datas, pagamentos e indicação de parcelamento', () => {
  const result = BankImport.parseStatementText([
    'RBC Royal Bank Statement 2026',
    'Transaction Date Posting Date Activity Description Amount',
    'AUG 01 AUG 02 ^ELECTRONICS STORE 100.00',
    'AUG 03 AUG 04 PAYMENT - THANK YOU 500.00-'
  ].join('\n'), { paymentMethodId: 'rbc-visa' });
  assert.equal(result.institution, 'rbc');
  assert.equal(result.adapter, 'rbc-ca-v1');
  assert.equal(result.transactions[0].date, '2026-08-01');
  assert.equal(result.transactions[0].postedDate, '2026-08-02');
  assert.equal(result.transactions[0].installmentCandidate, true);
  assert.match(result.transactions[0].validationIssues.join(' '), /parcelamento RBC/i);
  assert.equal(result.transactions[1].type, BankImport.TYPE.PAYMENT);
  assert.equal(result.transactions[1].importable, false);
});

test('detecta CIBC e sinaliza possível CIBC Pace It para conciliação', () => {
  const result = BankImport.parseStatementText([
    'CIBC Statement 2026',
    'Your new charges and credits',
    'AUG 10 AUG 11 CIBC PACE IT PLAN FEE 15.00'
  ].join('\n'), { paymentMethodId: 'cibc-visa' });
  assert.equal(result.institution, 'cibc');
  assert.equal(result.adapter, 'cibc-ca-v1');
  assert.equal(result.transactions[0].installmentCandidate, true);
  assert.match(result.transactions[0].validationIssues.join(' '), /CIBC Pace It/i);
});

test('RBC ou CIBC com várias colunas monetárias nunca é aprovado sem correção manual', () => {
  const parsed = BankImport.parseStatementText([
    'RBC Royal Bank Account Statement 2026',
    'Date Description Withdrawals Deposits Balance',
    'AUG 12 GROCERY STORE 25.00 1,250.00'
  ].join('\n'), { paymentMethodId: 'rbc-chequing' });
  assert.equal(parsed.transactions[0].rawDescription, 'GROCERY STORE');
  assert.equal(parsed.transactions[0].multipleAmountColumns, true);
  const [result] = BankImport.reconcileTransactions(parsed.transactions.map((item) => ({ ...item, paymentMethodId: 'rbc-chequing', category: 'Mercado' })), []);
  assert.equal(result.status, BankImport.STATUS.INVALID);
  assert.equal(result.approved, false);
  assert.match(result.statusReason, /mais de uma coluna monetária/i);
});

test('normaliza códigos de terminal sem criar uma empresa diferente', () => {
  assert.equal(BankImport.normalizeMerchant('POS SUPERMARKET #88421 MONTREAL QC'), 'supermarket montreal');
  assert.equal(BankImport.merchantSimilarity('SUPERMARKET #111', 'Supermarket'), 1);
  assert.equal(BankImport.merchantSimilarity('COUCHETARD #492 LONGUEUIL QC', 'COUCHE-TARD'), 1);
  assert.equal(BankImport.merchantSimilarity('SUSHI SHOP - 2326 BOUCHERVILLE QC', 'SUSHISHOP'), 1);
  assert.equal(BankImport.merchantSimilarity('JEAN COUTU 0296 LONGUEUIL QC', 'JEAN COUTO'), 0.9);
  assert.equal(BankImport.merchantSimilarity('CO-QC-CARREFOUR DE LA RIVBOUCHERVILLE', 'Carrefour'), 1);
});

test('correção Carrefour é memorizável antes da importação', () => {
  assert.deepEqual(BankImport.buildMerchantAlias({
    rawDescription: 'CO-QC-CARREFOUR DE LA RIVBOUCHERVILLE',
    merchant: 'Carrefour',
    category: 'Supermercado',
    type: BankImport.TYPE.EXPENSE
  }), {
    normalizedDescription: 'co carrefour de la rivboucherville',
    merchant: 'Carrefour',
    category: 'Supermercado'
  });
});

test('associação Carrefour é reaproveitada mesmo com outro prefixo, loja e cidade', () => {
  const originalDescription = BankImport.normalizeMerchant('CO-QC-CARREFOUR DE LA RIVBOUCHERVILLE');
  const item = transaction({
    date: '2026-10-10',
    postedDate: '2026-10-11',
    rawDescription: 'CARREFOUR #1842 LONGUEUIL QC',
    merchant: 'CARREFOUR #1842 LONGUEUIL QC',
    category: '',
    amount: 26.4
  });
  const [result] = BankImport.reconcileTransactions([item], [], {
    aliases: {
      [originalDescription]: {
        normalizedDescription: originalDescription,
        merchant: 'Carrefour',
        category: 'Supermercado'
      }
    }
  });
  assert.equal(result.merchant, 'Carrefour');
  assert.equal(result.category, 'Supermercado');
  assert.equal(result.suggestion.source, 'alias-similar');
  assert.equal(result.status, BankImport.STATUS.NEW);
});

test('texto bancário longo encontra a Nota Carrefour já cadastrada', () => {
  const item = transaction({
    date: '2026-10-10',
    postedDate: '2026-10-11',
    rawDescription: 'CO-QC-CARREFOUR DE LA RIVBOUCHERVILLE',
    merchant: 'CO-QC-CARREFOUR DE LA RIVBOUCHERVILLE',
    category: '',
    amount: 26.4
  });
  const existing = [{
    id: 'carrefour-existing',
    month: '2026-10',
    date: '2026-10-10',
    merchant: 'Carrefour',
    category: 'Supermercado',
    amount: 26.4,
    paymentMethodId: 'visa-main'
  }];
  const [result] = BankImport.reconcileTransactions([item], existing);
  assert.equal(result.status, BankImport.STATUS.EXISTING);
  assert.equal(result.merchant, 'Carrefour');
  assert.equal(result.category, 'Supermercado');
  assert.equal(result.matchedReceipt.id, 'carrefour-existing');
});

test('compra e Nota com pequena variação no nome e até cinco dias são Já cadastrado', () => {
  const bankItem = transaction({
    date: '2026-09-04',
    postedDate: '2026-09-08',
    merchant: 'JEAN COUTU',
    rawDescription: 'JEAN COUTU 0296 LONGUEUIL QC',
    amount: 14.94,
    paymentMethodId: 'rbc-luana',
    owner: 'Luana'
  });
  const existing = [{ id: 'jean-couto', month: '2026-09', date: '2026-09-06', merchant: 'JEAN COUTO', amount: 14.94, paymentMethodId: 'rbc-luana', owner: 'Luana' }];
  const [result] = BankImport.reconcileTransactions([bankItem], existing);
  assert.equal(result.status, BankImport.STATUS.EXISTING);
  assert.equal(result.matchedReceipt.id, 'jean-couto');
  assert.match(result.statusReason, /prazo normal de processamento/i);
});

test('mesmo valor e data com estabelecimento realmente diferente continua em revisão', () => {
  const bankItem = transaction({ date: '2026-09-09', postedDate: '2026-09-10', merchant: 'HPB CAFETERIA', rawDescription: 'HPB CAFETERIA LONGUEUIL QC', amount: 11.62 });
  const existing = [{ id: 'refeitorio', month: '2026-09', date: '2026-09-09', merchant: 'REFEITÓRIO PIERRE BOUCHER', amount: 11.62, paymentMethodId: 'visa-main' }];
  const [result] = BankImport.reconcileTransactions([bankItem], existing);
  assert.equal(result.status, BankImport.STATUS.REVIEW);
  assert.equal(result.reviewKind, BankImport.REVIEW_KIND.POSSIBLE_DUPLICATE);
});

test('valor RBC entre parênteses é lido como crédito e não fica inválido', () => {
  const parsed = BankImport.parseTransactionLine('16 SEP 17 SEP PROVIGO LE MARCHE LONG LONGUEUIL QC (16,10 $)', { defaultYear: 2026, paymentMethodId: 'rbc-luana' }, 1);
  assert.equal(parsed.rawAmount, '(16,10 $)');
  assert.equal(parsed.amount, -16.1);
  assert.equal(parsed.type, BankImport.TYPE.CREDIT);
  assert.equal(parsed.multipleAmountColumns, false);

  const [result] = BankImport.reconcileTransactions([{ ...parsed, category: 'Supermercado', owner: 'Luana', paymentMethodId: 'rbc-luana', fingerprint: BankImport.fingerprint(parsed) }], []);
  assert.notEqual(result.status, BankImport.STATUS.INVALID);
});

test('mesmo valor, método, estabelecimento e data de compra ou processamento é Já cadastrado', () => {
  const bankItem = transaction({
    date: '2026-07-08',
    postedDate: '2026-07-09',
    rawDescription: 'COUCHETARD #492 LONGUEUIL QC',
    merchant: 'COUCHETARD #492 LONGUEUIL QC',
    category: '',
    amount: 18.12,
    paymentMethodId: 'rbc-luana',
    owner: 'Luana'
  });
  const purchaseDateReceipt = { id: 'couche-purchase', month: '2026-07', date: '2026-07-08', merchant: 'COUCHE-TARD', category: 'Transporte', amount: 18.12, paymentMethodId: 'rbc-luana' };
  const postedDateReceipt = { ...purchaseDateReceipt, id: 'couche-posted', date: '2026-07-09' };

  const [purchaseDateResult] = BankImport.reconcileTransactions([bankItem], [purchaseDateReceipt]);
  const [postedDateResult] = BankImport.reconcileTransactions([bankItem], [postedDateReceipt]);
  assert.equal(purchaseDateResult.status, BankImport.STATUS.EXISTING);
  assert.equal(purchaseDateResult.matchedReceipt.id, 'couche-purchase');
  assert.equal(postedDateResult.status, BankImport.STATUS.EXISTING);
  assert.equal(postedDateResult.matchedReceipt.id, 'couche-posted');
});

test('nome realmente diferente continua em revisão mesmo com valor e data iguais', () => {
  const bankItem = transaction({ date: '2026-07-25', postedDate: '2026-07-27', merchant: 'CARIBOU GOURMAND MONTREAL', rawDescription: 'CARIBOU GOURMAND MONTREAL QC', amount: 37.98 });
  const existing = [{ id: 'generic-cafe', month: '2026-07', date: '2026-07-25', merchant: 'CAFÉ', category: 'Jantar fora', amount: 37.98, paymentMethodId: 'visa-main' }];
  const [result] = BankImport.reconcileTransactions([bankItem], existing);
  assert.equal(result.status, BankImport.STATUS.REVIEW);
  assert.equal(result.reviewKind, BankImport.REVIEW_KIND.POSSIBLE_DUPLICATE);
});

test('uma Nota existente é consumida uma vez quando há duas compras iguais no extrato', () => {
  const first = transaction({ date: '2026-07-27', postedDate: '2026-07-28', merchant: 'SUSHI SHOP - 2326 BOUCHERVILLE QC', rawDescription: 'SUSHI SHOP - 2326 BOUCHERVILLE QC', amount: 100.41, occurrence: 1 });
  const second = { ...first, occurrence: 2 };
  second.fingerprint = BankImport.fingerprint(second);
  const existing = [{ id: 'sushi-existing', month: '2026-07', date: '2026-07-27', merchant: 'SUSHISHOP', category: 'Jantar fora', amount: 100.41, paymentMethodId: 'visa-main' }];
  const results = BankImport.reconcileTransactions([first, second], existing);
  assert.equal(results[0].status, BankImport.STATUS.EXISTING);
  assert.notEqual(results[1].status, BankImport.STATUS.EXISTING);
});

test('pagamentos ignorados não recebem sugestão e nomes curtos não geram falso positivo', () => {
  assert.equal(BankImport.merchantSimilarity('PAYMENT - THANK YOU / PAIEMENT - MERCI', 'T&T'), 0);
  assert.equal(BankImport.merchantSimilarity('T&T #12345', 'T&T'), 1);
  const payment = transaction({
    rawDescription: 'PAYMENT - THANK YOU / PAIEMENT - MERCI',
    merchant: 'PAYMENT - THANK YOU / PAIEMENT - MERCI',
    category: '',
    amount: -500,
    type: BankImport.TYPE.PAYMENT,
    importable: false
  });
  const [result] = BankImport.reconcileTransactions([payment], [], { companyDirectory: { Mercado: ['T&T'] } });
  assert.equal(result.status, BankImport.STATUS.IGNORED);
  assert.equal(result.merchant, payment.merchant);
  assert.equal(result.category, '');
  assert.equal(result.suggestion, undefined);
});

test('reconhece lançamento já cadastrado manualmente', () => {
  const item = transaction();
  const existing = [{
    id: 'manual-1',
    month: '2026-08',
    date: '2026-08-20',
    postedDate: '2026-08-21',
    merchant: 'SUPERMARKET',
    category: 'Mercado',
    amount: 87.4,
    paymentMethodId: 'visa-main',
    isStatic: false
  }];
  const [result] = BankImport.reconcileTransactions([item], existing);
  assert.equal(result.status, BankImport.STATUS.EXISTING);
  assert.equal(result.matchedReceipt.id, 'manual-1');
  assert.equal(result.approved, false);
});

test('mesmo extrato repetido ou extratos sobrepostos usam a mesma impressão digital', () => {
  const first = transaction();
  const overlapping = transaction({ rawDescription: 'SUPERMARKET #88421 MONTREAL QC' });
  assert.equal(first.fingerprint, overlapping.fingerprint);
  const history = [{ id: 'bank-1', bankImportFingerprint: first.fingerprint }];
  const [result] = BankImport.reconcileTransactions([overlapping], history);
  assert.equal(result.status, BankImport.STATUS.EXISTING);
  assert.match(result.statusReason, /importado/i);
});

test('correção do nome não altera a impressão digital do texto bancário original', () => {
  const original = transaction({
    date: '2026-10-06',
    postedDate: '2026-10-07',
    rawDescription: 'PHARMACIE GA BOUCHERVI BOUCHERVILLE QC',
    merchant: 'PHARMACIE GA BOUCHERVI BOUCHERVILLE QC',
    amount: 34.45,
    paymentMethodId: 'cibc-luana',
    owner: 'Luana'
  });
  const corrected = { ...original, merchant: 'JEAN COUTU' };
  assert.equal(BankImport.fingerprint(original), BankImport.fingerprint(corrected));
});

test('reimportação reconhece Nota antiga cujo nome corrigido mudou a impressão', () => {
  const item = transaction({
    date: '2026-10-06',
    postedDate: '2026-10-07',
    rawDescription: 'PHARMACIE GA BOUCHERVI BOUCHERVILLE QC',
    merchant: 'PHARMACIE GA BOUCHERVI BOUCHERVILLE QC',
    category: '',
    amount: 34.45,
    paymentMethodId: 'cibc-luana',
    owner: 'Luana',
    occurrence: 1
  });
  const existing = [{
    id: 'jean-coutu-importado',
    month: '2026-10',
    date: '2026-10-06',
    postedDate: '2026-10-07',
    merchant: 'JEAN COUTU',
    category: 'Saúde',
    amount: 34.45,
    owner: 'Luana',
    paymentMethodId: 'cibc-luana',
    bankImportFingerprint: 'impressao-legada-diferente',
    bankImportOccurrence: 1
  }];
  const aliasKey = BankImport.normalizeMerchant(item.rawDescription);
  const [result] = BankImport.reconcileTransactions([item], existing, {
    aliases: { [aliasKey]: { merchant: 'JEAN COUTU', category: 'Saúde' } }
  });
  assert.equal(result.status, BankImport.STATUS.EXISTING);
  assert.equal(result.matchedReceipt.id, 'jean-coutu-importado');
  assert.equal(result.merchant, 'JEAN COUTU');
});

test('ocorrência diferente não é absorvida por Nota importada visualmente igual', () => {
  const second = transaction({
    date: '2026-10-06',
    postedDate: '2026-10-07',
    rawDescription: 'PHARMACIE GA BOUCHERVI BOUCHERVILLE QC',
    merchant: 'JEAN COUTU',
    category: 'Saúde',
    amount: 34.45,
    paymentMethodId: 'cibc-luana',
    owner: 'Luana',
    occurrence: 2
  });
  const existing = [{
    id: 'primeira-compra',
    month: '2026-10',
    date: '2026-10-06',
    postedDate: '2026-10-07',
    merchant: 'JEAN COUTU',
    category: 'Saúde',
    amount: 34.45,
    owner: 'Luana',
    paymentMethodId: 'cibc-luana',
    bankImportFingerprint: 'impressao-da-primeira-compra',
    bankImportOccurrence: 1
  }];
  const [result] = BankImport.reconcileTransactions([second], existing);
  assert.notEqual(result.status, BankImport.STATUS.EXISTING);
});

test('decisão manual de já cadastrado é persistida e reconhecida na reimportação', async () => {
  const item = transaction({ rawDescription: 'MANUAL MATCH BANK TEXT', merchant: 'Nome diferente', category: 'Lojas' });
  const { api, documents } = loadFinanceApiWithFakeFirestore();
  const first = await api.saveBankImportExistingDecision(item);
  assert.equal(first.alreadyRecorded, false);
  const importPath = `familias/familia-gabriel-luana/importacoes_bancarias/tx_${item.fingerprint}`;
  const savedDecision = documents.get(importPath);
  assert.equal(savedDecision.decision, 'already-registered');
  assert.equal([...documents.keys()].some((key) => key.includes('/notas_fiscais/')), false);

  const second = await api.saveBankImportExistingDecision(item);
  assert.equal(second.alreadyRecorded, true);
  const [reimported] = BankImport.reconcileTransactions([item], [{
    id: `tx_${item.fingerprint}`,
    month: item.date.slice(0, 7),
    paymentMethodId: item.paymentMethodId,
    bankImportFingerprint: item.fingerprint,
    bankImportDecision: savedDecision.decision
  }]);
  assert.equal(reimported.status, BankImport.STATUS.EXISTING);
  assert.match(reimported.statusReason, /confirmado anteriormente/i);
});

test('duas compras legítimas iguais no mesmo dia não são colapsadas em uma só', () => {
  const parsed = BankImport.parseStatementText(
    'Statement 2026\nAUG 20 COFFEE SHOP 8.50\nAUG 20 COFFEE SHOP 8.50',
    { paymentMethodId: 'debit-main' }
  ).transactions.map((item) => ({ ...item, paymentMethodId: 'debit-main', owner: 'Luana', merchant: 'Coffee Shop', category: 'Restaurante' }));
  assert.equal(parsed.length, 2);
  assert.notEqual(parsed[0].fingerprint, parsed[1].fingerprint);
  const existing = [{ id: 'one', date: '2026-08-20', merchant: 'Coffee Shop', category: 'Restaurante', amount: 8.5, paymentMethodId: 'debit-main' }];
  const reconciled = BankImport.reconcileTransactions(parsed, existing);
  assert.equal(reconciled.filter((item) => item.status === BankImport.STATUS.EXISTING).length, 1);
  assert.equal(reconciled.filter((item) => item.status === BankImport.STATUS.NEW).length, 1);
});

test('confirmação sequencial preserva duas compras iguais e a reimportação reconhece ambas', async () => {
  const parsed = BankImport.parseStatementText(
    'Statement 2026\nAUG 20 COFFEE SHOP 8.50\nAUG 20 COFFEE SHOP 8.50',
    { paymentMethodId: 'debit-main' }
  ).transactions.map((item) => ({ ...item, paymentMethodId: 'debit-main', owner: 'Luana', merchant: 'Coffee Shop', category: 'Restaurante' }));
  const initial = BankImport.reconcileTransactions(parsed, []);
  assert.deepEqual(initial.map((item) => item.status), [BankImport.STATUS.NEW, BankImport.STATUS.NEW]);
  assert.notEqual(initial[0].fingerprint, initial[1].fingerprint);

  const { api, documents } = loadFinanceApiWithFakeFirestore();
  const persisted = [];
  for (let index = 0; index < initial.length; index += 1) {
    const original = { ...initial[index], approved: true };
    const [fresh] = BankImport.reconcileTransactions([parsed[index]], persisted);
    const decision = BankImport.decideRevalidation(original, fresh);
    assert.equal(decision.action, 'save');
    const receipt = BankImport.buildReceipt(decision.transaction);
    const month = receipt.date.slice(0, 7);
    const saved = await api.saveImportedReceiptAtomic(month, receipt, { fingerprint: receipt.bankImportFingerprint, source: 'pdf' });
    assert.equal(saved.alreadyImported, false);
    persisted.push({ ...receipt, id: saved.receiptId, month });
  }
  assert.equal([...documents.keys()].filter((key) => key.includes('/notas_fiscais/')).length, 2);

  const reimported = BankImport.reconcileTransactions(parsed, persisted);
  assert.deepEqual(reimported.map((item) => item.status), [BankImport.STATUS.EXISTING, BankImport.STATUS.EXISTING]);
  const repeatedReceipt = BankImport.buildReceipt({ ...parsed[0], allowImport: true });
  const repeated = await api.saveImportedReceiptAtomic('2026-08', repeatedReceipt, { fingerprint: repeatedReceipt.bankImportFingerprint, source: 'pdf' });
  assert.equal(repeated.alreadyImported, true);
});

test('um fixo comum é reservado uma vez no lote e compras adicionais não herdam seu vínculo', () => {
  const items = [
    transaction({ rawDescription: 'NETFLIX COM #400281', merchant: 'Netflix', category: 'Assinaturas', amount: 22.99, occurrence: 1 }),
    transaction({ rawDescription: 'NETFLIX COM #400281', merchant: 'Netflix', category: 'Assinaturas', amount: 22.99, occurrence: 2 })
  ];
  items.forEach((item, index) => { item.fingerprint = BankImport.fingerprint(item); item.occurrence = index + 1; item.fingerprint = BankImport.fingerprint(item); });
  const planned = [{ id: 'planned-netflix', month: '2026-08', date: '2026-08-20', description: 'Netflix', category: 'Assinaturas', owner: 'Luana', amount: 22.99, paymentMethodId: 'visa-main', fixed: true, isStatic: false }];
  const results = BankImport.reconcileTransactions(items, [], { plannedItems: planned });
  assert.equal(results[0].linkedPlannedId, 'planned-netflix');
  assert.equal(results[0].reviewKind, BankImport.REVIEW_KIND.PLANNED);
  assert.equal(results[1].linkedPlannedId, undefined);
  assert.equal(results[1].reviewKind, BankImport.REVIEW_KIND.PLANNED_ALREADY_USED);
  assert.match(results[1].statusReason, /não herdará o vínculo/i);

  const existingLinked = [{ id: 'real-netflix', month: '2026-08', date: '2026-08-19', merchant: 'Netflix', amount: 20, paymentMethodId: 'visa-main', linkedPlannedId: 'planned-netflix' }];
  const [afterExistingLink] = BankImport.reconcileTransactions([items[0]], existingLinked, { plannedItems: planned });
  assert.equal(afterExistingLink.linkedPlannedId, undefined);
  assert.equal(afterExistingLink.reviewKind, BankImport.REVIEW_KIND.PLANNED_ALREADY_USED);
});

test('revisão RBC aprovada pode salvar, mas proteção crítica não pode ser contornada por edição', () => {
  const rbc = transaction({ rawDescription: '^ELECTRONICS STORE', merchant: 'Electronics Store', category: 'Eletrônicos', validationIssues: ['Possível plano de parcelamento RBC'] });
  const [review] = BankImport.reconcileTransactions([rbc], []);
  assert.equal(review.reviewKind, BankImport.REVIEW_KIND.USER_CONFIRMABLE);
  const [freshReview] = BankImport.reconcileTransactions([rbc], []);
  assert.equal(BankImport.decideRevalidation({ ...review, approved: true }, freshReview).action, 'save');

  const protectedOriginal = { ...review, approved: true, allowImport: false, protectedMatch: true, reviewKind: BankImport.REVIEW_KIND.PROTECTED, statusReason: 'Fixo estático protegido' };
  const editedFresh = { ...freshReview, status: BankImport.STATUS.NEW, allowImport: true, protectedMatch: false, reviewKind: '' };
  const protectedDecision = BankImport.decideRevalidation(protectedOriginal, editedFresh);
  assert.equal(protectedDecision.action, 'blocked');
  assert.equal(protectedDecision.transaction.allowImport, false);
});

test('persistência reserva linkedPlannedId atomicamente e rejeita alteração ou segunda vinculação', async () => {
  const plannedPath = 'familias/familia-gabriel-luana/meses/2026-08/orcamento_previsto/planned-netflix';
  const planned = { date: '2026-08-20', description: 'Netflix', category: 'Assinaturas', owner: 'Luana', paymentMethodId: 'visa-main', amount: 22.99, fixed: true, isStatic: false };
  const { api, documents } = loadFinanceApiWithFakeFirestore({ [plannedPath]: planned });
  const guard = {
    plannedId: 'planned-netflix',
    plannedMonth: '2026-08',
    expected: { ...planned, staticSyncId: '', bankImportReceiptId: '' }
  };
  const first = BankImport.buildReceipt(transaction({ merchant: 'Netflix', rawDescription: 'NETFLIX COM #400281', category: 'Assinaturas', owner: 'Luana', amount: 22.99, linkedPlannedId: 'planned-netflix' }));
  const saved = await api.saveImportedReceiptAtomic('2026-08', first, { fingerprint: first.bankImportFingerprint, source: 'pdf', plannedGuard: guard });
  assert.equal(saved.plannedLinked, true);
  assert.equal(documents.get(plannedPath).bankImportReceiptId, saved.receiptId);

  const secondSource = transaction({ merchant: 'Netflix', rawDescription: 'NETFLIX COM #400281', category: 'Assinaturas', owner: 'Luana', amount: 22.99, occurrence: 2, linkedPlannedId: 'planned-netflix' });
  secondSource.fingerprint = BankImport.fingerprint(secondSource);
  const second = BankImport.buildReceipt(secondSource);
  await assert.rejects(
    api.saveImportedReceiptAtomic('2026-08', second, { fingerprint: second.bankImportFingerprint, source: 'pdf', plannedGuard: guard }),
    /alterado|reservado/i
  );

  await api.deleteImportedReceiptAndReleasePlannedClaim('2026-08', saved.receiptId, 'planned-netflix');
  assert.equal(documents.get(plannedPath).bankImportReceiptId, undefined);
  assert.equal(documents.has(`familias/familia-gabriel-luana/meses/2026-08/notas_fiscais/${saved.receiptId}`), false);
  const savedAfterRelease = await api.saveImportedReceiptAtomic('2026-08', second, { fingerprint: second.bankImportFingerprint, source: 'pdf', plannedGuard: guard });
  assert.equal(savedAfterRelease.plannedLinked, true);

  const changedPlanned = { ...planned, amount: 24.99 };
  const changedEnvironment = loadFinanceApiWithFakeFirestore({ [plannedPath]: changedPlanned });
  await assert.rejects(
    changedEnvironment.api.saveImportedReceiptAtomic('2026-08', first, { fingerprint: first.bankImportFingerprint, source: 'pdf', plannedGuard: guard }),
    /dados financeiros.*mudaram/i
  );
});

test('preserva data da compra e processamento no modelo de Nota Real', () => {
  const receipt = BankImport.buildReceipt(transaction());
  assert.equal(receipt.date, '2026-08-20');
  assert.equal(receipt.postedDate, '2026-08-21');
  assert.equal(receipt.paymentMethodId, 'visa-main');
  assert.equal(receipt.amount, 87.4);
});

test('estornos e créditos ficam negativos; pagamentos e transferências são ignorados', () => {
  const parsed = BankImport.parseStatementText([
    'Statement 2026',
    'AUG 20 REFUND STORE 10.00',
    'AUG 21 CASHBACK CREDIT 5.00 CR',
    'AUG 22 PAYMENT RECEIVED 300.00 CR',
    'AUG 23 INTERAC TRANSFER 40.00'
  ].join('\n'), { paymentMethodId: 'visa-main' }).transactions;
  assert.equal(parsed[0].type, BankImport.TYPE.REFUND);
  assert.equal(parsed[0].amount, -10);
  assert.equal(parsed[1].type, BankImport.TYPE.CREDIT);
  assert.equal(parsed[1].amount, -5);
  const reconciled = BankImport.reconcileTransactions(parsed.map((item) => ({ ...item, paymentMethodId: 'visa-main' })), []);
  assert.equal(reconciled[2].status, BankImport.STATUS.IGNORED);
  assert.equal(reconciled[3].status, BankImport.STATUS.IGNORED);
  assert.equal(BankImport.classifyType('INTERAC PURCHASE GROCERY', 25), BankImport.TYPE.EXPENSE);
  assert.equal(BankImport.classifyType('INTERAC E-TRANSFER', 25), BankImport.TYPE.TRANSFER);
});

test('categoria desconhecida exige revisão e associação confirmada é reutilizada', () => {
  const unknown = transaction({ category: '', merchant: 'RAW UNKNOWN SHOP', rawDescription: 'RAW UNKNOWN SHOP 9283' });
  const [review] = BankImport.reconcileTransactions([unknown], []);
  assert.equal(review.status, BankImport.STATUS.REVIEW);
  assert.match(review.statusReason, /valor foi lido do extrato/i);
  assert.equal(review.matchedReceipt, undefined);
  const normalized = BankImport.normalizeMerchant(unknown.rawDescription);
  const [known] = BankImport.reconcileTransactions([unknown], [], {
    aliases: { [normalized]: { merchant: 'Loja Conhecida', category: 'Casa' } }
  });
  assert.equal(known.category, 'Casa');
  assert.equal(known.merchant, 'Loja Conhecida');
  assert.equal(known.status, BankImport.STATUS.NEW);
});

test('possível duplicata sem categoria ou estabelecimento nunca pode gerar Nota Real', async () => {
  const item = transaction({ date: '2026-08-20', postedDate: '', merchant: 'Coffee Shop', rawDescription: 'COFFEE SHOP', category: '', amount: 8.5 });
  const existing = [{ id: 'possible', month: '2026-08', date: '2026-08-19', merchant: 'Coffee Shop', category: '', amount: 8.5, paymentMethodId: 'visa-main' }];
  const [review] = BankImport.reconcileTransactions([item], existing);
  assert.equal(review.status, BankImport.STATUS.REVIEW);
  assert.equal(review.reviewKind, BankImport.REVIEW_KIND.POSSIBLE_DUPLICATE);
  assert.equal(review.allowImport, false);
  assert.equal(review.missingRequiredFields, true);
  assert.match(review.statusReason, /lançamento encontrado/i);
  assert.throws(() => BankImport.buildReceipt({ ...review, allowImport: true }), /categoria e estabelecimento/i);

  const { api } = loadFinanceApiWithFakeFirestore();
  await assert.rejects(
    api.saveImportedReceiptAtomic('2026-08', { ...BankImport.buildReceipt(transaction()), category: '', bankImportFingerprint: 'abcdef1234567890' }, { fingerprint: 'abcdef1234567890' }),
    /categoria e estabelecimento/i
  );
});

test('possível duplicata exige decisão explícita e permite confirmar que é outra compra', () => {
  const item = transaction({ date: '2026-08-20', postedDate: '', merchant: 'Coffee Shop', rawDescription: 'COFFEE SHOP', category: 'Restaurante', amount: 8.5 });
  const existing = [{ id: 'possible', month: '2026-08', date: '2026-08-19', merchant: 'Coffee Shop', category: 'Restaurante', amount: 8.5, paymentMethodId: 'visa-main' }];
  const [review] = BankImport.reconcileTransactions([item], existing);
  const [fresh] = BankImport.reconcileTransactions([item], existing);
  assert.equal(BankImport.decideRevalidation({ ...review, approved: true }, fresh).action, 'blocked');
  assert.equal(BankImport.decideRevalidation({ ...review, approved: true, duplicateDecision: 'import' }, fresh).action, 'save');
});

test('totais distinguem despesas encontradas no PDF das selecionadas para importar', () => {
  const totals = BankImport.summarizeImportTotals([
    { type: BankImport.TYPE.EXPENSE, amount: 10, status: BankImport.STATUS.NEW, approved: true, allowImport: true },
    { type: BankImport.TYPE.EXPENSE, amount: 20, status: BankImport.STATUS.REVIEW, approved: false, allowImport: true },
    { type: BankImport.TYPE.PAYMENT, amount: 100, status: BankImport.STATUS.IGNORED, approved: false },
    { type: BankImport.TYPE.REFUND, amount: -5, status: BankImport.STATUS.NEW, approved: true, allowImport: true }
  ]);
  assert.deepEqual(totals, { foundExpenses: 30, selectedExpenses: 10, foundCredits: 5, selectedCredits: 5 });
});

test('estabelecimentos da importação são filtrados pela categoria selecionada', () => {
  const directory = {
    Transporte: ['STM', 'UBER', 'Uber'],
    Assinaturas: ['Netflix'],
    'Jantar fora': ['CAFÉ']
  };
  assert.deepEqual(BankImport.companiesForCategory(directory, 'transporte'), ['STM', 'UBER']);
  assert.deepEqual(BankImport.companiesForCategory(directory, 'JANTAR FORA'), ['CAFÉ']);
  assert.deepEqual(BankImport.companiesForCategory(directory, 'Categoria nova'), []);
});

test('fixo estático no orçamento fica bloqueado para não criar uma segunda Nota Real', () => {
  const item = transaction({ merchant: 'Insurance', rawDescription: 'INSURANCE', category: 'Seguro', amount: 120 });
  const planned = [{
    id: 'planned-static',
    date: '2026-08-20',
    description: 'Insurance',
    category: 'Seguro',
    amount: 120,
    paymentMethodId: 'visa-main',
    isStatic: true,
    installmentPlanId: 'plan-1'
  }];
  const [result] = BankImport.reconcileTransactions([item], [], { plannedItems: planned });
  assert.equal(result.status, BankImport.STATUS.REVIEW);
  assert.match(result.statusReason, /estático/i);
  assert.equal(result.allowImport, false);
  assert.equal(result.linkedPlannedId, 'planned-static');
  assert.equal(result.installmentPlanId, 'plan-1');
  assert.throws(() => BankImport.buildReceipt(result), /protegido|estático/i);
});

test('fixo estático já existente com o mesmo valor é classificado como Já cadastrado', () => {
  const item = transaction({ merchant: 'Insurance', rawDescription: 'INSURANCE POLICY', category: 'Seguro', amount: 120 });
  const existing = [{
    id: 'static-real',
    month: '2026-08',
    date: '2026-08-20',
    merchant: 'Insurance',
    category: 'Seguro',
    amount: 120,
    paymentMethodId: 'visa-main',
    isStatic: true,
    staticSyncId: 'static-insurance-2026-08'
  }];
  const [result] = BankImport.reconcileTransactions([item], existing);
  assert.equal(result.status, BankImport.STATUS.EXISTING);
  assert.equal(result.matchedReceipt.id, 'static-real');
  assert.equal(result.allowImport, false);
});

test('fixo estático com valor bancário diferente exige revisão e não pode ser importado', () => {
  const item = transaction({ merchant: 'Insurance', rawDescription: 'INSURANCE POLICY', category: 'Seguro', amount: 125 });
  const existing = [{
    id: 'static-real',
    month: '2026-08',
    date: '2026-08-20',
    merchant: 'Insurance',
    amount: 120,
    paymentMethodId: 'visa-main',
    isStatic: true,
    staticSyncId: 'static-insurance-2026-08'
  }];
  const [result] = BankImport.reconcileTransactions([item], existing);
  assert.equal(result.status, BankImport.STATUS.REVIEW);
  assert.equal(result.allowImport, false);
  assert.match(result.statusReason, /divergência de valor/i);
  assert.throws(() => BankImport.buildReceipt(result), /protegido/i);

  const differentDate = transaction({ date: '2026-08-21', postedDate: '2026-08-22', merchant: 'Insurance', rawDescription: 'INSURANCE POLICY', category: 'Seguro', amount: 120 });
  const [dateResult] = BankImport.reconcileTransactions([differentDate], existing);
  assert.equal(dateResult.status, BankImport.STATUS.REVIEW);
  assert.equal(dateResult.allowImport, false);
  assert.match(dateResult.statusReason, /divergência de data/i);
});

test('compra Amazon comum não é confundida com fixo Amazon Prime por sugestão genérica', () => {
  const item = transaction({
    date: '2026-07-27',
    postedDate: '2026-07-28',
    merchant: 'AMAZON.CA*ZR4J83D83',
    rawDescription: 'AMAZON.CA*ZR4J83D83 866-216-1072 ON',
    category: '',
    amount: 216.26,
    paymentMethodId: 'rbc-gabriel',
    owner: 'Gabriel'
  });
  const amazonPrime = [{
    id: 'amazon-prime-static',
    month: '2026-07',
    date: '2026-07-28',
    merchant: 'AMAZON PRIME',
    category: 'Assinaturas',
    amount: 11.49,
    paymentMethodId: 'rbc-gabriel',
    owner: 'Gabriel',
    isStatic: true,
    staticSyncId: 'amazon-prime-2026-07'
  }];
  const [result] = BankImport.reconcileTransactions([item], amazonPrime, {
    companyDirectory: { Lojas: ['AMAZON'] }
  });
  assert.equal(result.status, BankImport.STATUS.NEW);
  assert.equal(result.merchant, 'AMAZON');
  assert.equal(result.category, 'Lojas');
  assert.equal(result.matchedReceipt, undefined);
  assert.equal(result.protectedMatch, undefined);
});

test('Amazon Prime específico com valor divergente continua protegido para revisão', () => {
  const item = transaction({
    date: '2026-07-28',
    postedDate: '2026-07-29',
    merchant: 'AMAZON PRIME',
    rawDescription: 'AMAZON PRIME MEMBERSHIP',
    category: 'Assinaturas',
    amount: 12.49,
    paymentMethodId: 'rbc-gabriel'
  });
  const existing = [{
    id: 'amazon-prime-static',
    month: '2026-07',
    date: '2026-07-28',
    merchant: 'AMAZON PRIME',
    amount: 11.49,
    paymentMethodId: 'rbc-gabriel',
    isStatic: true,
    staticSyncId: 'amazon-prime-2026-07'
  }];
  const [result] = BankImport.reconcileTransactions([item], existing);
  assert.equal(result.status, BankImport.STATUS.REVIEW);
  assert.equal(result.protectedMatch, true);
  assert.equal(result.allowImport, false);
  assert.match(result.statusReason, /divergência de valor/i);
});

test('Google One encontra o fixo Google Drive pelo valor e contexto, mesmo com produto renomeado', () => {
  const item = transaction({
    date: '2026-08-24',
    postedDate: '2026-08-25',
    merchant: 'GOOGLE ONE',
    rawDescription: 'GOOGLE *GOOGLE ONE G.CO/HELPPAY*NS',
    category: 'Assinaturas',
    amount: 3.21,
    paymentMethodId: 'rbc-gabriel',
    owner: 'Gabriel'
  });
  const existing = [{
    id: 'google-drive-static',
    month: '2026-08',
    date: '2026-08-18',
    merchant: 'GOOGLE DRIVE',
    category: 'Assinaturas',
    amount: 3.21,
    paymentMethodId: 'rbc-gabriel',
    owner: 'Gabriel',
    isStatic: true,
    staticSyncId: 'google-drive-2026-08'
  }];
  const [result] = BankImport.reconcileTransactions([item], existing);
  assert.equal(result.status, BankImport.STATUS.REVIEW);
  assert.equal(result.matchedReceipt.id, 'google-drive-static');
  assert.equal(result.protectedMatch, true);
  assert.match(result.statusReason, /divergência de data/i);

  const sameDate = [{ ...existing[0], date: '2026-08-24' }];
  const [exactResult] = BankImport.reconcileTransactions([item], sameDate);
  assert.equal(exactResult.status, BankImport.STATUS.EXISTING);
  assert.equal(exactResult.matchedReceipt.id, 'google-drive-static');
});

test('MARCHÉ SA e IGA com valor, data, categoria e responsável iguais é Já cadastrado', () => {
  const item = transaction({
    date: '2026-08-01',
    postedDate: '2026-08-03',
    merchant: 'MARCHE SA',
    rawDescription: 'IGA LES MARCHES VALERI LONGUEUIL QC',
    category: 'Supermercado',
    amount: 41.46,
    paymentMethodId: 'rbc-gabriel',
    owner: 'Gabriel'
  });
  const existing = [{
    id: 'iga-existing',
    month: '2026-08',
    date: '2026-08-01',
    merchant: 'IGA',
    category: 'Supermercado',
    amount: 41.46,
    paymentMethodId: 'rbc-gabriel',
    owner: 'Gabriel'
  }];
  const [result] = BankImport.reconcileTransactions([item], existing);
  assert.equal(result.status, BankImport.STATUS.EXISTING);
  assert.equal(result.matchedReceipt.id, 'iga-existing');
  assert.match(result.statusReason, /categoria e responsável/i);
});

test('valor e data iguais com categoria diferente continuam em revisão', () => {
  const item = transaction({ date: '2026-08-01', postedDate: '2026-08-03', merchant: 'LOJA A', rawDescription: 'LOJA A', category: 'Lojas', amount: 41.46, owner: 'Gabriel' });
  const existing = [{ id: 'other-category', month: '2026-08', date: '2026-08-01', merchant: 'MERCADO B', category: 'Supermercado', amount: 41.46, paymentMethodId: 'visa-main', owner: 'Gabriel' }];
  const [result] = BankImport.reconcileTransactions([item], existing);
  assert.equal(result.status, BankImport.STATUS.REVIEW);
  assert.equal(result.reviewKind, BankImport.REVIEW_KIND.POSSIBLE_DUPLICATE);
});

test('fixo comum ainda não lançado usa nome, categoria, responsável e vínculo cadastrados', () => {
  const item = transaction({ merchant: 'NETFLIX COM', rawDescription: 'NETFLIX COM #400281', category: '', amount: 22.99, owner: 'Gabriel' });
  const planned = [{
    id: 'planned-netflix',
    month: '2026-08',
    date: '2026-08-20',
    description: 'Netflix',
    category: 'Assinaturas',
    owner: 'Luana',
    amount: 22.99,
    paymentMethodId: 'visa-main',
    fixed: true,
    isStatic: false
  }];
  const [result] = BankImport.reconcileTransactions([item], [], { plannedItems: planned });
  assert.equal(result.status, BankImport.STATUS.REVIEW);
  assert.equal(result.allowImport, true);
  assert.equal(result.merchant, 'Netflix');
  assert.equal(result.category, 'Assinaturas');
  assert.equal(result.owner, 'Luana');
  assert.equal(result.linkedPlannedId, 'planned-netflix');
  const receipt = BankImport.buildReceipt(result);
  assert.equal(receipt.merchant, 'Netflix');
  assert.equal(receipt.linkedPlannedId, 'planned-netflix');
  assert.equal(receipt.isStatic, false);
  assert.equal('staticSyncId' in receipt, false);
  assert.match(receipt.observation, /NETFLIX COM #400281/);
});

test('nome bancário diferente do nome cadastrado não substitui o nome canônico do fixo', () => {
  const item = transaction({ merchant: 'NETFLIX COM 400281', rawDescription: 'NETFLIX COM #400281', category: 'Outros', amount: 22.99 });
  const planned = [{ id: 'netflix', date: '2026-08-20', description: 'Netflix', category: 'Assinaturas', owner: 'Gabriel', amount: 22.99, paymentMethodId: 'visa-main', fixed: true }];
  const [result] = BankImport.reconcileTransactions([item], [], { plannedItems: planned });
  assert.equal(result.merchant, 'Netflix');
  assert.equal(result.category, 'Assinaturas');
  assert.equal(result.rawDescription, 'NETFLIX COM #400281');
});

test('parcela já paga com Nota vinculada é classificada como Já cadastrado', () => {
  const item = transaction({ merchant: 'Laptop', rawDescription: 'LAPTOP STORE', amount: 100 });
  const receipt = { id: 'receipt-paid', month: '2026-08', date: '2026-08-20', merchant: 'Laptop', amount: 100, paymentMethodId: 'visa-main', installmentPlanId: 'plan-laptop', installmentNumber: 2 };
  const plan = { id: 'plan-laptop', name: 'Laptop', category: 'Eletrônicos', owner: 'Gabriel', paymentMethodId: 'visa-main', installments: [{ number: 2, targetDate: '2026-08-20', amount: 100, status: 'paid', receiptId: 'receipt-paid', receiptMonth: '2026-08' }] };
  const [result] = BankImport.reconcileTransactions([item], [receipt], { installmentPlans: [plan] });
  assert.equal(result.status, BankImport.STATUS.EXISTING);
  assert.equal(result.allowImport, false);
});

test('parcela pendente com Nota é Já cadastrada; sem Nota pode ser conciliada com trava atômica', () => {
  const item = transaction({ merchant: 'Laptop', rawDescription: 'LAPTOP STORE', amount: 100 });
  const plan = { id: 'plan-laptop', name: 'Laptop', category: 'Eletrônicos', owner: 'Gabriel', paymentMethodId: 'visa-main', installmentCount: 3, installments: [{ number: 2, targetDate: '2026-08-20', amount: 100, status: 'pending', plannedId: 'planned-installment', plannedMonth: '2026-08' }] };
  const linkedReceipt = { id: 'receipt-pending', month: '2026-08', date: '2026-08-20', merchant: 'Laptop', amount: 100, paymentMethodId: 'visa-main', installmentPlanId: 'plan-laptop', installmentNumber: 2 };
  const [withReceipt] = BankImport.reconcileTransactions([item], [linkedReceipt], { installmentPlans: [plan] });
  assert.equal(withReceipt.status, BankImport.STATUS.EXISTING);

  const [withoutReceipt] = BankImport.reconcileTransactions([item], [], { installmentPlans: [plan] });
  assert.equal(withoutReceipt.status, BankImport.STATUS.REVIEW);
  assert.equal(withoutReceipt.allowImport, true);
  assert.deepEqual(withoutReceipt.installmentGuard, {
    planId: 'plan-laptop',
    installmentNumber: 2,
    expectedStatus: 'pending',
    expectedReceiptId: '',
    expectedPlannedId: 'planned-installment',
    expectedAmount: 100
  });
});

test('parcelamento estático gerado automaticamente nunca produz outra Nota pela importação', () => {
  const item = transaction({ merchant: 'CPAP', rawDescription: 'CPAP MONTHLY RENTAL', amount: 195 });
  const plan = {
    id: 'plan-cpap',
    name: 'CPAP',
    category: 'Saúde',
    owner: 'Gabriel',
    paymentMethodId: 'visa-main',
    automationMode: 'fixed-static-clone',
    installments: [{ number: 1, targetDate: '2026-08-20', amount: 195, status: 'pending', plannedId: 'cpap-planned', plannedMonth: '2026-08' }]
  };
  const planned = [{ id: 'cpap-planned', date: '2026-08-20', description: 'CPAP', amount: 195, paymentMethodId: 'visa-main', isStatic: true, staticSyncId: 'installment_plan-cpap_1', installmentPlanId: 'plan-cpap', installmentNumber: 1 }];
  const [result] = BankImport.reconcileTransactions([item], [], { installmentPlans: [plan], plannedItems: planned });
  assert.equal(result.status, BankImport.STATUS.REVIEW);
  assert.equal(result.allowImport, false);
  assert.match(result.statusReason, /estática/i);
  assert.throws(() => BankImport.buildReceipt(result), /protegido|estático/i);
});

test('reimportação do extrato reconhece fixos e parcelas sem criar novos lançamentos', () => {
  const staticItem = transaction({ merchant: 'Insurance', rawDescription: 'INSURANCE', amount: 120 });
  const fixedItem = transaction({ date: '2026-08-21', postedDate: '2026-08-22', merchant: 'Netflix', rawDescription: 'NETFLIX COM #400281', amount: 22.99 });
  const installmentItem = transaction({ date: '2026-08-22', postedDate: '2026-08-23', merchant: 'Laptop', rawDescription: 'LAPTOP STORE', amount: 100 });
  const existing = [
    { id: 'static', month: '2026-08', date: '2026-08-20', merchant: 'Insurance', amount: 120, paymentMethodId: 'visa-main', isStatic: true, staticSyncId: 'insurance-static' },
    { id: 'fixed-import', month: '2026-08', bankImportFingerprint: fixedItem.fingerprint, paymentMethodId: 'visa-main' },
    { id: 'installment-import', month: '2026-08', bankImportFingerprint: installmentItem.fingerprint, paymentMethodId: 'visa-main', installmentPlanId: 'plan-laptop', installmentNumber: 2 }
  ];
  const results = BankImport.reconcileTransactions([staticItem, fixedItem, installmentItem], existing);
  assert.deepEqual(results.map((result) => result.status), [BankImport.STATUS.EXISTING, BankImport.STATUS.EXISTING, BankImport.STATUS.EXISTING]);
  assert.equal(results.every((result) => result.approved === false), true);
});

test('arquivo sem texto, erro protegido e PDF inválido têm mensagens explícitas', () => {
  const empty = BankImport.parseStatementText(['', '   ']);
  assert.match(empty.warnings[0], /texto selecionável/i);
  const protectedError = PdfStatementReader.normalizePdfError({ name: 'PasswordException', message: 'Password required' });
  assert.equal(protectedError.code, 'protected');
  const invalidError = PdfStatementReader.normalizePdfError({ name: 'InvalidPDFException', message: 'Invalid PDF structure' });
  assert.equal(invalidError.code, 'invalid');
});

test('falha parcial pode ser retomada porque cada lançamento mantém fingerprint determinística', () => {
  const items = [transaction(), transaction({ date: '2026-08-22', amount: 33, occurrence: 1 })];
  const savedAfterFailure = [{ id: 'saved-first', bankImportFingerprint: items[0].fingerprint }];
  const retried = BankImport.reconcileTransactions(items, savedAfterFailure);
  assert.equal(retried[0].status, BankImport.STATUS.EXISTING);
  assert.equal(retried[1].status, BankImport.STATUS.NEW);
});

test('meses relevantes incluem os adjacentes da compra e do processamento', () => {
  const months = BankImport.relevantMonths([transaction({ date: '2026-08-31', postedDate: '2026-09-01' })]);
  assert.deepEqual(months, ['2026-07', '2026-08', '2026-09', '2026-10']);
});

test('reconstrução de linhas do PDF preserva a ordem visual entre páginas', () => {
  const line = PdfStatementReader.linesFromTextItems([
    { str: '87.40', transform: [1, 0, 0, 1, 300, 700] },
    { str: 'AUG 20', transform: [1, 0, 0, 1, 20, 700] },
    { str: 'SUPERMARKET', transform: [1, 0, 0, 1, 100, 700] },
    { str: 'Footer', transform: [1, 0, 0, 1, 20, 20] }
  ]);
  assert.equal(line, 'AUG 20 SUPERMARKET 87.40\nFooter');
});

test('leitor local percorre todas as páginas e rejeita PDF digitalizado sem texto', async () => {
  const sourceBytes = new Uint8Array([1, 2, 3, 4]);
  const fakeFile = {
    type: 'application/pdf',
    name: 'extrato-ficticio.pdf',
    size: 4,
    async arrayBuffer() { return sourceBytes.buffer; }
  };
  const makeDocument = (pageItems) => ({
    numPages: pageItems.length,
    async getPage(pageNumber) {
      return {
        async getTextContent() { return { items: pageItems[pageNumber - 1] }; },
        cleanup() {}
      };
    },
    async destroy() {}
  });
  globalThis.pdfjsLib = {
    getDocument() {
      return { promise: Promise.resolve(makeDocument([
        [{ str: 'AUG 20 STORE 10.00', transform: [1, 0, 0, 1, 20, 700] }],
        [{ str: 'SEP 01 GAS 20.00', transform: [1, 0, 0, 1, 20, 700] }]
      ])) };
    }
  };
  const result = await PdfStatementReader.readPdf(fakeFile);
  assert.equal(result.pageCount, 2);
  assert.deepEqual(result.pages, ['AUG 20 STORE 10.00', 'SEP 01 GAS 20.00']);
  assert.equal('fileHash' in result, false);
  assert.deepEqual([...sourceBytes], [0, 0, 0, 0]);

  globalThis.pdfjsLib = {
    getDocument() { return { promise: Promise.resolve(makeDocument([[], []])) }; }
  };
  await assert.rejects(PdfStatementReader.readPdf(fakeFile), (error) => error.code === 'no-text');
  delete globalThis.pdfjsLib;
});

test('leitor local aceita versões do PDF.js sem document.destroy e descarta os bytes', async () => {
  let loadingTaskDestroyed = false;
  const sourceBytes = new Uint8Array([9, 8, 7, 6]);
  const fakeFile = {
    type: 'application/pdf',
    name: 'compatibilidade.pdf',
    size: sourceBytes.length,
    async arrayBuffer() { return sourceBytes.buffer; }
  };
  globalThis.pdfjsLib = {
    getDocument() {
      return {
        promise: Promise.resolve({
          numPages: 1,
          async getPage() {
            return { async getTextContent() { return { items: [{ str: 'JUL 07 STORE 10.00', transform: [1, 0, 0, 1, 20, 700] }] }; } };
          }
        }),
        async destroy() { loadingTaskDestroyed = true; }
      };
    }
  };
  const result = await PdfStatementReader.readPdf(fakeFile);
  assert.deepEqual(result.pages, ['JUL 07 STORE 10.00']);
  assert.equal(loadingTaskDestroyed, true);
  assert.deepEqual([...sourceBytes], [0, 0, 0, 0]);
  delete globalThis.pdfjsLib;
});

test('capturas do app CIBC herdam o cabeçalho de data e removem sobreposição entre imagens', () => {
  const prepared = BankImport.prepareImageStatementText([
    `CIBC Mastercard
Oct 27, 2026
DESJARDINS SECURITE FI MONTREAL, QC $25.00
5223********5380
SUSHI SHOP - 2324 MONTREAL, QC $20.17
PAYMENT THANK YOU/PAIEMENT MERCI - $3,384.00
Oct 26, 2026
COSTCO WHOLESALE W1359 SAINT-BRUNO, QC $447.04`,
    `Oct 27, 2026
SUSHI SHOP - 2324 MONTREAL, QC $20.17
DESJARDINS SECURITE FI MONTREAL, QC $25.00`
  ]);
  const parsed = BankImport.parseStatementText(prepared.pages, { institution: 'cibc', source: 'image' });
  assert.deepEqual(parsed.transactions.map((item) => [item.date, item.amount, item.type]), [
    ['2026-10-27', 25, BankImport.TYPE.EXPENSE],
    ['2026-10-27', 20.17, BankImport.TYPE.EXPENSE],
    ['2026-10-27', 3384, BankImport.TYPE.PAYMENT],
    ['2026-10-26', 447.04, BankImport.TYPE.EXPENSE]
  ]);
  assert.equal(parsed.transactions.every((item) => item.source === 'image-cibc'), true);
});

test('captura infere a data do item acima do primeiro cabeçalho e reconhece crédito', () => {
  const prepared = BankImport.prepareImageStatementText([`AMZN Mktp CA TORONTO, ON - $24.82 Credit
Oct 20, 2026
SUSHI SHOP MONTREAL, QC $24.95`]);
  const parsed = BankImport.parseStatementText(prepared.pages, { institution: 'cibc', source: 'image' });
  assert.equal(parsed.transactions[0].date, '2026-10-21');
  assert.equal(parsed.transactions[0].amount, -24.82);
  assert.equal(parsed.transactions[0].type, BankImport.TYPE.CREDIT);
  assert.equal(parsed.transactions[1].date, '2026-10-20');
});

test('OCR recompõe a dezena isolada em $1 0.96 sem contaminar o estabelecimento', () => {
  const prepared = BankImport.prepareImageStatementText([`Oct 22, 2026
UBER CANADA/UBERTRIP TORONTO, ON $1 0.96`]);
  const parsed = BankImport.parseStatementText(prepared.pages, { institution: 'cibc', source: 'image' });
  assert.equal(parsed.transactions.length, 1);
  assert.equal(parsed.transactions[0].amount, 10.96);
  assert.equal(parsed.transactions[0].rawAmount, 'CAD 10.96');
  assert.equal(parsed.transactions[0].amountRecoveredFromSplit, false);
  assert.doesNotMatch(parsed.transactions[0].rawDescription, /\$1/);
});

test('OCR CIBC em modo sparse recupera compras em linhas separadas e estorno', () => {
  const prepared = BankImport.prepareImageStatementText([`Oct 23, 2026
HP *INSTANT INK CA HALIFAX, NS
$9.19 >
5223********5380
Oct 22, 2026
UBER CANADA/UBERTRIP
$10.96 >
TORONTO, ON
5223********5380
Oct 21, 2026
AMZN Mktp CA TORONTO, ON
- $24.82 >
5223********5380
Credit
Oct 20, 2026
SUSHI SHOP - 2324 MONTREAL,
S24`]);
  const parsed = BankImport.parseStatementText(prepared.pages, { institution: 'cibc', source: 'image' });
  assert.deepEqual(parsed.transactions.map(({ date, amount, type }) => [date, amount, type]), [
    ['2026-10-23', 9.19, BankImport.TYPE.EXPENSE],
    ['2026-10-22', 10.96, BankImport.TYPE.EXPENSE],
    ['2026-10-21', -24.82, BankImport.TYPE.CREDIT]
  ]);
  assert.match(prepared.warnings.join(' '), /ilegíveis|cortados/);
});

test('OCR não confunde código do pedido com milhares, nem câmbio USD com despesa', () => {
  const prepared = BankImport.prepareImageStatementText([`Nov 4, 2026
AMZN Mktp CA*DB2NK3PZ3
$111.25 >
5223********5380
Nov 2, 2026
OPENAI *CHATGPT SUBSCR SAN
$33.00 >
FRANCISCO, CA 23.00 USD @
1.434782
5223********5380`]);
  const parsed = BankImport.parseStatementText(prepared.pages, { institution: 'cibc', source: 'image' });
  assert.equal(parsed.transactions.length, 2);
  assert.deepEqual(parsed.transactions.map((item) => item.amount), [111.25, 33]);
  assert.match(parsed.transactions[0].rawDescription, /DB2NK3PZ3/);
});

test('OCR não transforma status de crédito da compra anterior em estorno da próxima compra', () => {
  const prepared = BankImport.prepareImageStatementText([`Nov 4, 2026
SP META STORE - NA MENLO
- $631.35 >
PARK, CA
f=? Credit
5223********5380
CHECK INSTALLMENT ELIGIBILITY
COSTCO WHOLESALE W532
BOUCHERVILLE, QC
$155.80 >`]);
  const parsed = BankImport.parseStatementText(prepared.pages, { institution: 'cibc', source: 'image' });
  assert.deepEqual(parsed.transactions.map(({ amount, type }) => [amount, type]), [
    [-631.35, BankImport.TYPE.CREDIT],
    [155.8, BankImport.TYPE.EXPENSE]
  ]);
});

test('OCR CIBC ignora pendentes não contabilizados e pagamento de fatura', () => {
  const prepared = BankImport.prepareImageStatementText([`Amazon.ca TORONTO, ON
$11.83 >
5223********5380
Pending
AMZN Mktp CA TORONTO, ON
$68.97 >
5223********5380
Pending
Nov 5, 2026
AMZN Mktp CA TORONTO, ON
$29.94 >
Oct 27, 2026
PAYMENT THANK YOU/
PAIEMEN T MERCI
- $3,384.00 >
5223********5380
Credit`]);
  const parsed = BankImport.parseStatementText(prepared.pages, { institution: 'cibc', source: 'image' });
  assert.equal(parsed.transactions.length, 2);
  assert.equal(parsed.transactions[0].amount, 29.94);
  assert.equal(parsed.transactions[1].type, BankImport.TYPE.PAYMENT);
  assert.equal(parsed.transactions[1].importable, false);
  assert.match(prepared.warnings.join(' '), /2 compra\(s\) pendente/);
});

test('leitor de imagens reutiliza um único OCR local e encerra o worker', async () => {
  let created = 0;
  let terminated = 0;
  let parameters = null;
  const recognized = [];
  const files = [
    { name: 'parte-1.jpg', type: 'image/jpeg', size: 10 },
    { name: 'parte-2.png', type: 'image/png', size: 20 }
  ];
  const result = await ImageStatementReader.readImages(files, {
    async createWorker() {
      created += 1;
      return {
        async setParameters(next) { parameters = next; },
        async recognize(file) {
          recognized.push(file.name);
          return { data: { text: `texto de ${file.name}` } };
        },
        async terminate() { terminated += 1; }
      };
    }
  });
  assert.equal(created, 1);
  assert.equal(terminated, 1);
  assert.deepEqual(parameters, { tessedit_pageseg_mode: '11' });
  assert.deepEqual(recognized, ['parte-1.jpg', 'parte-2.png']);
  assert.deepEqual(result.pages, ['texto de parte-1.jpg', 'texto de parte-2.png']);
  assert.equal(result.fileName, '2 imagens');
});

test('interface integra PDF, prévia e confirmação sem formulário de upload remoto', () => {
  const html = fs.readFileSync(path.join(__dirname, '../docs/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../docs/style.css'), 'utf8');
  const readerSource = fs.readFileSync(path.join(__dirname, '../docs/pdf-statement-reader.js'), 'utf8');
  const appSource = fs.readFileSync(path.join(__dirname, '../docs/app.js'), 'utf8');
  const apiSource = fs.readFileSync(path.join(__dirname, '../docs/firebase-api.js'), 'utf8');
  assert.match(html, /id="btn-open-bank-import"[^>]*>📄 Importar Extrato/);
  assert.match(html, /id="bank-import-file"[^>]*accept="application\/pdf,.pdf,image\/jpeg,image\/png,image\/webp/);
  assert.match(html, /PDFs e imagens são lidos neste navegador e não são enviados nem armazenados/);
  assert.match(html, /tesseract\.js@5/);
  assert.match(html, /image-statement-reader\.js/);
  assert.match(html, /id="btn-confirm-bank-import"/);
  assert.doesNotMatch(html, /<form[^>]+action=["'][^"']+["'][^>]*bank-import/i);
  assert.doesNotMatch(readerSource, /fileHash|sha256/i);
  const importUiSource = appSource.slice(appSource.indexOf('const bankImportState'), appSource.indexOf('bankImportUi.openButton'));
  const atomicSaveSource = apiSource.slice(apiSource.indexOf('async saveImportedReceiptAtomic'), apiSource.indexOf('async getBankImportState'));
  assert.doesNotMatch(importUiSource, /fileHash/i);
  assert.doesNotMatch(atomicSaveSource, /fileHash/i);
  assert.match(importUiSource, /<select data-field="category"/);
  assert.match(importUiSource, /bank-import-merchant-options-\$\{index\}/);
  assert.match(importUiSource, /BankImport\.companiesForCategory\(companyDirectory, category\)/);
  assert.doesNotMatch(importUiSource, /Object\.values\(companyDirectory\)\.flat/);
  assert.match(importUiSource, /autoRegisterCompany\(validatedTransaction\.category, validatedTransaction\.merchant\)/);
  assert.match(importUiSource, /Já está cadastrado — não importar/);
  assert.match(importUiSource, /É outra compra — importar/);
  assert.match(importUiSource, /Fixo ou parcela protegida: outra despesa não pode ser criada com este vínculo/);
  assert.match(importUiSource, /Use quando você encontrou o lançamento no sistema/);
  assert.match(importUiSource, /Precisa da sua atenção/);
  assert.match(importUiSource, /Encontrado no sistema/);
  assert.match(importUiSource, /Texto original do extrato/);
  assert.match(appSource, /saveBankImportExistingDecision\(transaction\)/);
  assert.match(appSource, /isProtectedDuplicate && action !== 'skip'/);
  assert.match(appSource, /transaction\.status = BankImport\.STATUS\.EXISTING/);
  assert.match(css, /@media \(max-width: 1050px\)[\s\S]*?\.bank-import-duplicate-actions \{ width: 100%; margin-left: 0; \}/);
  assert.match(css, /@media \(max-width: 680px\)[\s\S]*?\.bank-import-duplicate-actions \{ display: grid; grid-template-columns: 1fr; width: 100%; \}/);
  assert.match(css, /\.bank-import-row-meta\.has-match \{ grid-template-columns:/);
  assert.match(css, /\.bank-import-review-message, \.bank-import-match-card, \.bank-import-original-card/);
  assert.match(css, /border-radius: 9px; outline: none; background: #10101b/);
  assert.match(importUiSource, /Despesas encontradas no extrato/);
  assert.match(importUiSource, /Despesas selecionadas para importar/);
  assert.match(importUiSource, /hasRequiredBankImportFields\(transaction\)/);
});

test('persistência importada é atômica, determinística e incluída no backup', () => {
  const apiSource = fs.readFileSync(path.join(__dirname, '../docs/firebase-api.js'), 'utf8');
  const appSource = fs.readFileSync(path.join(__dirname, '../docs/app.js'), 'utf8');
  assert.match(apiSource, /const receiptId = `bank_\$\{fingerprint\}`/);
  assert.match(apiSource, /return db\.runTransaction/);
  assert.match(apiSource, /transaction\.get\(planRef\)/);
  assert.match(apiSource, /transaction\.update\(planRef, planUpdate\)/);
  assert.match(apiSource, /transaction\.get\(plannedRef\)/);
  assert.match(apiSource, /bankImportReceiptId: receiptId/);
  assert.match(apiSource, /Uma importação bancária não pode criar nem reutilizar um vínculo estático/);
  assert.match(apiSource, /collection\('importacoes_bancarias'\)/);
  assert.match(apiSource, /bankImportsSnapshot/);
  assert.match(apiSource, /backupData\.bankImports/);
  assert.match(appSource, /async function revalidateBankImportTransaction/);
  const confirmationFlow = appSource.slice(appSource.indexOf('async function confirmBankImport'), appSource.indexOf("bankImportUi.openButton"));
  assert.match(confirmationFlow, /revalidateBankImportTransaction/);
  assert.match(confirmationFlow, /plannedGuard: validatedTransaction\.plannedGuard/);
  assert.match(appSource, /BankImport\.decideRevalidation\(transaction, fresh\)/);
  assert.doesNotMatch(confirmationFlow, /updateInstallmentPlanEntry/);
});
