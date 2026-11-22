import ExcelJS from "exceljs";
import { curvaAbc, duracao, relatorioComissoes, relatorioLucro, tempoOs, type AgruparLucro, type CriterioAbc } from "@/lib/relatorios/relatorios";
import { periodoRelatorio } from "@/lib/relatorios/periodo";

/**
 * Exporta o relatório em Excel (?formato=xlsx, números de verdade, cabeçalho em negrito) ou em CSV
 * (separador ";" e vírgula decimal, abre direto no Excel).
 */
const n = (v: number) => v.toFixed(2).replace(".", ",");
const esc = (v: unknown) => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const dia = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const r2 = (v: number) => Math.round(v * 100) / 100;
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const TITULOS: Record<string, string> = { lucro: "Lucro", "curva-abc": "Curva ABC", comissoes: "Comissões", "tempo-os": "Tempo das OS" };

type Celula = string | number | null | undefined;

export async function GET(req: Request, { params }: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await params;
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const per = periodoRelatorio(sp);
  const vendedorId = sp.vendedor || undefined;
  let cab: string[] = [];
  let linhas: Celula[][] = [];
  if (tipo === "lucro") {
    const r = await relatorioLucro(per, (sp.por as AgruparLucro) || "documento", { vendedorId });
    cab = ["Item", "Detalhe", "Documentos", "Quantidade", "Receita", "Custo", "Lucro", "Margem %"];
    linhas = r.linhas.map((l) => [l.rotulo, l.detalhe, l.documentos, l.quantidade, l.receita, l.custo, l.lucro, r2(l.margem * 100)]);
  } else if (tipo === "curva-abc") {
    const r = await curvaAbc(per, sp.por === "clientes" ? "clientes" : sp.por === "servicos" ? "servicos" : "produtos", (sp.criterio as CriterioAbc) || "valor", { vendedorId });
    cab = ["Item", "Código", "Quantidade", "Faturamento", "Lucro", "% do total", "Acumulado %", "Classe"];
    linhas = r.linhas.filter((l) => !sp.classe || l.classe === sp.classe).map((l) => [l.rotulo, l.detalhe, l.quantidade, l.valor, l.lucro, r2(l.pct * 100), r2(l.acumulado * 100), l.classe]);
  } else if (tipo === "comissoes") {
    const r = await relatorioComissoes(per, vendedorId);
    cab = ["Funcionário", "Documento", "Data", "Cliente", "Base", "%", "Comissão", "Recebido", "A receber total", "Liberada"];
    linhas = r.flatMap((f) => f.linhas.map((l) => [f.nome, `${l.origem === "OS" ? "OS" : "Venda"} ${l.numero}`, dia(l.data), l.cliente, l.base, l.percentual, l.comissao, l.recebido, l.totalReceber, l.liberada]));
  } else if (tipo === "tempo-os") {
    const r = await tempoOs(per);
    cab = ["OS", "Cliente", "Técnico", "Entrada", "Saída", "Horas", "Tempo", "Atrasou"];
    linhas = r.linhas.map((l) => [l.numero, l.cliente, l.tecnico, dia(l.entrada), dia(l.saida), r2(l.horas), duracao(l.horas), l.atrasada ? "sim" : "não"]);
  } else return new Response("relatório desconhecido", { status: 404 });

  if (sp.formato === "xlsx") {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(TITULOS[tipo] ?? tipo);
    ws.addRow([`${TITULOS[tipo] ?? tipo} · ${per.rotulo}`]).font = { bold: true, size: 13 };
    ws.addRow([]);
    ws.addRow(cab).font = { bold: true };
    for (const l of linhas) ws.addRow(l.map((c) => c ?? ""));
    ws.columns.forEach((c, i) => {
      c.width = Math.min(45, Math.max(10, cab[i]?.length ?? 10, ...linhas.slice(0, 200).map((l) => String(l[i] ?? "").length + 2)));
      if (linhas.some((l) => typeof l[i] === "number" && !Number.isInteger(l[i]))) c.numFmt = "#,##0.00";
    });
    ws.views = [{ state: "frozen", ySplit: 3 }];
    const buf = await wb.xlsx.writeBuffer();
    return new Response(buf as ArrayBuffer, { headers: { "Content-Type": XLSX, "Content-Disposition": `attachment; filename="${tipo}.xlsx"` } });
  }
  const csv = "﻿" + [cab, ...linhas].map((l) => l.map((c) => (typeof c === "number" ? (Number.isInteger(c) ? String(c) : n(c)) : esc(c))).join(";")).join("\r\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${tipo}.csv"` } });
}
