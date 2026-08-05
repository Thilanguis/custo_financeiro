const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
global.navigator = {};
require('../docs/compras/scanner.js');

const Scanner = global.ShoppingBarcodeScanner;

test('aceita códigos GTIN válidos usados no catálogo', () => {
  ['096619581870', '064420010223', '048500205549', '056800510522'].forEach((code) => {
    assert.equal(Scanner.validateCode(code).valid, true, code);
  });
});

test('rejeita tamanho incorreto, letras e dígito verificador inválido', () => {
  assert.equal(Scanner.validateCode('12345').valid, false);
  assert.equal(Scanner.validateCode('ABC064420010223').valid, false);
  assert.equal(Scanner.validateCode('064420010224').valid, false);
});

test('aceita GTIN-8, EAN-13 e GTIN-14 válidos', () => {
  ['96385074', '4006381333931', '10012345678902'].forEach((code) => {
    assert.equal(Scanner.validateCode(code).valid, true, code);
  });
});

test('extrai GTIN válido de QR Code com campo nomeado', () => {
  const decoded = Scanner.decodeValue('https://exemplo.test/produto?gtin=4006381333931', 'qr_code');
  assert.equal(decoded.kind, 'product');
  assert.equal(decoded.code, '4006381333931');
  assert.equal(decoded.extractedFromContent, true);
});

test('extrai GTIN-14 de Data Matrix GS1 com identificador de aplicação 01', () => {
  const decoded = Scanner.decodeValue(']d20110012345678902\u001d17281231', 'data_matrix');
  assert.equal(decoded.kind, 'product');
  assert.equal(decoded.code, '10012345678902');
});

test('QR sem GTIN entra no fluxo de conteúdo sem abrir URL automaticamente', () => {
  const decoded = Scanner.decodeValue('https://fabricante.test/lote/ABC-123', 'qr_code');
  assert.equal(decoded.kind, 'content');
  assert.equal(decoded.isUrl, true);
  assert.match(decoded.identifier, /^qr-[a-z0-9]+$/);
});

test('identificador de conteúdo 2D é estável e diferencia formatos', () => {
  const first = Scanner.createContentIdentifier('LOTE-ABC-123', 'qr_code');
  const second = Scanner.createContentIdentifier('LOTE-ABC-123', 'qr_code');
  const dataMatrix = Scanner.createContentIdentifier('LOTE-ABC-123', 'data_matrix');
  assert.equal(first, second);
  assert.notEqual(first, dataMatrix);
  assert.match(dataMatrix, /^dm-[a-z0-9]+$/);
});

test('aceita GTIN numérico lido em Code 128', () => {
  const decoded = Scanner.decodeValue('4006381333931', 'code_128');
  assert.equal(decoded.kind, 'product');
  assert.equal(decoded.code, '4006381333931');
});

test('aceita UPC-E válido e preserva a forma comprimida', () => {
  const validation = Scanner.validateCode('01234565', { format: 'upc_e' });
  assert.equal(validation.valid, true);
  assert.equal(validation.format, 'UPC-E');
  assert.equal(validation.expandedUpcA, '012345000065');
});
