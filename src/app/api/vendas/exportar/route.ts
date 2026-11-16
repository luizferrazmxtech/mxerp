import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/atual";
import { ordemVendas, whereVendas } from "@/lib/vendas/pedidos";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const dia = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "");

/** Mais ações › Exportar: mesmas colunas da planilha de vendas do Gestão Click, com os filtros da lista. */
export async function GET(req: Request) {
  if (!(await usuarioAtual())) return new Response("não autorizado", { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams) as Record<string, string>;
  const tipo = sp.tipo === "SERVICO" ? "SERVICO" : sp.tipo === "BALCAO" ? "BALCAO" : "PEDIDO";
  const l = await prisma.venda.findMany({
    where: await whereVendas(tipo, sp), orderBy: ordemVendas(sp.o),
    include: { cliente: { select: { nome: true } }, vendedor: { select: { nome: true } }, situacaoCfg: { select: { nome: true } } },
  });
  const ids = [...new Set(l.map((v) => v.criadoPorId).filter((x): x is string => !!x))];
  const nomes = new Map((await prisma.usuario.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } })).map((u) => [u.id, u.nome]));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Vendas");
  ws.columns = [
    { header: "Nº da venda", key: "numero", width: 10 }, { header: "Cliente", key: "cliente", width: 38 }, { header: "Data", key: "data", width: 11 },
    { header: "Prazo de entrega", key: "prazo", width: 11 }, { header: "Situação", key: "situacao", width: 16 }, { header: "Valor produtos", key: "prod", width: 12 },
    { header: "Valor serviços", key: "serv", width: 12 }, { header: "Valor frete", key: "frete", width: 10 }, { header: "Desconto valor", key: "desc", width: 10 },
    { header: "Total da venda", key: "total", width: 12 }, { header: "Vendedor", key: "vendedor", width: 22 }, { header: "Canal de venda", key: "canal", width: 13 },
    { header: "Centro de custo", key: "cc", width: 16 }, { header: "Observações", key: "obs", width: 30 }, { header: "Observações internas", key: "obsi", width: 30 },
    { header: "Cadastrado por", key: "por", width: 22 }, { header: "Cadastrado em", key: "em", width: 18 },
  ];
  for (const v of l) ws.addRow({
    numero: v.numero, cliente: v.cliente?.nome ?? "Consumidor final", data: dia(v.data), prazo: dia(v.prazoEntrega), situacao: v.situacaoCfg?.nome,
    prod: Number(v.totalProdutos), serv: Number(v.totalServicos), frete: Number(v.frete), desc: Number(v.desconto), total: Number(v.total),
    vendedor: v.vendedor?.nome, canal: v.canal, cc: v.centroCusto, obs: v.observacoes, obsi: v.observacaoInterna,
    por: v.criadoPorId ? nomes.get(v.criadoPorId) : "", em: v.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
  });
  ws.getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, { headers: { "Content-Type": XLSX, "Content-Disposition": `attachment; filename="vendas.xlsx"` } });
}
