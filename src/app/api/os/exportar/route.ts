import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/atual";
import { ordemOrdens, whereOrdens } from "@/lib/os/ordens";
import { rotuloPrioridade } from "@/lib/os/tipos";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const quando = (d: Date | null) => (d ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");

/** Mais ações › Exportar: as OS da lista (com os filtros), uma por linha. */
export async function GET(req: Request) {
  if (!(await usuarioAtual())) return new Response("não autorizado", { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams) as Record<string, string>;
  const l = await prisma.ordemServico.findMany({
    where: whereOrdens(sp), orderBy: ordemOrdens(sp.o),
    include: { cliente: { select: { nome: true } }, vendedor: { select: { nome: true } }, tecnico: { select: { nome: true } }, situacaoCfg: { select: { nome: true } }, equipamentos: { select: { equipamento: true, marca: true, modelo: true, serie: true } } },
  });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Ordens de serviços");
  ws.columns = [
    { header: "Nº da OS", key: "numero", width: 9 }, { header: "Cliente", key: "cliente", width: 38 }, { header: "Entrada", key: "entrada", width: 18 },
    { header: "Saída", key: "saida", width: 18 }, { header: "Situação", key: "situacao", width: 20 }, { header: "Prioridade", key: "prioridade", width: 12 },
    { header: "Equipamentos", key: "equip", width: 40 }, { header: "Valor peças", key: "prod", width: 12 }, { header: "Valor serviços", key: "serv", width: 12 },
    { header: "Frete", key: "frete", width: 10 }, { header: "Outros", key: "outros", width: 10 }, { header: "Desconto", key: "desc", width: 10 }, { header: "Total", key: "total", width: 12 },
    { header: "Vendedor", key: "vendedor", width: 22 }, { header: "Técnico", key: "tecnico", width: 22 }, { header: "Canal de venda", key: "canal", width: 13 },
    { header: "Centro de custo", key: "cc", width: 16 }, { header: "Observações", key: "obs", width: 30 },
  ];
  for (const o of l) ws.addRow({
    numero: o.numero, cliente: o.cliente.nome, entrada: quando(o.entrada), saida: quando(o.saida), situacao: o.situacaoCfg?.nome ?? o.situacao, prioridade: rotuloPrioridade(o.prioridade),
    equip: o.equipamentos.map((e) => [e.equipamento, e.marca, e.modelo, e.serie].filter(Boolean).join(" ")).join("; "),
    prod: Number(o.totalProdutos), serv: Number(o.totalServicos), frete: Number(o.frete), outros: Number(o.outros), desc: Number(o.desconto), total: Number(o.total),
    vendedor: o.vendedor?.nome, tecnico: o.tecnico?.nome, canal: o.canal, cc: o.centroCusto, obs: o.observacoes,
  });
  ws.getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, { headers: { "Content-Type": XLSX, "Content-Disposition": `attachment; filename="ordens-de-servico.xlsx"` } });
}
