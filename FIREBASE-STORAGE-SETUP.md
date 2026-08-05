# Ativar fotos do Carrinho no Firebase Storage

O código do aplicativo já está preparado para enviar as fotos comprimidas ao Firebase Storage e salvar no Firestore apenas `photoUrl` e `photoStoragePath`.

## 1. Ativar o Storage

No Firebase Console do projeto `custofinanceiro-234b2`, abra **Build > Storage** e conclua a criação do bucket, caso ainda não esteja ativo.

## 2. Publicar as regras

Abra **Storage > Rules**, substitua as regras pelo conteúdo do arquivo `storage.rules` deste pacote e publique.

As regras permitem leitura, gravação e exclusão somente para usuários autenticados, aceitam apenas imagens e limitam cada arquivo a menos de 2 MB.

## 3. Migrar fotos antigas

Depois de instalar esta versão:

1. abra **Carrinho de compras**;
2. abra **Produtos**;
3. clique em **Migrar fotos antigas**.

A migração é idempotente: produtos que já possuem `photoUrl` são ignorados. Se uma foto falhar, ela permanece no Firestore como Data URL e pode ser tentada novamente.
