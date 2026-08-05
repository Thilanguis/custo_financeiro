# Módulo de Compras

Este diretório concentra a funcionalidade do carrinho e não depende das regras de orçamento, notas ou cartões.

## Arquivos

- `compras.js`: interface, lista, catálogo, cadastro e controles do scanner.
- `camera.js`: abertura da webcam, tratamento de permissões, foco, zoom, troca de câmera e captura de fotos.
- `scanner.js`: leitura e interpretação dos códigos pela câmera.
- `firebase-compras.js`: leitura e gravação das coleções exclusivas de compras.
- `compras.css`: estilos da aba e dos modais.

## Coleções usadas

- `familias/{familyId}/produtos_compras/{barcode}`
- `familias/{familyId}/listas_compras/ativa/itens/{barcode}`

As fotos são comprimidas no navegador e gravadas temporariamente como Data URL no documento do produto. Em uma etapa futura, elas podem ser migradas para o Firebase Storage sem alterar a lista de compras.

## Scanner

O scanner tenta usar `BarcodeDetector` e, quando ele não existe, usa ZXing como alternativa. A câmera exige HTTPS ou localhost. Se o leitor automático não puder iniciar, o vídeo e a entrada manual continuam disponíveis.

Formatos solicitados ao leitor nativo:

- EAN-13 e EAN-8;
- UPC-A e UPC-E;
- Code 128;
- QR Code;
- Data Matrix.

O leitor mantém um período inicial de segurança e exige leituras repetidas antes de confirmar um código. O modo **Código pequeno** reduz a região analisada, amplia a área central na leitura nativa, solicita foco contínuo e aplica um zoom inicial quando a câmera oferece esse recurso.

QR Code e Data Matrix são tratados de duas formas:

1. quando contêm um GTIN/EAN/UPC válido, o número é extraído e segue o fluxo normal do produto;
2. quando contêm texto ou URL sem GTIN, o conteúdo é mostrado sem abrir links automaticamente. O usuário pode copiar, continuar lendo ou criar um identificador interno estável para cadastrar o produto. O conteúdo original e o formato ficam salvos no cadastro.
