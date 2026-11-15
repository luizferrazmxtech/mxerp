"use server";

import { lerPlanilha } from "@/lib/migracao/planilha";
import { importarPessoas, importarProdutos, importarServicos, type Resultado, type Tipo } from "@/lib/migracao/importar";

export type EstadoMigracao = { ok: boolean; mensagem: string; resultado?: Resultado; colunas?: string[] } | null;

export async function importar(_: EstadoMigracao, form: FormData): Promise<EstadoMigracao> {
  const arquivo = form.get("arquivo");
  const tipo = String(form.get("tipo")) as Tipo;
  const simular = form.get("modo") !== "gravar";
  if (!(arquivo instanceof File) || arquivo.size === 0) return { ok: false, mensagem: "Escolha um arquivo .xlsx ou .csv" };
  try {
    const { cabecalhos, linhas } = await lerPlanilha(arquivo.name, Buffer.from(await arquivo.arrayBuffer()));
    const resultado =
      tipo === "clientes" || tipo === "fornecedores" ? await importarPessoas(linhas, tipo === "clientes" ? "cliente" : "fornecedor", simular)
      : tipo === "produtos" ? await importarProdutos(linhas, { simular, importarEstoque: form.get("estoque") === "on" })
      : await importarServicos(linhas, simular);
    return { ok: true, mensagem: simular ? "Simulação concluída, nada foi gravado" : "Importação concluída", resultado, colunas: cabecalhos };
  } catch (e) {
    return { ok: false, mensagem: e instanceof Error ? e.message : String(e) };
  }
}
