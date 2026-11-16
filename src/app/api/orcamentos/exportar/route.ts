import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/atual";
import { ordemOrcamentos, whereOrcamentos } from "@/lib/orcamentos/orcamentos";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const dia = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "");

/** Mais ações › Exportar: mesmas colunas da planilha de orçamentos do Gestão Click, com os filtros da lista. */
export async function GET(req: Request) {
  if (!(await usuarioAtual())) return new Response("não autorizado", { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams) as Record<string, string>;
  const l = await prisma.orcamento.findMany({
    where: await whereOrcamentos(sp), orderBy: ordemOrcamentos(sp.o),
    include: { cliente: { select: { nome: true } }, vendedor: { select: { nome: true } }, situacao: { select: { nome: true } } },
  });
  const ids = [...new Set(l.map((o) => o.criadoPorId).filter((x): x is string => !!x))];
  const nomes = new Map((await prisma.usuario.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } })).map((u) => [u.id, u.nome]));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Orçamentos");
  ws.columns = [
    { header: "Nº do orçamento", key: "numero", width: 10 }, { header: "Cliente", key: "cliente", width: 38 }, { header: "Data", key: "data", width: 11 },
    { header: "Prazo de entrega", key: "prazo", width: 11 }, { header: "Situação", key: "situacao", width: 14 }, { header: "Valor produtos", key: "prod", width: 12 },
    { header: "Valor serviços", key: "serv", width: 12 }, { header: "Valor frete", key: "frete", width: 10 }, { header: "Desconto valor", key: "desc", width: 10 },
    { header: "Total do pedido", key: "total", width: 12 }, { header: "Vendedor", key: "vendedor", width: 22 }, { header: "Canal de venda", key: "canal", width: 13 },
    { header: "Centro de custo", key: "cc", width: 16 }, { header: "Aos cuidados de", key: "aos", width: 18 }, { header: "Validade da proposta", key: "validade", width: 12 },
    { header: "Observações", key: "obs", width: 30 }, { header: "Cadastrado por", key: "por", width: 22 }, { header: "Cadastrado em", key: "em", width: 18 },
  ];
  for (const o of l) ws.addRow({
    numero: o.numero, cliente: o.cliente?.nome, data: dia(o.data), prazo: dia(o.prazoEntrega), situacao: o.situacao?.nome,
    prod: Number(o.totalProdutos), serv: Number(o.totalServicos), frete: Number(o.frete), desc: Number(o.desconto), total: Number(o.total),
    vendedor: o.vendedor?.nome, canal: o.canal, cc: o.centroCusto, aos: o.aosCuidados, validade: o.validade, obs: o.observacoes,
    por: o.criadoPorId ? nomes.get(o.criadoPorId) : "", em: o.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
  });
  ws.getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, { headers: { "Content-Type": XLSX, "Content-Disposition": `attachment; filename="orcamentos.xlsx"` } });
}
