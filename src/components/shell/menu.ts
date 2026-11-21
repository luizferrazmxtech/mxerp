import type { PapelUsuario } from "@prisma/client";
import { podeAcessar } from "@/lib/auth/permissoes";

/** Menu lateral na mesma ordem e agrupamento do Gestão Click. */
export type SubItem = { rotulo: string; href: string; icone: string; filhos?: { rotulo: string; href: string; icone: string }[] };
export type ItemMenu = { rotulo: string; icone: string; href?: string; filhos?: SubItem[] };

export const MENU: ItemMenu[] = [
  {
    rotulo: "Cadastros", icone: "cadastros", filhos: [
      { rotulo: "Clientes", href: "/clientes", icone: "clientes" },
      { rotulo: "Fornecedores", href: "/fornecedores", icone: "fornecedores" },
      { rotulo: "Funcionários", href: "/funcionarios", icone: "funcionarios" },
      { rotulo: "Transportadoras", href: "/transportadoras", icone: "transportadoras" },
      {
        rotulo: "Opções auxiliares", href: "/tipos-contatos", icone: "auxiliares", filhos: [
          { rotulo: "Tipos de contatos", href: "/tipos-contatos", icone: "auxiliares" },
          { rotulo: "Tipos de endereços", href: "/tipos-enderecos", icone: "endereco" },
          { rotulo: "Campos extras", href: "/campos-extras", icone: "ajustes" },
        ],
      },
    ],
  },
  {
    rotulo: "Itens", icone: "itens", filhos: [
      { rotulo: "Produtos", href: "/produtos", icone: "produtos" },
      { rotulo: "Serviços", href: "/servicos", icone: "servicos" },
      {
        rotulo: "Opções auxiliares", href: "/etiquetas", icone: "auxiliares", filhos: [
          { rotulo: "Etiquetas", href: "/etiquetas", icone: "etiqueta" },
          { rotulo: "Valores de venda", href: "/valores-venda", icone: "valor" },
          { rotulo: "Grupos", href: "/grupos-produtos", icone: "lista" },
          { rotulo: "Unidades", href: "/unidades", icone: "ajustes" },
          { rotulo: "Grades", href: "/grades", icone: "cards" },
          { rotulo: "Campos extras", href: "/campos-extras?entidade=PRODUTO", icone: "ajustes" },
        ],
      },
    ],
  },
  {
    rotulo: "Orçamentos", icone: "notas", filhos: [
      { rotulo: "Gerenciar orçamentos", href: "/orcamentos", icone: "gerenciar" },
      {
        rotulo: "Opções auxiliares", href: "/orcamentos/situacoes", icone: "auxiliares", filhos: [
          { rotulo: "Situações", href: "/orcamentos/situacoes", icone: "lista" },
          { rotulo: "Campos extras", href: "/campos-extras?entidade=ORCAMENTO", icone: "ajustes" },
          { rotulo: "Mensagens", href: "/orcamentos/mensagens", icone: "email" },
          { rotulo: "Configurações", href: "/orcamentos/configuracoes", icone: "configuracoes" },
        ],
      },
    ],
  },
  {
    rotulo: "Vendas", icone: "vendas", filhos: [
      { rotulo: "Gerenciar vendas", href: "/vendas", icone: "gerenciar" },
      { rotulo: "Balcão", href: "/vendas/balcao", icone: "balcao" },
      { rotulo: "Trocas e devoluções", href: "/vendas/devolucoes", icone: "atualizar" },
      { rotulo: "Envios (Melhor Envio)", href: "/frete", icone: "frete" },
      {
        rotulo: "Opções auxiliares", href: "/vendas/situacoes", icone: "auxiliares", filhos: [
          { rotulo: "Situações", href: "/vendas/situacoes", icone: "lista" },
          { rotulo: "Canais de venda", href: "/vendas/canais", icone: "lojas" },
          { rotulo: "Campos extras", href: "/campos-extras?entidade=VENDA", icone: "ajustes" },
          { rotulo: "Mensagens", href: "/vendas/mensagens", icone: "email" },
          { rotulo: "Balanças", href: "/vendas/balancas", icone: "balcao" },
          { rotulo: "Configurações", href: "/vendas/configuracoes", icone: "configuracoes" },
        ],
      },
    ],
  },
  {
    rotulo: "Atendimentos", icone: "atendimento", filhos: [
      { rotulo: "Chamados", href: "/chamados", icone: "gerenciar" },
      { rotulo: "Novo chamado", href: "/chamados/novo", icone: "mais" },
    ],
  },
  {
    rotulo: "Ordens de serviços", icone: "os", filhos: [
      { rotulo: "Gerenciar O.S.", href: "/os", icone: "gerenciar" },
      { rotulo: "Painel", href: "/os/painel", icone: "painel" },
      { rotulo: "Tela do técnico", href: "/tecnico", icone: "celular" },
      {
        rotulo: "Opções auxiliares", href: "/os/situacoes", icone: "auxiliares", filhos: [
          { rotulo: "Situações", href: "/os/situacoes", icone: "lista" },
          { rotulo: "Equipes", href: "/os/equipes", icone: "equipe" },
          { rotulo: "Campos extras", href: "/campos-extras?entidade=OS", icone: "ajustes" },
          { rotulo: "Mensagens", href: "/os/mensagens", icone: "email" },
          { rotulo: "Configurações", href: "/os/configuracoes", icone: "configuracoes" },
        ],
      },
    ],
  },
  {
    rotulo: "Contratos", icone: "contratos", filhos: [
      { rotulo: "Gerenciar contratos", href: "/contratos", icone: "gerenciar" },
      {
        rotulo: "Opções auxiliares", href: "/contratos/configuracoes", icone: "auxiliares", filhos: [
          { rotulo: "Configurações, e-mail e WhatsApp", href: "/contratos/configuracoes", icone: "configuracoes" },
        ],
      },
    ],
  },
  {
    rotulo: "Estoque", icone: "estoque", filhos: [
      { rotulo: "Movimentações", href: "/estoque/movimentacoes", icone: "transferir" },
      { rotulo: "Ajustes", href: "/estoque/ajustes", icone: "ajustes" },
      { rotulo: "Transferências", href: "/estoque/transferencias", icone: "lojas" },
      { rotulo: "Saldos e reservas", href: "/estoque", icone: "produtos" },
      { rotulo: "Locais (prateleiras)", href: "/estoque/locais", icone: "locais" },
      { rotulo: "Custos e margens", href: "/estoque/custos", icone: "dinheiro" },
      {
        rotulo: "Compras", href: "/compras", icone: "carrinho", filhos: [
          { rotulo: "Produtos", href: "/compras", icone: "produtos" },
          { rotulo: "Entrada por XML", href: "/compras/importar-xml", icone: "importar" },
          { rotulo: "Notas recebidas (SEFAZ)", href: "/compras/notas-recebidas", icone: "notas" },
          { rotulo: "Serviços", href: "/compras/servicos", icone: "servicos" },
          { rotulo: "Cotações", href: "/compras/cotacoes", icone: "cotacao" },
        ],
      },
      {
        rotulo: "Opções auxiliares", href: "/compras/situacoes", icone: "auxiliares", filhos: [
          { rotulo: "Situações de compras", href: "/compras/situacoes", icone: "lista" },
          { rotulo: "Campos extras", href: "/campos-extras?entidade=COMPRA", icone: "ajustes" },
          { rotulo: "Modelos de e-mail", href: "/compras/mensagens", icone: "email" },
          { rotulo: "Configurações", href: "/estoque/configuracoes", icone: "configuracoes" },
        ],
      },
    ],
  },
  {
    rotulo: "Financeiro", icone: "financeiro", filhos: [
      { rotulo: "Contas a receber", href: "/financeiro?tipo=RECEBER", icone: "receber" },
      { rotulo: "Contas a pagar", href: "/financeiro?tipo=PAGAR", icone: "pagar" },
      { rotulo: "Fluxo de caixa", href: "/financeiro/fluxo", icone: "grafico" },
      { rotulo: "Conciliação bancária", href: "/financeiro/conciliacao", icone: "conciliacao" },
      { rotulo: "Boletos pagos sem conta", href: "/financeiro/avisos-boletos", icone: "alerta" },
      { rotulo: "Conciliação PagSeguro", href: "/pagseguro", icone: "cartao" },
      { rotulo: "DRE", href: "/financeiro/dre", icone: "dre" },
      {
        rotulo: "Opções auxiliares", href: "/financeiro/contas", icone: "auxiliares", filhos: [
          { rotulo: "Contas bancárias", href: "/financeiro/contas", icone: "financeiro" },
          { rotulo: "Transferências", href: "/financeiro/transferencias", icone: "conciliacao" },
          { rotulo: "Plano de contas", href: "/financeiro/plano-contas", icone: "lista" },
          { rotulo: "Centros de custo", href: "/financeiro/centros-custo", icone: "lojas" },
        ],
      },
    ],
  },
  {
    rotulo: "Relatórios", icone: "grafico", filhos: [
      { rotulo: "Todos os relatórios", href: "/relatorios", icone: "lista" },
      { rotulo: "Lucro", href: "/relatorios/lucro", icone: "dinheiro" },
      { rotulo: "Curva ABC", href: "/relatorios/curva-abc", icone: "grafico" },
      { rotulo: "Comissões", href: "/relatorios/comissoes", icone: "percentual" },
      { rotulo: "Tempo das OS", href: "/relatorios/tempo-os", icone: "relogio" },
    ],
  },
  {
    rotulo: "Fiscal", icone: "fiscal", filhos: [
      { rotulo: "NF-e (produtos)", href: "/fiscal?modelo=NFE", icone: "notas" },
      { rotulo: "NFC-e (consumidor)", href: "/fiscal?modelo=NFCE", icone: "balcao" },
      { rotulo: "NFS-e (serviços)", href: "/fiscal?modelo=NFSE", icone: "servicos" },
      { rotulo: "Todas as notas", href: "/fiscal", icone: "lista" },
      { rotulo: "Imposto aproximado", href: "/fiscal/impostos", icone: "percentual" },
      { rotulo: "Inutilizar numeração", href: "/fiscal/inutilizacao", icone: "excluir" },
      { rotulo: "Configurações fiscais", href: "/empresas", icone: "configuracoes" },
    ],
  },
  {
    rotulo: "Configurações", icone: "configuracoes", filhos: [
      { rotulo: "Empresas (lojas)", href: "/empresas", icone: "lojas" },
      { rotulo: "Usuários e permissões", href: "/usuarios", icone: "funcionarios" },
      { rotulo: "Registro de auditoria", href: "/auditoria", icone: "lista" },
      {
        rotulo: "Integrações", href: "/frete/configuracoes", icone: "conciliacao", filhos: [
          { rotulo: "Banco Inter (API)", href: "/financeiro/conciliacao/inter", icone: "conciliacao" },
          { rotulo: "WhatsApp (MXChat)", href: "/whatsapp", icone: "whatsapp" },
          { rotulo: "Frete (Melhor Envio)", href: "/frete/configuracoes", icone: "frete" },
          { rotulo: "PagSeguro", href: "/pagseguro/configuracoes", icone: "cartao" },
        ],
      },
      { rotulo: "Migração", href: "/migracao", icone: "migracao" },
      { rotulo: "Minha senha", href: "/conta", icone: "senha" },
    ],
  },
];

/** Módulo mostrado no botão colorido da barra superior, pelo caminho. */
export const MODULOS: { prefixo: string; rotulo: string; cor: string; icone: string }[] = [
  { prefixo: "/orcamentos", rotulo: "Orçamentos", cor: "#0f8a8a", icone: "notas" },
  { prefixo: "/chamados", rotulo: "Atendimentos", cor: "#7c3aed", icone: "atendimento" },
  { prefixo: "/os", rotulo: "Ordens de serviços", cor: "#e8730c", icone: "os" },
  { prefixo: "/tecnico", rotulo: "Técnico", cor: "#e8730c", icone: "os" },
  { prefixo: "/vendas", rotulo: "Vendas", cor: "#2e9d4f", icone: "vendas" },
  { prefixo: "/contratos", rotulo: "Contratos", cor: "#0e7490", icone: "contratos" },
  { prefixo: "/pagseguro/configuracoes", rotulo: "Configurações", cor: "#5b6573", icone: "configuracoes" },
  { prefixo: "/pagseguro", rotulo: "Financeiro", cor: "#2f6fd6", icone: "financeiro" },
  { prefixo: "/frete/configuracoes", rotulo: "Configurações", cor: "#5b6573", icone: "configuracoes" },
  { prefixo: "/frete", rotulo: "Vendas", cor: "#2e9d4f", icone: "vendas" },
  { prefixo: "/pdv", rotulo: "PDV", cor: "#2e9d4f", icone: "balcao" },
  { prefixo: "/financeiro", rotulo: "Financeiro", cor: "#2f6fd6", icone: "financeiro" },
  { prefixo: "/relatorios", rotulo: "Relatórios", cor: "#5b6573", icone: "grafico" },
  { prefixo: "/fiscal", rotulo: "Fiscal", cor: "#7a4fd1", icone: "fiscal" },
  { prefixo: "/estoque", rotulo: "Estoque", cor: "#b5651d", icone: "estoque" },
  { prefixo: "/compras", rotulo: "Estoque", cor: "#b5651d", icone: "estoque" },
  { prefixo: "/clientes", rotulo: "Cadastros", cor: "#5b6573", icone: "cadastros" },
  { prefixo: "/campos-extras", rotulo: "Cadastros", cor: "#5b6573", icone: "cadastros" },
  { prefixo: "/tipos-enderecos", rotulo: "Cadastros", cor: "#5b6573", icone: "cadastros" },
  { prefixo: "/tipos-contatos", rotulo: "Cadastros", cor: "#5b6573", icone: "cadastros" },
  { prefixo: "/funcionarios", rotulo: "Cadastros", cor: "#5b6573", icone: "cadastros" },
  { prefixo: "/transportadoras", rotulo: "Cadastros", cor: "#5b6573", icone: "cadastros" },
  { prefixo: "/fornecedores", rotulo: "Cadastros", cor: "#5b6573", icone: "cadastros" },
  { prefixo: "/servicos", rotulo: "Itens", cor: "#5b6573", icone: "itens" },
  { prefixo: "/produtos", rotulo: "Itens", cor: "#5b6573", icone: "itens" },
  { prefixo: "/etiquetas", rotulo: "Itens", cor: "#5b6573", icone: "itens" },
  { prefixo: "/valores-venda", rotulo: "Itens", cor: "#5b6573", icone: "itens" },
  { prefixo: "/grupos-produtos", rotulo: "Itens", cor: "#5b6573", icone: "itens" },
  { prefixo: "/unidades", rotulo: "Itens", cor: "#5b6573", icone: "itens" },
  { prefixo: "/grades", rotulo: "Itens", cor: "#5b6573", icone: "itens" },
  { prefixo: "/empresas", rotulo: "Configurações", cor: "#5b6573", icone: "configuracoes" },
  { prefixo: "/auditoria", rotulo: "Configurações", cor: "#5b6573", icone: "configuracoes" },
  { prefixo: "/usuarios", rotulo: "Configurações", cor: "#5b6573", icone: "configuracoes" },
  { prefixo: "/migracao", rotulo: "Configurações", cor: "#5b6573", icone: "configuracoes" },
  { prefixo: "/conta", rotulo: "Configurações", cor: "#5b6573", icone: "configuracoes" },
  { prefixo: "/whatsapp", rotulo: "Configurações", cor: "#5b6573", icone: "configuracoes" },
];

export function menuDoPapel(papel: PapelUsuario): ItemMenu[] {
  return MENU.map((g) => ({
    ...g,
    filhos: g.filhos
      ?.map((f) => (f.filhos ? { ...f, filhos: f.filhos.filter((x) => podeAcessar(papel, x.href.split("?")[0])) } : f))
      .filter((f) => (f.filhos ? f.filhos.length > 0 : podeAcessar(papel, f.href.split("?")[0]))),
  }))
    .filter((g) => (g.filhos ? g.filhos.length > 0 : g.href && podeAcessar(papel, g.href)));
}
