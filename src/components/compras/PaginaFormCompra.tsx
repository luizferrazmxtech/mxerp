import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { dadosDaCompra, proximoNumeroCompra, situacaoPadraoCompra } from "@/lib/compras/compras";
import { compraDaCotacao } from "@/lib/compras/cotacoes";
import { rotuloLancamento } from "@/lib/compras/tipos";
import { Pagina } from "@/components/ui/Pagina";
import FormCompra, { type InicialCompra } from "./FormCompra";
import ImportarXmlCompra from "./ImportarXmlCompra";
import { estoquePadraoEntrada, estoquesDeEntrada } from "@/lib/estoque/entrada";

const hoje = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
export const baseCompras = (t: string) => (t === "SERVICO" ? "/compras/servicos" : "/compras");
export const tituloCompras = (t: string) => (t === "SERVICO" ? "Compras de serviços" : "Compras de produtos");

/** "Adicionar/Editar compra"; também abre a compra gerada de uma cotação (?cotacao=&f=). */
export default async function PaginaFormCompra({ tipo = "PRODUTO", id, cotacao, fornecedorCotacao, xml, recebidaId }: { tipo?: "PRODUTO" | "SERVICO"; id?: string; cotacao?: string; fornecedorCotacao?: string; xml?: boolean; recebidaId?: string }) {
  const [situacoes, formas, campos, centros, proximo, padrao, estoques] = await Promise.all([
    prisma.situacaoCompraConfig.findMany({ orderBy: { ordem: "asc" } }),
    prisma.formaPagamento.findMany({ where: { ativa: true }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    prisma.campoExtra.findMany({ where: { entidade: "COMPRA" }, orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true, nome: true } }),
    prisma.compra.findMany({ where: { centroCusto: { not: null } }, distinct: ["centroCusto"], select: { centroCusto: true } }),
    proximoNumeroCompra(),
    situacaoPadraoCompra(),
    estoquesDeEntrada(),
  ]);
  const estoquePadrao = (await estoquePadraoEntrada(prisma, estoques)) ?? "";
  let inicial: InicialCompra = {
    tipo, numero: "", fornecedorId: "", fornecedorNome: "", data: hoje(), situacaoId: padrao.id, numeroNfe: "", chaveNfe: "", centroCusto: "",
    produtos: [], servicos: [], transportadoraId: "", transportadoraNome: "", frete: "0,00", freteNoTotal: true, impostos: "0,00", impostosNoTotal: true,
    desconto: "", descontoPct: false, condicao: "AVISTA", formaPagamentoId: "", vencimento: hoje(), intervaloDias: "30", numParcelas: "2", primeiraParcela: hoje(), parcelas: [],
    observacoes: "", observacaoInterna: "", camposExtras: {}, proximoNumero: proximo, anexos: [], depositoId: estoquePadrao,
  };
  if (id) {
    const existe = await prisma.compra.findUnique({ where: { id }, select: { id: true } });
    if (!existe) notFound();
    const d = await dadosDaCompra(id);
    const anexos = await prisma.anexo.findMany({ where: { entidade: "COMPRA", entidadeId: id }, select: { id: true, nome: true } });
    inicial = { ...inicial, ...d, vencimento: d.vencimento || d.data, primeiraParcela: d.primeiraParcela || d.data, anexos, depositoId: d.depositoId || estoquePadrao };
  } else if (cotacao && fornecedorCotacao) {
    inicial = { ...inicial, ...(await compraDaCotacao(cotacao, fornecedorCotacao)), depositoId: estoquePadrao };
  }
  const acao = xml ? "Importar XML" : id ? "Editar" : "Adicionar";
  const op = { situacoes: situacoes.map((s) => ({ id: s.id, nome: `${s.nome} (${rotuloLancamento(s.lancamento).toLowerCase()})` })), formas, campos, centros: centros.map((c) => c.centroCusto!), estoques };
  return (
    <Pagina titulo={xml ? "Importar XML da compra" : `${acao} compra`} trilha={[{ rotulo: tituloCompras(inicial.tipo), href: baseCompras(inicial.tipo) }, { rotulo: acao }]}>
      {xml ? <ImportarXmlCompra inicial={inicial} op={op} recebidaId={recebidaId} /> : <FormCompra inicial={inicial} op={op} />}
    </Pagina>
  );
}
