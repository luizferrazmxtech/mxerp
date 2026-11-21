# Mercado Livre no MXERP

Pedido pago no Mercado Livre vira venda no MXERP (baixa o estoque e lança a conta a receber). Quando o Mercado Pago
libera o dinheiro, a conta é baixada sozinha na conta "Mercado Pago" e a diferença para o líquido (comissão, taxa e
frete cobrado) é lançada como despesa paga em "Tarifas de marketplace".

## 1. Criar o aplicativo (uma vez, ~5 minutos)

1. Entre em https://developers.mercadolivre.com.br com a **conta de vendedor** e abra **Minhas aplicações › Criar aplicação**.
2. Preencha nome (ex.: "MXERP"), descrição e logo (qualquer imagem).
3. **URL de redirecionamento**:
   - ERP com endereço https público (VPS): `https://SEU-ERP/api/mercadolivre/callback`;
   - ERP só no PC: um endereço https seu (ex.: `https://www.mxtech.inf.br/`). Depois de autorizar, você copia o endereço final e cola no MXERP.
4. **Escopos**: leitura e escrita (`read`, `write`) e `offline_access` (renovação automática do acesso).
5. **Tópicos de notificação** (opcional, só com endereço público): marque **Orders** e use a URL que aparece em
   Vendas › Marketplaces › Mercado Livre.
6. Salve e copie o **Client ID** e a **Secret Key**.

## 2. Configurar no MXERP

Vendas › Marketplaces › Mercado Livre (só o administrador):

1. Cole Client ID, Secret Key e a mesma URL de redirecionamento do aplicativo.
2. **Pedidos a partir de**: a data em que o MXERP passa a cuidar dos pedidos. Os anteriores (já lançados à mão) ficam de fora.
3. Escolha a situação da venda (padrão: a que lança estoque e financeiro), a conta onde o dinheiro é liberado e a forma
   de pagamento (padrão: "Mercado Pago", criadas sozinhas) e salve.
4. Clique em **Conectar com o Mercado Livre**, entre na conta de vendedor e autorize. Se a página final não for o ERP,
   copie o endereço inteiro dela (tem `?code=TG-…`) e cole em "Concluir conexão" (vale 10 minutos).
5. Clique em **Sincronizar agora**.

## 3. No dia a dia

- O agendador busca pedidos e liberações de hora em hora (8h às 20h). Com notificações, o pedido entra na hora.
- **Produtos**: o item do pedido é ligado ao produto pelo SKU do anúncio (= código, código de barras ou código da variação).
  O que não casar aparece em Vendas › Marketplaces › Anúncios: informe o código do produto e os pedidos parados viram venda.
- **Cancelamento** antes da liberação: a venda vai para a situação cancelada (devolve o estoque, tira a conta a receber).
  Depois da liberação, o pedido mostra um aviso para fazer a devolução à mão.
- Conta a receber já baixada à mão não é mexida; o pedido avisa que a tarifa não foi lançada.
