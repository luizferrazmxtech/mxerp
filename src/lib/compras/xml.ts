import { XMLParser } from "fast-xml-parser";
import { prisma } from "@/lib/db";
import { pessoaDoXml } from "@/lib/cadastros/importacao";
import { importarPessoas } from "@/lib/migracao/importar";
import { configEstoque } from "@/lib/estoque/config";
import { fatorPeloNome, mesmaUnidade, textoConversao } from "@/lib/itens/unidades";
import { CST_COM_ST, type DadosCompra, type ItemNota, type LinhaCompra } from "./tipos";
import { produtosParecidos } from "./sugestoes";

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

  const dets = (Array.isArray(inf.det) ? inf.det : [inf.det]) as { prod: Record<string, unknown>; imposto?: Record<string, unknown> }[];
  const produtos: LinhaCompra[] = [];
  const semVinculo: string[] = [];
  const convertidos: string[] = [];
  const conferir: string[] = [];
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
    const uCom = s(p.uCom).trim().toUpperCase();
    const nota = itemNota(d, s, num);
    if (!produto) semVinculo.push(`${codigo} ${nome}`);
    // conversão: a nota vem na unidade do fornecedor (CX, RL) e o produto é vendido em outra (MT)
    let conv: Pick<LinhaCompra, "unidadeCompra" | "fator" | "salvarConversao"> = produto ? {} : { unidadeCompra: uCom, fator: "" };
    if (produto && uCom && !mesmaUnidade(uCom, produto.unidade)) {
      const fp = Number(produto.fatorConversao);
      if (produto.unidadeCompra && fp > 0) {
        conv = { unidadeCompra: uCom, fator: String(fp).replace(".", ",") };
        convertidos.push(`${produto.nome}: ${fmt(q, 4).replace(/,?0+$/, "")} ${uCom} = ${(q * fp).toLocaleString("pt-BR", { maximumFractionDigits: 4 })} ${produto.unidade}`);
      } else {
        const palpite = fatorPeloNome(`${nome} ${produto.nome}`, produto.unidade);
        conv = { unidadeCompra: uCom, fator: palpite ? String(palpite) : "1", salvarConversao: true };
        conferir.push(palpite ? `${produto.nome} (${textoConversao(uCom, palpite, produto.unidade)}, pelo nome)` : `${produto.nome} (nota em ${uCom}, produto em ${produto.unidade})`);
      }
    }
    produtos.push({
      produtoId: produto?.id ?? "", nome: produto?.nome ?? nome, codigo: produto?.codigo ?? codigo, unidade: produto?.unidade ?? uCom,
      detalhes: produto ? "" : `${codigo} ${nome} (${uCom})`, quantidade: fmt(q, 4).replace(/,?0+$/, ""), valorUnit: fmt(vUn, 4).replace(/(,\d\d)0+$/, "$1"),
      desconto: desc ? fmt(desc) : "", descontoPct: false, codigoFornecedor: codigo, ...conv,
      conversaoProduto: produto?.unidadeCompra ? { unidade: produto.unidadeCompra, fator: Number(produto.fatorConversao) } : null,
      nota, ...(produto ? {} : { sugestoes: await produtosParecidos(nome, nota.ncm) }),
    });
  }
  if (convertidos.length) avisos.push(`Conversão de unidade aplicada pelo cadastro: ${convertidos.join("; ")}.`);
  if (conferir.length) avisos.push(`Confira a conversão destes itens (a nota vem numa unidade e o produto é vendido em outra). Ao salvar, ela fica gravada no produto: ${conferir.join("; ")}.`);
  if (semVinculo.length) avisos.push(`${semVinculo.length} item(ns) da nota não se ligaram a nenhum produto: em cada linha em branco, escolha um dos produtos parecidos, busque outro ou cadastre o produto com os dados da nota (${semVinculo.slice(0, 5).join("; ")}${semVinculo.length > 5 ? "…" : ""}).`);

  const tot = inf.total?.ICMSTot ?? {};
  const impostos = cfg.impostos ? num(tot.vST) + num(tot.vIPI) + num(tot.vSeg) + num(tot.vII) : 0;
  const outras = cfg.outras ? num(tot.vOutro) : 0;
  const dups = inf.cobr?.dup ? (Array.isArray(inf.cobr.dup) ? inf.cobr.dup : [inf.cobr.dup]) : [];
  const chave = s(inf["@Id"]).replace(/^NFe/, "");
  const ja = chave ? await prisma.compra.findFirst({ where: { chaveNfe: chave }, select: { numero: true } }) : null;
  if (ja) avisos.unshift(`Atenção: esta NF-e já foi lançada na compra nº ${ja.numero}. Salvar de novo duplica o estoque e as contas.`);
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

/** Dados do item da nota: descrição, códigos, NCM/CEST/CFOP, origem e CST/CSOSN do ICMS, ICMS-ST e IPI. */
function itemNota(d: { prod: Record<string, unknown>; imposto?: Record<string, unknown> }, s: (v: unknown) => string, num: (v: unknown) => number): ItemNota {
  const p = d.prod;
  const grupoIcms = (d.imposto?.ICMS ?? {}) as Record<string, Record<string, unknown>>;
  const icms = Object.values(grupoIcms)[0] ?? {};
  const ipi = ((d.imposto?.IPI as Record<string, unknown> | undefined)?.IPITrib ?? {}) as Record<string, unknown>;
  const cst = s(icms.CST || icms.CSOSN);
  const vSt = num(icms.vICMSST);
  const gtin = s(p.cEAN);
  return {
    codigo: s(p.cProd), nome: s(p.xProd), ean: /^\d{8,14}$/.test(gtin) ? gtin : "", unidade: s(p.uCom).trim().toUpperCase(),
    quantidade: num(p.qCom), valorUnit: num(p.vUnCom), ncm: s(p.NCM).replace(/\D/g, ""), cest: s(p.CEST).replace(/\D/g, ""), cfop: s(p.CFOP),
    origem: s(icms.orig), cst, vIcms: num(icms.vICMS), pIcms: num(icms.pICMS), vSt, vIpi: num(ipi.vIPI), pIpi: num(ipi.pIPI),
    st: vSt > 0 || CST_COM_ST.includes(cst) || num(icms.vICMSSTRet) > 0 || /^[56]4\d\d$/.test(s(p.CFOP)),
  };
}
