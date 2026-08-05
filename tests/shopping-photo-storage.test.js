const test = require('node:test');
const assert = require('node:assert/strict');

const photoStorage = require('../docs/compras/photo-storage.js');

function makePhotoDataUrl(totalBytes) {
  const prefix = 'data:image/jpeg;base64,';
  return prefix + 'A'.repeat(Math.max(0, totalBytes - Buffer.byteLength(prefix)));
}

test('reconhece Data URL de imagem', () => {
  assert.equal(photoStorage.isDataUrl('data:image/jpeg;base64,AA=='), true);
  assert.equal(photoStorage.isDataUrl('https://example.com/foto.jpg'), false);
});

test('mede o tamanho UTF-8 que será gravado no Firestore', () => {
  const photo = makePhotoDataUrl(12_345);
  assert.equal(photoStorage.getDataUrlSize(photo), 12_345);
  assert.equal(photoStorage.getDataUrlSize('https://example.com/foto.jpg'), 0);
});

test('formata bytes para exibição amigável', () => {
  assert.equal(photoStorage.formatBytes(900), '900 B');
  assert.equal(photoStorage.formatBytes(10 * 1024), '10 KB');
  assert.equal(photoStorage.formatBytes(1.5 * 1024 * 1024), '1,50 MB');
});

test('classifica foto pequena, foto pesada e foto acima do limite seguro', () => {
  assert.equal(photoStorage.getPhotoSizeStatus('').level, 'empty');
  assert.equal(photoStorage.getPhotoSizeStatus(makePhotoDataUrl(100 * 1024)).level, 'ok');
  assert.equal(photoStorage.getPhotoSizeStatus(makePhotoDataUrl(250 * 1024)).level, 'warning');
  assert.equal(photoStorage.getPhotoSizeStatus(makePhotoDataUrl(350 * 1024)).level, 'danger');
});

test('aceita foto compactada e bloqueia Data URL acima do limite', () => {
  assert.equal(photoStorage.validateFirestorePhoto(makePhotoDataUrl(150 * 1024)), true);
  assert.throws(
    () => photoStorage.validateFirestorePhoto(makePhotoDataUrl(photoStorage.MAX_FIRESTORE_PHOTO_BYTES + 1)),
    /acima do limite seguro/i,
  );
  assert.throws(() => photoStorage.validateFirestorePhoto('texto'), /formato válido/i);
});

test('prioriza foto Data URL no modo Spark e mantém URL antiga como compatibilidade', () => {
  const dataUrl = 'data:image/jpeg;base64,AA==';
  assert.equal(photoStorage.getProductPhotoSource({ photoUrl: 'https://storage/foto.jpg', photoDataUrl: dataUrl }), dataUrl);
  assert.equal(photoStorage.getProductPhotoSource({ photoUrl: 'https://storage/foto.jpg' }), 'https://storage/foto.jpg');
  assert.equal(photoStorage.getProductPhotoSource({}), '');
});

test('limites mantêm margem ampla abaixo do documento máximo do Firestore', () => {
  assert.ok(photoStorage.TARGET_FIRESTORE_PHOTO_BYTES < photoStorage.WARNING_FIRESTORE_PHOTO_BYTES);
  assert.ok(photoStorage.WARNING_FIRESTORE_PHOTO_BYTES < photoStorage.MAX_FIRESTORE_PHOTO_BYTES);
  assert.ok(photoStorage.MAX_FIRESTORE_PHOTO_BYTES < 1024 * 1024);
});

test('pacote Spark não carrega nem inicializa Firebase Storage', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const index = fs.readFileSync(path.join(__dirname, '../docs/index.html'), 'utf8');
  const api = fs.readFileSync(path.join(__dirname, '../docs/compras/firebase-compras.js'), 'utf8');
  assert.equal(index.includes('firebase-storage-compat.js'), false);
  assert.equal(index.includes('firebase.storage()'), false);
  assert.equal(api.includes('window.storage'), false);
  assert.equal(api.includes('reference.put'), false);
});

test('fotos novas usam Data URL compactada e catálogo oferece compactação das antigas', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const ui = fs.readFileSync(path.join(__dirname, '../docs/compras/compras.js'), 'utf8');
  const api = fs.readFileSync(path.join(__dirname, '../docs/compras/firebase-compras.js'), 'utf8');
  assert.match(ui, /Compactar fotos antigas/);
  assert.match(ui, /compressPhotoDataUrl/);
  assert.match(api, /firestore-data-url-v2/);
  assert.match(api, /validateFirestorePhoto/);
});
