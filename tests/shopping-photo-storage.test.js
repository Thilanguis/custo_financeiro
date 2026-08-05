const test = require('node:test');
const assert = require('node:assert/strict');

const photoStorage = require('../docs/compras/photo-storage.js');

test('reconhece Data URL de imagem', () => {
  assert.equal(photoStorage.isDataUrl('data:image/jpeg;base64,AA=='), true);
  assert.equal(photoStorage.isDataUrl('https://example.com/foto.jpg'), false);
});

test('converte Data URL base64 em Blob com tipo e tamanho corretos', async () => {
  const blob = photoStorage.dataUrlToBlob('data:image/png;base64,aGVsbG8=');
  assert.equal(blob.type, 'image/png');
  assert.equal(blob.size, 5);
  assert.equal(Buffer.from(await blob.arrayBuffer()).toString(), 'hello');
});

test('gera caminho estável por família e produto, mas arquivo versionado', () => {
  const first = photoStorage.buildPhotoStoragePath('familia-gabriel-luana', '012345678905', {
    timestamp: 100,
    contentType: 'image/jpeg',
  });
  const second = photoStorage.buildPhotoStoragePath('familia-gabriel-luana', '012345678905', {
    timestamp: 200,
    contentType: 'image/jpeg',
  });

  assert.match(first, /^shopping-products\/familia-gabriel-luana\/012345678905-[0-9a-f]{8}\/photo-100\.jpg$/);
  assert.notEqual(first, second);
});

test('sanitiza barras e caracteres especiais do identificador', () => {
  const path = photoStorage.buildPhotoStoragePath('família/teste', 'qr:abc/123?x=1', {
    timestamp: 123,
    contentType: 'image/webp',
  });
  assert.equal(path.includes('?'), false);
  assert.equal(path.includes('qr:abc/123'), false);
  assert.match(path, /photo-123\.webp$/);
});

test('recusa conteúdo que não seja imagem e imagem acima do limite', () => {
  assert.throws(() => photoStorage.validateImageBlob(new Blob(['abc'], { type: 'text/plain' })), /não é uma imagem/i);
  assert.throws(
    () => photoStorage.validateImageBlob(new Blob([new Uint8Array(10)], { type: 'image/jpeg' }), 5),
    /maior que 2 MB/i,
  );
});

test('prioriza photoUrl e mantém compatibilidade com photoDataUrl antiga', () => {
  assert.equal(photoStorage.getProductPhotoSource({ photoUrl: 'https://storage/foto.jpg', photoDataUrl: 'data:image/jpeg;base64,AA==' }), 'https://storage/foto.jpg');
  assert.equal(photoStorage.getProductPhotoSource({ photoDataUrl: 'data:image/jpeg;base64,AA==' }), 'data:image/jpeg;base64,AA==');
});
