const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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
  assert.match(decoded.identifier, /^scan-[a-z0-9]+$/);
});

test('identificador de conteúdo 2D é estável mesmo quando o leitor muda o formato', () => {
  const first = Scanner.createContentIdentifier('LOTE-ABC-123', 'qr_code');
  const second = Scanner.createContentIdentifier('LOTE-ABC-123', 'data_matrix');
  assert.equal(first, second);
  assert.match(first, /^scan-[a-z0-9]+$/);
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


test('extrai GTIN de Data Matrix GS1 contínuo sem separador depois do AI 01', () => {
  const decoded = Scanner.decodeValue('01100123456789021727083110LOTE5X147', 'data_matrix');
  assert.equal(decoded.kind, 'product');
  assert.equal(decoded.code, '10012345678902');
});

test('o mesmo Data Matrix gera o mesmo identificador com prefixo e separadores diferentes', () => {
  const withPrefix = Scanner.decodeValue(']d201100123456789021727083110LOTE5X147', 'data_matrix');
  const withoutPrefix = Scanner.decodeValue('01100123456789021727083110LOTE5X147', 'unknown');
  assert.equal(withPrefix.kind, 'product');
  assert.equal(withoutPrefix.kind, 'product');
  assert.equal(withPrefix.code, withoutPrefix.code);
});

test('conteúdo 2D não-GTIN ignora prefixo de simbologia ao gerar identidade', () => {
  const first = Scanner.createContentIdentifier(']d2LOTE-ABC-123');
  const second = Scanner.createContentIdentifier('LOTE-ABC-123');
  assert.equal(first, second);
});


test('conteúdo 2D consulta o catálogo antes de perguntar pelo identificador novamente', () => {
  const comprasSource = fs.readFileSync(path.join(__dirname, '../docs/compras/compras.js'), 'utf8');
  assert.match(comprasSource, /async function handleScannerContent\(decoded\)/);
  assert.match(comprasSource, /getProductByScan\(decoded\) \|\| \(await window\.ShoppingAPI\.findProductByScan\(decoded\)\)/);
  assert.match(comprasSource, /onContent:\s*handleScannerContent/);
});
