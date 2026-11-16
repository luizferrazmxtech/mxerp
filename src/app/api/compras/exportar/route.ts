import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/atual";
import { ordemCompras, whereCompras } from "@/lib/compras/compras";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const dia = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "");

/** Mais ações › Exportar: mesmas colunas da planilha de compras do Gestão Click, com os filtros da lista. */
export async function GET(req: Request) {
  if (!(await usuarioAtual())) return new Response("não autorizado", { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams) as Record<string, string>;
  const tipo = sp.tipo === "SERVICO" ? "SERVICO" : "PRODUTO";
  const l = await prisma.compra.findMany({
    where: whereCompras(tipo, sp), orderBy: ordemCompras(sp.o),
    include: { fornecedor: { select: { nome: true } }, transportadora: { select: { nome: true } }, situacaoCfg: { select: { nome: true } } },
  });
  const ids = [...new Set(l.map((v) => v.criadoPorId).filter((x): x is string => !!x))];
  const nomes = new Map((await prisma.usuario.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } })).map((u) => [u.id, u.nome]));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Compras");
  ws.columns = [
    { header: "Nº da compra", key: "numero", width: 10 }, { header: "Número da NF-e", key: "nfe", width: 12 }, { header: "Chave NF-e", key: "chave", width: 46 },
    { header: "Fornecedor", key: "forn", width: 38 }, { header: "Situação", key: "sit", width: 14 }, { header: "Total dos produtos", key: "prod", width: 12 },
    { header: "Total dos serviços", key: "serv", width: 12 }, { header: "Valor frete", key: "frete", width: 10 }, { header: "Impostos", key: "imp", width: 10 },
    { header: "Desconto valor", key: "desc", width: 10 }, { header: "Total da compra", key: "total", width: 12 }, { header: "Data de emissão", key: "data", width: 11 },
    { header: "Transportadora", key: "transp", width: 22 }, { header: "Centro de custo", key: "cc", width: 16 }, { header: "Observações", key: "obs", width: 30 },
    { header: "Cadastrado por", key: "por", width: 22 }, { header: "Cadastrado em", key: "em", width: 18 },
  ];
  for (const c of l) ws.addRow({
    numero: c.numero, nfe: c.numeroNfe, chave: c.chaveNfe, forn: c.fornecedor.nome, sit: c.situacaoCfg?.nome, prod: Number(c.totalProdutos), serv: Number(c.totalServicos),
    frete: Number(c.frete), imp: Number(c.impostos), desc: Number(c.desconto), total: Number(c.total), data: dia(c.data), transp: c.transportadora?.nome, cc: c.centroCusto,
    obs: c.observacoes, por: c.criadoPorId ? nomes.get(c.criadoPorId) : "", em: c.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
  });
  ws.getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, { headers: { "Content-Type": XLSX, "Content-Disposition": `attachment; filename="compras.xlsx"` } });
}
