import { curvaAbc, duracao, relatorioComissoes, relatorioLucro, tempoOs, type AgruparLucro, type CriterioAbc } from "@/lib/relatorios/relatorios";
import { periodoRelatorio } from "@/lib/relatorios/periodo";

/** Exporta o relatório em CSV (separador ";" e vírgula decimal, abre direto no Excel). */
const n = (v: number) => v.toFixed(2).replace(".", ",");
const esc = (v: unknown) => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const dia = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

export async function GET(req: Request, { params }: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await params;
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const per = periodoRelatorio(sp);
  let linhas: unknown[][] = [];
  if (tipo === "lucro") {
    const r = await relatorioLucro(per, (sp.por as AgruparLucro) || "documento", { vendedorId: sp.vendedor || undefined });
    linhas = [["Item", "Detalhe", "Documentos", "Quantidade", "Receita", "Custo", "Lucro", "Margem %"], ...r.linhas.map((l) => [l.rotulo, l.detalhe, l.documentos, n(l.quantidade), n(l.receita), n(l.custo), n(l.lucro), n(l.margem * 100)])];
  } else if (tipo === "curva-abc") {
    const r = await curvaAbc(per, sp.por === "clientes" ? "clientes" : sp.por === "servicos" ? "servicos" : "produtos", (sp.criterio as CriterioAbc) || "valor", { vendedorId: sp.vendedor || undefined });
    linhas = [["Item", "Código", "Quantidade", "Faturamento", "Lucro", "% do total", "Acumulado %", "Classe"], ...r.linhas.map((l) => [l.rotulo, l.detalhe, n(l.quantidade), n(l.valor), n(l.lucro), n(l.pct * 100), n(l.acumulado * 100), l.classe])];
  } else if (tipo === "comissoes") {
    const r = await relatorioComissoes(per, sp.vendedor || undefined);
    linhas = [["Funcionário", "Documento", "Data", "Cliente", "Base", "%", "Comissão", "Recebido", "A receber total", "Liberada"], ...r.flatMap((f) => f.linhas.map((l) => [f.nome, `${l.origem === "OS" ? "OS" : "Venda"} ${l.numero}`, dia(l.data), l.cliente, n(l.base), n(l.percentual), n(l.comissao), n(l.recebido), n(l.totalReceber), n(l.liberada)]))];
  } else if (tipo === "tempo-os") {
    const r = await tempoOs(per);
    linhas = [["OS", "Cliente", "Técnico", "Entrada", "Saída", "Horas", "Tempo", "Atrasou"], ...r.linhas.map((l) => [l.numero, l.cliente, l.tecnico, dia(l.entrada), dia(l.saida), n(l.horas), duracao(l.horas), l.atrasada ? "sim" : "não"])];
  } else return new Response("relatório desconhecido", { status: 404 });
  const csv = "﻿" + linhas.map((l) => l.map(esc).join(";")).join("\r\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${tipo}.csv"` } });
}
