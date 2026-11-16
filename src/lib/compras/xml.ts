import { XMLParser } from "fast-xml-parser";
import { prisma } from "@/lib/db";
import { pessoaDoXml } from "@/lib/cadastros/importacao";
import { importarPessoas } from "@/lib/migracao/importar";
import { configEstoque } from "@/lib/estoque/config";
import type { DadosCompra, LinhaCompra } from "./tipos";

/**
 * "Importar XML" da compra: lê a NF-e do fornecedor e monta a compra (fornecedor, NF-e, itens,
 * frete, desconto e impostos conforme as configurações de estoque). Itens que não se ligam a
 * nenhum produto ficam em branco no formulário, com o nome da nota em "Detalhes".
 */
export async function compraDoXml(xml: string): Promise<{ dados: Partial<DadosCompra>; avisos: string[] }> {
  const doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", parseTagValue: false }).parse(xml);
  const nfe = doc?.nfeProc?.NFe ?? doc?.NFe;
  const inf = nfe?.infNFe;
  if (!inf?.det || !inf?.emit) throw new Error("O arquivo não é o XML de uma NF-e");
  const s = (v: unknown) => (v == null ? "" : String(v));
  const num = (v: unknown) => Number(s(v) || 0);
  const fmt = (v: number, c = 2) => v.toFixed(c).replace(".", ",");
  const cfg = (await configEstoque()).xml;
  const avisos: string[] = [];

  // fornecedor = emitente da nota (cadastra se ainda não existir)
  const docEmit = s(inf.emit.CNPJ || inf.emit.CPF).replace(/\D/g, "");
  let forn = docEmit ? await prisma.pessoa.findUnique({ where: { documento: docEmit }, select: { id: true, nome: true, fornecedor: true } }) : null;
  if (!forn) {
    const linha = await pessoaDoXml(xml, "fornecedor");
    if (linha) await importarPessoas([linha], "fornecedor", false);
    forn = docEmit ? await prisma.pessoa.findUnique({ where: { documento: docEmit }, select: { id: true, nome: true, fornecedor: true } }) : null;
    if (forn) avisos.push(`Fornecedor ${forn.nome} cadastrado a partir da nota.`);
  } else if (!forn.fornecedor) await prisma.pessoa.update({ where: { id: forn.id }, data: { fornecedor: true } });

  const dets = (Array.isArray(inf.det) ? inf.det : [inf.det]) as { prod: Record<string, unknown> }[];
  const produtos: LinhaCompra[] = [];
  const semVinculo: string[] = [];
  for (const d of dets) {
    const p = d.prod;
    const codigo = s(p.cProd), nome = s(p.xProd), gtin = s(p.cEAN);
    // vínculo: código do fornecedor no cadastro do produto, código de barras, código ou nome
    const porCodigoForn = forn && cfg.vincularPor !== "NOME" ? await prisma.itemFornecedor.findFirst({ where: { fornecedorId: forn.id, codigo, produtoId: { not: null } }, select: { produto: true } }) : null;
    const produto = porCodigoForn?.produto
      ?? (/^\d{8,14}$/.test(gtin) ? await prisma.produto.findFirst({ where: { gtin } }) : null)
      ?? (cfg.vincularPor !== "NOME" ? await prisma.produto.findFirst({ where: { codigo } }) : null)
      ?? (cfg.vincularPor !== "CODIGO" ? await prisma.produto.findFirst({ where: { nome: { equals: nome, mode: "insensitive" } } }) : null);
    const q = num(p.qCom), vUn = num(p.vUnCom), desc = cfg.desconto ? num(p.vDesc) : 0;
    if (!produto) semVinculo.push(`${codigo} ${nome}`);
    produtos.push({
      produtoId: produto?.id ?? "", nome: produto?.nome ?? nome, codigo: produto?.codigo ?? codigo, unidade: produto?.unidade ?? s(p.uCom),
      detalhes: produto ? "" : `${codigo} ${nome} (${s(p.uCom)})`, quantidade: fmt(q, 4).replace(/,?0+$/, ""), valorUnit: fmt(vUn, 4).replace(/(,\d\d)0+$/, "$1"),
      desconto: desc ? fmt(desc) : "", descontoPct: false,
    });
  }
  if (semVinculo.length) avisos.push(`${semVinculo.length} item(ns) da nota não se ligaram a nenhum produto: escolha o produto em cada linha em branco (${semVinculo.slice(0, 5).join("; ")}${semVinculo.length > 5 ? "…" : ""}).`);

  const tot = inf.total?.ICMSTot ?? {};
  const impostos = cfg.impostos ? num(tot.vST) + num(tot.vIPI) + num(tot.vSeg) + num(tot.vII) : 0;
  const outras = cfg.outras ? num(tot.vOutro) : 0;
  const dups = inf.cobr?.dup ? (Array.isArray(inf.cobr.dup) ? inf.cobr.dup : [inf.cobr.dup]) : [];
  const chave = s(inf["@Id"]).replace(/^NFe/, "");
  return {
    dados: {
      fornecedorId: forn?.id ?? "", fornecedorNome: forn?.nome ?? s(inf.emit.xNome), data: s(inf.ide?.dhEmi || inf.ide?.dEmi).slice(0, 10),
      numeroNfe: s(inf.ide?.nNF), chaveNfe: chave, produtos,
      frete: fmt(cfg.frete ? num(tot.vFrete) : 0), freteNoTotal: true, impostos: fmt(impostos + outras), impostosNoTotal: true,
      condicao: dups.length > 1 ? "PARCELADO" : "AVISTA", numParcelas: String(Math.max(2, dups.length)),
      vencimento: dups[0] ? s(dups[0].dVenc) : s(inf.ide?.dhEmi).slice(0, 10),
      primeiraParcela: dups[0] ? s(dups[0].dVenc) : "",
      parcelas: dups.length > 1 ? dups.map((x: Record<string, unknown>) => ({ vencimento: s(x.dVenc), valor: fmt(num(x.vDup)), formaPagamentoId: "", observacao: `Duplicata ${s(x.nDup)}` })) : [],
      observacaoInterna: `Importada do XML da NF-e ${s(inf.ide?.nNF)}`,
    },
    avisos,
  };
}
