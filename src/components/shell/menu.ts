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
      { rotulo: "Produtos", href: "/estoque", icone: "produtos" },
      { rotulo: "Serviços", href: "/servicos", icone: "servicos" },
    ],
  },
  {
    rotulo: "Vendas", icone: "vendas", filhos: [
      { rotulo: "Produtos", href: "/vendas", icone: "produtos" },
      { rotulo: "Balcão", href: "/vendas/balcao", icone: "balcao" },
    ],
  },
  {
    rotulo: "Ordens de serviços", icone: "os", filhos: [
      { rotulo: "Gerenciar O.S.", href: "/os", icone: "gerenciar" },
      { rotulo: "Painel", href: "/os/painel", icone: "painel" },
    ],
  },
  {
    rotulo: "Estoque", icone: "estoque", filhos: [
      { rotulo: "Saldos e reservas", href: "/estoque", icone: "produtos" },
      { rotulo: "Locais (prateleiras)", href: "/estoque/locais", icone: "locais" },
    ],
  },
  {
    rotulo: "Financeiro", icone: "financeiro", filhos: [
      { rotulo: "Contas a receber", href: "/financeiro?tipo=RECEBER", icone: "receber" },
      { rotulo: "Contas a pagar", href: "/financeiro?tipo=PAGAR", icone: "pagar" },
      { rotulo: "Conciliação bancária", href: "/financeiro/conciliacao", icone: "conciliacao" },
      { rotulo: "DRE", href: "/financeiro/dre", icone: "dre" },
    ],
  },
  {
    rotulo: "Fiscal", icone: "fiscal", filhos: [
      { rotulo: "Notas fiscais", href: "/fiscal", icone: "notas" },
    ],
  },
  {
    rotulo: "Configurações", icone: "configuracoes", filhos: [
      { rotulo: "Usuários e permissões", href: "/usuarios", icone: "funcionarios" },
      { rotulo: "Migração", href: "/migracao", icone: "migracao" },
      { rotulo: "Minha senha", href: "/conta", icone: "senha" },
    ],
  },
];

/** Módulo mostrado no botão colorido da barra superior, pelo caminho. */
export const MODULOS: { prefixo: string; rotulo: string; cor: string; icone: string }[] = [
  { prefixo: "/os", rotulo: "Ordens de serviços", cor: "#e8730c", icone: "os" },
  { prefixo: "/vendas", rotulo: "Vendas", cor: "#2e9d4f", icone: "vendas" },
  { prefixo: "/pdv", rotulo: "PDV", cor: "#2e9d4f", icone: "balcao" },
  { prefixo: "/financeiro", rotulo: "Financeiro", cor: "#2f6fd6", icone: "financeiro" },
  { prefixo: "/fiscal", rotulo: "Fiscal", cor: "#7a4fd1", icone: "fiscal" },
  { prefixo: "/estoque", rotulo: "Estoque", cor: "#b5651d", icone: "estoque" },
  { prefixo: "/clientes", rotulo: "Cadastros", cor: "#5b6573", icone: "cadastros" },
  { prefixo: "/campos-extras", rotulo: "Cadastros", cor: "#5b6573", icone: "cadastros" },
  { prefixo: "/tipos-enderecos", rotulo: "Cadastros", cor: "#5b6573", icone: "cadastros" },
  { prefixo: "/tipos-contatos", rotulo: "Cadastros", cor: "#5b6573", icone: "cadastros" },
  { prefixo: "/funcionarios", rotulo: "Cadastros", cor: "#5b6573", icone: "cadastros" },
  { prefixo: "/transportadoras", rotulo: "Cadastros", cor: "#5b6573", icone: "cadastros" },
  { prefixo: "/fornecedores", rotulo: "Cadastros", cor: "#5b6573", icone: "cadastros" },
  { prefixo: "/servicos", rotulo: "Itens", cor: "#5b6573", icone: "itens" },
  { prefixo: "/usuarios", rotulo: "Configurações", cor: "#5b6573", icone: "configuracoes" },
  { prefixo: "/migracao", rotulo: "Configurações", cor: "#5b6573", icone: "configuracoes" },
  { prefixo: "/conta", rotulo: "Configurações", cor: "#5b6573", icone: "configuracoes" },
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
