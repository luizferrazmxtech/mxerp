"use server";

import { exigirUsuario } from "@/lib/auth/atual";
import { lerPlanilha } from "@/lib/migracao/planilha";
import { importarBackupGestaoClick, ligarNotasDoGestaoClick, lerBackupGestaoClick } from "@/lib/migracao/gestaoclick";
import { registrarAuditoria, semAuditoria } from "@/lib/auditoria/registro";
import { ligarContasPelaDescricao } from "@/lib/financeiro/origem";
import { importarPessoas, importarProdutos, importarServicos, type Resultado, type Tipo } from "@/lib/migracao/importar";

export type EstadoMigracao = { ok: boolean; mensagem: string; resultado?: Resultado; colunas?: string[] } | null;

export async function importar(_: EstadoMigracao, form: FormData): Promise<EstadoMigracao> {
  const u = await exigirUsuario(["ADMIN"]);
  const arquivo = form.get("arquivo");
  const tipo = String(form.get("tipo")) as Tipo;
  const simular = form.get("modo") !== "gravar";
  if (!(arquivo instanceof File) || arquivo.size === 0) return { ok: false, mensagem: "Escolha um arquivo .xlsx ou .csv" };
  try {
    const { cabecalhos, linhas } = await lerPlanilha(arquivo.name, Buffer.from(await arquivo.arrayBuffer()));
    // importação em massa não grava um registro de auditoria por linha: só o resumo
    const resultado = await semAuditoria(() =>
      tipo === "clientes" || tipo === "fornecedores" ? importarPessoas(linhas, tipo === "clientes" ? "cliente" : "fornecedor", simular)
      : tipo === "produtos" ? importarProdutos(linhas, { simular, importarEstoque: form.get("estoque") === "on" })
      : importarServicos(linhas, simular));
    if (!simular) await registrarAuditoria(u, { entidade: "Migracao", acao: "CRIAR", descricao: `Importou planilha de ${tipo}: ${resultado.criados} novos, ${resultado.atualizados} atualizados` });
    return { ok: true, mensagem: simular ? "Simulação concluída, nada foi gravado" : "Importação concluída", resultado, colunas: cabecalhos };
  } catch (e) {
    return { ok: false, mensagem: e instanceof Error ? e.message : String(e) };
  }
}

export type EstadoBackup = { ok: boolean; mensagem: string; resultados?: Resultado[] } | null;

export async function importarBackup(_: EstadoBackup, form: FormData): Promise<EstadoBackup> {
  const u = await exigirUsuario(["ADMIN"]);
  const arquivo = form.get("arquivo");
  const simular = form.get("modo") !== "gravar";
  if (!(arquivo instanceof File) || arquivo.size === 0) return { ok: false, mensagem: "Escolha o arquivo .zip do backup" };
  const on = (k: string) => form.get(k) === "on";
  try {
    const tabelas = await lerBackupGestaoClick(Buffer.from(await arquivo.arrayBuffer()));
    const destino = String(form.get("destino") || "");
    const resultados = await semAuditoria(() => importarBackupGestaoClick(tabelas, {
      simular,
      destino: destino ? { empresaId: destino } : undefined,
      etapas: { cadastros: on("cadastros"), estoque: on("estoque"), os: on("os"), orcamentos: on("orcamentos"), vendas: on("vendas"), compras: on("compras"), receber: on("receber"), pagar: on("pagar"), pagarVencidas: on("pagarVencidas"), historico: on("historico"), pagas: on("pagas"), notas: on("notas"), contratos: on("contratos"), completarContas: on("completarContas") },
    }));
    if (!simular) await registrarAuditoria(u, { entidade: "Migracao", acao: "CRIAR", descricao: `Importou o backup do Gestão Click: ${resultados.map((r) => `${r.tipo} ${r.criados}`).join(", ")}` });
    return { ok: true, mensagem: simular ? "Simulação concluída, nada foi gravado" : "Backup importado", resultados };
  } catch (e) {
    return { ok: false, mensagem: e instanceof Error ? e.message : String(e) };
  }
}

/** Liga às vendas/OS as notas do Gestão Click que ficaram sem origem (só com o que já está no ERP). */
export async function ligarNotasAcao(_: { ok: boolean; mensagem: string } | null, form: FormData): Promise<{ ok: boolean; mensagem: string }> {
  const u = await exigirUsuario(["ADMIN"]);
  const simular = form.get("modo") !== "gravar";
  try {
    // primeiro as contas (vínculo exato pelo nº da descrição), depois as notas
    const c = await semAuditoria(() => ligarContasPelaDescricao(simular));
    const r = await semAuditoria(() => ligarNotasDoGestaoClick(simular));
    if (!simular && (r.ligadas || c.ligadas)) await registrarAuditoria(u, { entidade: "Migracao", acao: "EDITAR", descricao: `Ligou ${c.ligadas} contas e ${r.ligadas} notas do Gestão Click às vendas/OS` });
    const v = simular ? "podem ser ligadas" : "foram ligadas";
    return { ok: true, mensagem: `Contas: ${c.soltas} sem venda/OS/compra, ${c.ligadas} ${v} pelo número da descrição${c.numeradas ? ` (${c.numeradas} ${simular ? "vão ganhar" : "ganharam"} o número da parcela)` : ""}. Notas: ${r.semOrigem} sem venda/OS, ${r.ligadas} ${v}.${simular ? " Simulação: nada foi gravado." : ""}` };
  } catch (e) {
    return { ok: false, mensagem: e instanceof Error ? e.message : String(e) };
  }
}
