/** Tipos e regras do formulário de orçamento que também rodam no navegador (sem banco). */
import { lerNumero } from "@/lib/itens/tipos";

export { lerNumero };

export type LinhaProduto = { id?: string; produtoId: string; nome: string; codigo: string; unidade: string; detalhes: string; quantidade: string; tipoValorId: string; valorUnit: string; desconto: string; descontoPct: boolean; valores?: { tipoValorId: string; valor: number }[]; disponivel?: number | null };
export type LinhaServico = { id?: string; servicoId: string; nome: string; codigo: string; detalhes: string; quantidade: string; valorUnit: string; desconto: string; descontoPct: boolean };
export type Parcela = { vencimento: string; valor: string; formaPagamentoId: string; observacao: string };

export type DadosOrcamento = {
  tipo: "PRODUTO" | "SERVICO";
  numero: string; clienteId: string; clienteNome: string; data: string; validade: string; vendedorId: string; prazoEntrega: string;
  aosCuidados: string; canal: string; centroCusto: string; introducao: string; situacaoId: string;
  produtos: LinhaProduto[]; servicos: LinhaServico[];
  transportadoraId: string; transportadoraNome: string; frete: string; mostrarEntrega: boolean; enderecoEntregaId: string;
  desconto: string; descontoPct: boolean; exibirTotal: boolean;
  gerarCondicoes: boolean; condicao: "AVISTA" | "PARCELADO"; formaPagamentoId: string; vencimento: string; intervaloDias: string; numParcelas: string; primeiraParcela: string;
  parcelas: Parcela[];
  observacoes: string; observacaoInterna: string; camposExtras: Record<string, string>;
};

export const CANAIS = ["Presencial", "Telemarketing", "Internet"];

/** Cores das situações (as mesmas pílulas do Gestão Click). */
export const CORES: Record<string, { rotulo: string; pilula: string; ponto: string }> = {
  cinza: { rotulo: "Cinza", pilula: "border-slate-300 bg-slate-50 text-slate-700", ponto: "bg-slate-400" },
  amarelo: { rotulo: "Amarelo", pilula: "border-amber-300 bg-amber-50 text-amber-800", ponto: "bg-amber-400" },
  verde: { rotulo: "Verde", pilula: "border-emerald-300 bg-emerald-50 text-emerald-700", ponto: "bg-emerald-500" },
  vermelho: { rotulo: "Vermelho", pilula: "border-red-300 bg-red-50 text-red-700", ponto: "bg-red-500" },
  azul: { rotulo: "Azul", pilula: "border-sky-300 bg-sky-50 text-sky-700", ponto: "bg-sky-500" },
  laranja: { rotulo: "Laranja", pilula: "border-orange-300 bg-orange-50 text-orange-700", ponto: "bg-orange-500" },
  roxo: { rotulo: "Roxo", pilula: "border-violet-300 bg-violet-50 text-violet-700", ponto: "bg-violet-500" },
  preto: { rotulo: "Preto", pilula: "border-slate-700 bg-slate-800 text-white", ponto: "bg-slate-900" },
  marrom: { rotulo: "Marrom", pilula: "border-amber-700 bg-amber-100 text-amber-900", ponto: "bg-amber-800" },
  purpura: { rotulo: "Púrpura", pilula: "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700", ponto: "bg-fuchsia-600" },
};
export const cor = (c: string) => CORES[c] ?? CORES.cinza;

const arred = (v: number) => Math.round(v * 100) / 100;
const n = (s: string) => lerNumero(s) ?? 0;

/** Desconto da linha em reais (o campo aceita R$ ou %). */
export function descontoLinha(bruto: number, desconto: string, pct: boolean) {
  const d = n(desconto);
  return arred(pct ? (bruto * d) / 100 : d);
}
export const subtotalProduto = (l: Pick<LinhaProduto, "quantidade" | "valorUnit" | "desconto" | "descontoPct">) => {
  const bruto = n(l.quantidade) * n(l.valorUnit);
  return arred(bruto - descontoLinha(bruto, l.desconto, l.descontoPct));
};
export const subtotalServico = subtotalProduto;

/** Totais do orçamento: produtos, serviços, desconto geral (R$ ou %), frete e total. */
export function totais(d: Pick<DadosOrcamento, "produtos" | "servicos" | "desconto" | "descontoPct" | "frete">) {
  const produtos = arred(d.produtos.reduce((s, l) => s + subtotalProduto(l), 0));
  const servicos = arred(d.servicos.reduce((s, l) => s + subtotalServico(l), 0));
  const desconto = descontoLinha(produtos + servicos, d.desconto, d.descontoPct);
  const frete = n(d.frete);
  return { produtos, servicos, desconto, frete, total: arred(produtos + servicos - desconto + frete) };
}

const isoMais = (iso: string, dias: number) => {
  const t = new Date(`${iso}T12:00:00Z`).getTime() + dias * 86400000;
  return new Date(t).toISOString().slice(0, 10);
};

/** "Gerar parcelas": divide o total; a última parcela leva a diferença dos centavos. */
export function gerarParcelas(total: number, num: number, primeira: string, intervalo: number, formaPagamentoId: string): Parcela[] {
  const qtd = Math.max(1, Math.trunc(num));
  const base = Math.floor((total / qtd) * 100) / 100;
  return Array.from({ length: qtd }, (_, i) => ({
    vencimento: isoMais(primeira, i * intervalo),
    valor: (i === qtd - 1 ? arred(total - base * (qtd - 1)) : base).toFixed(2).replace(".", ","),
    formaPagamentoId, observacao: "",
  }));
}

/** Tags aceitas nos modelos de mensagem. */
export const TAGS_MENSAGEM = ["[nome_cliente]", "[numero]", "[valor_total]", "[data]", "[validade]", "[vendedor]", "[link]", "[nome_empresa]"];

export function aplicarTags(texto: string, v: Record<string, string>) {
  return texto.replace(/\[([a-z_]+)\]/g, (m, k) => v[k] ?? m);
}

/** Campos opcionais do bloco de dados e colunas opcionais das tabelas de itens ("Gerenciar campos"). */
export const CAMPOS_DADOS = [
  { chave: "numero", rotulo: "Número" }, { chave: "vendedor", rotulo: "Vendedor" }, { chave: "prazo", rotulo: "Prazo de entrega" },
  { chave: "cuidados", rotulo: "Aos cuidados de" }, { chave: "validade", rotulo: "Validade" }, { chave: "canal", rotulo: "Canal de venda" },
  { chave: "centro", rotulo: "Centro de custo" }, { chave: "introducao", rotulo: "Introdução da proposta" },
];
export const COLUNAS_ITENS = [{ chave: "detalhes", rotulo: "Detalhes" }, { chave: "desconto", rotulo: "Desconto" }];
export const CAMPOS_VENDA = [
  { chave: "numero", rotulo: "Número" }, { chave: "vendedor", rotulo: "Vendedor" }, { chave: "prazo", rotulo: "Prazo de entrega" },
  { chave: "canal", rotulo: "Canal de venda" }, { chave: "centro", rotulo: "Centro de custo" },
];
