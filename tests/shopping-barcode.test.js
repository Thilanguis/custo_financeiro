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
