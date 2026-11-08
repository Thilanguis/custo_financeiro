# Importação de extratos bancários

## Fluxo

Em **Notas Fiscais (Real)**, use **Importar Extrato**, selecione um PDF ou imagens JPG/PNG/WebP, o método de pagamento correto e o responsável padrão. O arquivo é processado no navegador; carregar ou analisar o arquivo não grava nenhuma nota. Somente linhas aprovadas na prévia são importadas.

O método de pagamento é obrigatório e não é inferido do documento. Datas, estabelecimento, categoria, valor, responsável, método e natureza podem ser corrigidos por linha. A categoria é escolhida primeiro e filtra os estabelecimentos já cadastrados nela, como nos formulários principais. Ainda é possível digitar um estabelecimento novo; após uma importação confirmada, ele é registrado na categoria escolhida.

O núcleo possui adaptadores iniciais para **RBC** e **CIBC**, detectados pelo conteúdo do documento ou pelo nome do método que o usuário selecionou. Nos cartões RBC, datas de transação e contabilização permanecem separadas e uma descrição iniciada por `^` é sinalizada como possível parcelamento. No CIBC, menções ao **Pace It** também exigem conciliação. Extratos de conta com mais de uma coluna monetária nunca são aprovados automaticamente: o valor precisa ser confirmado na prévia.

## Segurança e idempotência

- O PDF ou a imagem original não é enviado ao Firebase nem armazenado no sistema. Seu hash também não é persistido: após a extração, o leitor encerra o processamento local e a interface limpa a seleção do arquivo.
- Logs registram apenas a quantidade importada, sem descrições bancárias.
- Cada movimentação recebe uma impressão digital determinística.
- Ocorrências visualmente iguais no mesmo dia recebem impressões digitais diferentes. Uma Nota importada com outra impressão não absorve a ocorrência seguinte apenas por ter o mesmo estabelecimento, data e valor.
- A nota e o metadado de importação são gravados na mesma transação do Firestore. Quando há uma parcela pendente, a atualização protegida da parcela participa da mesma transação.
- Imediatamente antes de salvar, recibos, orçamento, parcelamentos e histórico de importação são consultados novamente. Se um vínculo mudou durante a revisão, o item volta para revisão sem ser gravado.
- Repetir um arquivo, importar períodos sobrepostos ou retomar uma falha parcial não recria as operações já gravadas.
- Metadados e associações aprendidas entram no backup completo.

## Conciliação

A comparação consulta os meses da compra/processamento e os meses adjacentes. Usa método, identificador bancário, centavos, natureza, datas e estabelecimento normalizado. Uma correspondência forte é marcada como já cadastrada; uma correspondência incerta exige revisão.

Fixos comuns ainda sem Nota Real reutilizam o nome, a categoria, o responsável e o vínculo cadastrados no orçamento; a descrição bruta do banco fica somente na observação. Fixos estáticos e parcelas que já têm Nota Real nunca geram outra nota. Divergências de valor ou data nesses registros ficam bloqueadas para revisão. Parcelas pendentes sem nota podem ser confirmadas, mas seu status e seus vínculos são validados novamente dentro da transação de gravação. `staticSyncId` nunca é copiado para uma nota criada pelo importador.

Um item previsto comum é reservado no lote para que somente uma movimentação herde `linkedPlannedId`. Na gravação, o documento do orçamento é relido na transação e recebe a identificação da Nota importada; alterações simultâneas ou uma segunda tentativa de vínculo interrompem a operação. Se essa Nota for excluída pelo sistema, a reserva é removida na mesma transação.

Revisões são separadas em dois grupos: divergências protegidas de estáticos, duplicatas confirmadas e parcelas já vinculadas não podem ser aprovadas; alertas interpretativos, como possível parcelamento RBC, podem ser aprovados explicitamente depois da conferência do usuário. Uma possível duplicata mostra a Nota encontrada e exige uma das ações **Já está cadastrado — não importar** ou **É outra compra — importar**. Uma nova possível duplicata encontrada somente na revalidação volta para revisão.

Pagamentos de fatura e transferências são classificados como ignorados antes das sugestões de categoria e estabelecimento, evitando associações acidentais. Categoria e estabelecimento são obrigatórios na interface, no construtor da Nota e novamente na transação de gravação. A prévia apresenta separadamente o total de despesas encontradas no extrato e o total efetivamente selecionado para importação.

Pagamentos de fatura e transferências são ignorados porque não representam nova despesa. Créditos e estornos são gravados como valores negativos. Para cartões, `postedDate` continua determinando o ciclo e faturas fechadas afetadas são recalculadas a partir das notas, sem aplicar o mesmo delta duas vezes.

## Limitações atuais

- PDFs precisam ter texto selecionável. Para capturas de tela ou fotos, o OCR roda localmente no navegador; é possível selecionar até 20 imagens JPG, PNG ou WebP por vez.
- PDFs protegidos por senha devem ser exportados sem proteção.
- Os adaptadores RBC e CIBC reconhecem os campos e marcações públicas conhecidos, em inglês e francês, mas os próprios bancos podem variar o layout por produto ou atualizar o modelo do PDF.
- Linhas com datas numéricas ambíguas, mais de uma coluna monetária ou categoria desconhecida ficam para revisão.
- Um layout bancário que distribua uma única movimentação em estruturas incomuns pode não ser reconhecido; nesse caso nenhuma gravação é feita e um adaptador específico poderá ser adicionado ao núcleo independente.
- Sem um identificador bancário estável, extratos parciais ou sobrepostos que mudem a ordem de duas operações absolutamente idênticas continuam sendo inerentemente ambíguos. A reimportação do mesmo extrato é determinística, mas um recorte diferente pode exigir revisão humana.
- A transação protege concorrência entre importações e alterações do próprio item previsto. Uma Nota manual criada exatamente entre a última leitura e a transação, por um fluxo antigo que não registre a reserva no item previsto, ainda depende da revalidação imediatamente anterior; eliminar totalmente essa janela exige migrar também todos os fluxos manuais para a mesma trava transacional.
