# Módulo de Compras

Este diretório concentra a funcionalidade do carrinho e não depende das regras de orçamento, notas ou cartões.

## Arquivos

- `compras.js`: interface, lista, catálogo e cadastro.
- `camera.js`: abertura da webcam, tratamento de permissões e captura de fotos.
- `scanner.js`: leitura de código de barras pela câmera.
- `firebase-compras.js`: leitura e gravação das coleções exclusivas de compras.
- `compras.css`: estilos da aba e dos modais.

## Coleções usadas

- `familias/{familyId}/produtos_compras/{barcode}`
- `familias/{familyId}/listas_compras/ativa/itens/{barcode}`

As fotos são comprimidas no navegador e gravadas temporariamente como Data URL no documento do produto. Em uma etapa futura, elas podem ser migradas para o Firebase Storage sem alterar a lista de compras.

## Scanner

O scanner tenta usar `BarcodeDetector` e, quando ele não existe, usa ZXing como alternativa. A câmera exige HTTPS ou localhost. Se o leitor automático não puder iniciar, o vídeo e a entrada manual continuam disponíveis.
