import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { todasAsLojas } from "@/lib/empresa/loja";
import { Pagina } from "@/components/ui/Pagina";
import FormProduto, { type InicialProduto } from "./FormProduto";

const cnpjFmt = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
const n = (v: unknown, casas = 2) => (v == null ? "" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: 4 }));

export default async function PaginaFormProduto({ id }: { id?: string }) {
  const [grupos, unidades, tipos, locais, depositos, empresas, campos] = await Promise.all([
    prisma.grupoProduto.findMany({ orderBy: { nome: "asc" }, include: { pai: { select: { nome: true } } } }),
    prisma.unidade.findMany({ orderBy: { sigla: "asc" } }),
    prisma.tipoValor.findMany({ orderBy: [{ padrao: "desc" }, { nome: "asc" }] }),
    prisma.local.findMany({ where: { ativo: true }, orderBy: { codigo: "asc" }, include: { deposito: { select: { nome: true } } } }),
    todasAsLojas(() => prisma.deposito.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } })),
    prisma.empresa.findMany({ select: { id: true, nomeFantasia: true, razaoSocial: true, cnpj: true } }),
    prisma.campoExtra.findMany({ where: { entidade: "PRODUTO" }, orderBy: [{ ordem: "asc" }, { nome: "asc" }] }),
  ]);
  const saldos = id ? await prisma.saldo.findMany({ where: { produtoId: id }, include: { local: { select: { depositoId: true } } } }) : [];
  const padrao = tipos.find((t) => t.padrao) ?? tipos[0];
  let inicial: InicialProduto = {
    nome: "", codigo: "", gtin: "", grupoId: "", controlaEstoque: true, emiteNota: true, possuiVariacoes: false, possuiComposicao: false,
    unidade: unidades.find((u) => u.padrao)?.sigla ?? "UN", converte: false, unidadeCompra: "", fatorConversao: "1",
    ativo: true, vendidoSeparadamente: true, vendePdv: true, comissao: "", camposExtras: {}, peso: "", largura: "", altura: "", comprimento: "", descricao: "",
    custo: "0,00", despesasAcessorias: "0,00", outrasDespesas: "0,00",
    valores: padrao ? [{ tipoValorId: padrao.id, nome: padrao.nome, lucroSugerido: String(Number(padrao.lucro)), lucroUtilizado: n(padrao.lucro), valor: "0,00", ativo: true }] : [],
    estoqueMinimo: "", estoqueMaximo: "", quantidadeInicial: "", localId: "",
    ncm: "", cest: "", origem: "0", codigoBeneficio: "", pesoLiquido: "", pesoBruto: "", numeroFci: "", produtoEspecifico: "Não usar",
    cfopInterno: "", cfopExterno: "", csosn: "", cstIcms: "", aliquotaIcms: "", cstPis: "", cstCofins: "", cClassTrib: "",
    fornecedores: [], lojas: empresas.map((e) => e.id), variacoes: [], componentes: [], fotos: [],
  };
  if (id) {
    const p = await prisma.produto.findUnique({
      where: { id },
      include: { valores: { include: { tipoValor: true } }, fornecedores: { include: { fornecedor: { select: { nome: true } } } }, variacoes: { orderBy: { ordem: "asc" } }, componentes: { include: { componente: { select: { nome: true } } } } },
    });
    if (!p) notFound();
    const fotos = await prisma.anexo.findMany({ where: { entidade: "FOTO_PRODUTO", entidadeId: id }, orderBy: [{ ordem: "asc" }, { createdAt: "asc" }], select: { id: true } });
    const s = (x: string | null) => x ?? "";
    inicial = {
      id, nome: p.nome, codigo: p.codigo, gtin: s(p.gtin), grupoId: s(p.grupoId), controlaEstoque: p.controlaEstoque, emiteNota: p.emiteNota,
      possuiVariacoes: p.possuiVariacoes, possuiComposicao: p.possuiComposicao, unidade: p.unidade, converte: !!p.unidadeCompra,
      unidadeCompra: s(p.unidadeCompra), fatorConversao: n(p.fatorConversao, 0), ativo: p.ativo, vendidoSeparadamente: p.vendidoSeparadamente, vendePdv: p.vendePdv,
      comissao: n(p.comissao), camposExtras: (p.camposExtras ?? {}) as Record<string, string>,
      peso: n(p.peso, 0), largura: n(p.largura, 0), altura: n(p.altura, 0), comprimento: n(p.comprimento, 0), descricao: s(p.descricao),
      custo: n(p.custo), despesasAcessorias: n(p.despesasAcessorias), outrasDespesas: n(p.outrasDespesas),
      valores: p.valores.length
        ? p.valores.map((v) => ({ tipoValorId: v.tipoValorId, nome: v.tipoValor.nome, lucroSugerido: String(Number(v.tipoValor.lucro)), lucroUtilizado: n(v.lucroUtilizado), valor: n(v.valor), ativo: v.ativo }))
        // produto criado por outra tela (OS, nota de entrada…) sem a tabela de valores: parte do preço atual
        : padrao ? [{ tipoValorId: padrao.id, nome: padrao.nome, lucroSugerido: String(Number(padrao.lucro)), lucroUtilizado: n(Number(p.custo) > 0 ? ((Number(p.precoVenda) - Number(p.custo)) / Number(p.custo)) * 100 : 0), valor: n(p.precoVenda), ativo: true }] : [],
      estoqueMinimo: Number(p.estoqueMinimo) ? n(p.estoqueMinimo, 0) : "", estoqueMaximo: n(p.estoqueMaximo, 0), quantidadeInicial: "", localId: s(p.localPadraoId),
      ncm: s(p.ncm), cest: s(p.cest), origem: String(p.origem), codigoBeneficio: s(p.codigoBeneficio), pesoLiquido: n(p.pesoLiquido, 0), pesoBruto: n(p.pesoBruto, 0),
      numeroFci: s(p.numeroFci), produtoEspecifico: p.produtoEspecifico ?? "Não usar",
      cfopInterno: s(p.cfopInterno), cfopExterno: s(p.cfopExterno), csosn: s(p.csosn), cstIcms: s(p.cstIcms), aliquotaIcms: n(p.aliquotaIcms),
      cstPis: s(p.cstPis), cstCofins: s(p.cstCofins), cClassTrib: s(p.cClassTrib),
      fornecedores: p.fornecedores.map((f) => ({ fornecedorId: f.fornecedorId, nome: f.fornecedor.nome, codigo: s(f.codigo) })),
      lojas: p.lojas.length ? p.lojas : empresas.map((e) => e.id),
      variacoes: p.variacoes.map((v) => ({ nome: v.nome, codigo: s(v.codigo), gtin: s(v.gtin) })),
      componentes: p.componentes.map((c) => ({ componenteId: c.componenteId, nome: c.componente.nome, quantidade: n(c.quantidade, 0) })),
      fotos: fotos.map((f) => f.id),
    };
  }
  const acao = id ? "Editar" : "Adicionar";
  return (
    <Pagina titulo={`${acao} produto`} trilha={[{ rotulo: "Produtos", href: "/produtos" }, { rotulo: acao }]}>
      <FormProduto inicial={inicial} op={{
        grupos: grupos.map((g) => ({ id: g.id, nome: g.pai ? `${g.pai.nome} › ${g.nome}` : g.nome })),
        unidades: unidades.map((u) => ({ sigla: u.sigla, nome: u.nome })),
        tiposValor: tipos.map((t) => ({ id: t.id, nome: t.nome, lucro: Number(t.lucro) })),
        locais: locais.map((l) => ({ id: l.id, codigo: l.codigo, deposito: l.deposito.nome })),
        depositos: depositos.map((dp) => ({ id: dp.id, nome: dp.nome, quantidade: saldos.filter((s) => s.local.depositoId === dp.id).reduce((a, s) => a + Number(s.quantidade), 0) })),
        lojas: empresas.map((e) => ({ id: e.id, nome: e.nomeFantasia || e.razaoSocial, cnpj: cnpjFmt(e.cnpj) })),
        campos: campos.map((c) => ({ id: c.id, nome: c.nome })),
      }} />
    </Pagina>
  );
}
