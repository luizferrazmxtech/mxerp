import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/atual";
import { ordemProdutos, ordemServicos, whereProdutos, whereServicos } from "@/lib/itens/filtros";
import { estoquesDe } from "@/lib/itens/produtos";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Mais ações › Exportar cadastros (produtos ou serviços), respeitando os filtros da lista. */
export async function GET(req: Request) {
  if (!(await usuarioAtual())) return new Response("não autorizado", { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams) as Record<string, string>;
  const wb = new ExcelJS.Workbook();
  if (sp.tipo === "servicos") {
    const l = await prisma.servico.findMany({ where: await whereServicos(sp), orderBy: ordemServicos(sp.o) });
    const ws = wb.addWorksheet("Serviços");
    ws.columns = [
      { header: "Código", key: "codigo", width: 10 }, { header: "Nome", key: "nome", width: 45 }, { header: "Valor de custo", key: "custo", width: 14 },
      { header: "Valor de venda", key: "preco", width: 14 }, { header: "Código LC 116", key: "lc", width: 12 }, { header: "Código de tributação nacional", key: "ctrib", width: 16 },
      { header: "NBS", key: "nbs", width: 12 }, { header: "Alíquota ISS", key: "iss", width: 10 }, { header: "Ativo", key: "ativo", width: 7 },
    ];
    for (const s of l) ws.addRow({ codigo: s.codigo, nome: s.nome, custo: Number(s.custo), preco: Number(s.preco), lc: s.codigoLc116, ctrib: s.codigoTributacaoNacional, nbs: s.codigoNbs, iss: s.aliquotaIss != null ? Number(s.aliquotaIss) : null, ativo: s.ativo ? "Sim" : "Não" });
  } else {
    const l = await prisma.produto.findMany({ where: await whereProdutos(sp), orderBy: ordemProdutos(sp.o), include: { grupo: { select: { nome: true } } } });
    const est = await estoquesDe(l.map((p) => p.id));
    const ws = wb.addWorksheet("Produtos");
    ws.columns = [
      { header: "Código", key: "codigo", width: 12 }, { header: "Nome", key: "nome", width: 45 }, { header: "Código de barras", key: "gtin", width: 16 },
      { header: "Unidade", key: "unidade", width: 8 }, { header: "Grupo", key: "grupo", width: 18 }, { header: "Valor de custo", key: "custo", width: 13 },
      { header: "Valor de venda", key: "preco", width: 13 }, { header: "Estoque", key: "estoque", width: 10 }, { header: "Estoque mínimo", key: "min", width: 10 },
      { header: "NCM", key: "ncm", width: 10 }, { header: "CEST", key: "cest", width: 9 }, { header: "Origem", key: "origem", width: 7 }, { header: "Situação", key: "ativo", width: 9 },
      { header: "Cadastrado em", key: "cadastrado", width: 18 },
    ];
    for (const p of l) ws.addRow({
      codigo: p.codigo, nome: p.nome, gtin: p.gtin, unidade: p.unidade, grupo: p.grupo?.nome, custo: Number(p.custo), preco: Number(p.precoVenda),
      estoque: p.controlaEstoque ? est.get(p.id)?.fisico ?? 0 : null, min: Number(p.estoqueMinimo), ncm: p.ncm, cest: p.cest, origem: p.origem,
      ativo: p.ativo ? "Ativo" : "Inativo", cadastrado: p.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    });
  }
  wb.worksheets[0].getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  const nome = sp.tipo === "servicos" ? "servicos" : "produtos";
  return new Response(buf as ArrayBuffer, { headers: { "Content-Type": XLSX, "Content-Disposition": `attachment; filename="${nome}.xlsx"` } });
}
