"use server";

import { revalidatePath } from "next/cache";
import { exigirUsuario } from "@/lib/auth/atual";
import { prisma } from "@/lib/db";
import { normalizar } from "@/lib/migracao/planilha";
import { favorecido } from "@/lib/financeiro/conciliacao";
import { enviarAvisoConciliacao, salvarConfigAviso } from "@/lib/financeiro/avisoConciliacao";
import type { Resultado } from "@/components/financeiro/FormAcao";
import { LOJA_ATUAL } from "@/lib/empresa/loja";

const CAMINHO = "/financeiro/conciliacao/regras";
const ok = (mensagem: string, ir?: string): Resultado => { revalidatePath(CAMINHO); revalidatePath("/financeiro/conciliacao"); return { ok: true, mensagem, ir }; };
const erro = (e: unknown): Resultado => ({ ok: false, mensagem: e instanceof Error ? e.message : String(e) });

/** Cria ou altera uma regra. Regra alterada à mão passa a ser "cadastrada" (não é mais trocada pelo aprendizado). */
export async function salvarRegraAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    const id = String(form.get("id") ?? "") || null;
    const modo = form.get("modo") === "CONTEM" ? "CONTEM" : "IGUAL";
    const bruto = String(form.get("texto") ?? "").trim();
    // favorecido igual: usa a mesma leitura do extrato ("Pix enviado - Fulano" → "fulano")
    const texto = modo === "IGUAL" ? favorecido(bruto) || normalizar(bruto) : normalizar(bruto).trim();
    if (texto.length < 3) throw new Error("Informe o nome do favorecido ou o trecho da descrição (3 letras ou mais)");
    const categoriaId = String(form.get("categoriaId") ?? "");
    const cat = await prisma.categoriaFinanceira.findUnique({ where: { id: categoriaId } });
    if (!cat) throw new Error("Escolha a categoria");
    const dados = {
      texto, modo, tipo: cat.tipo, categoriaId, centroCustoId: String(form.get("centroCustoId") ?? "") || null,
      descricao: String(form.get("descricao") ?? "").trim().slice(0, 300) || null, ativa: form.get("ativa") !== "0", origem: "MANUAL",
    };
    const outra = await prisma.regraConciliacao.findUnique({ where: { empresaId_texto_modo_tipo: { empresaId: LOJA_ATUAL, texto, modo, tipo: cat.tipo } } });
    if (outra && outra.id !== id) throw new Error(`Já existe uma regra para "${texto}". Altere aquela.`);
    if (id) await prisma.regraConciliacao.update({ where: { id }, data: dados });
    else await prisma.regraConciliacao.create({ data: dados });
    return ok(id ? "Regra salva" : "Regra cadastrada", CAMINHO);
  } catch (e) { return erro(e); }
}

export async function alternarRegraAcao(id: string) {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  const r = await prisma.regraConciliacao.findUniqueOrThrow({ where: { id } });
  await prisma.regraConciliacao.update({ where: { id }, data: { ativa: !r.ativa } });
  revalidatePath(CAMINHO);
}

export async function excluirRegraAcao(id: string) {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  await prisma.regraConciliacao.delete({ where: { id } });
  revalidatePath(CAMINHO); revalidatePath("/financeiro/conciliacao");
  return { ok: true, mensagem: "Regra excluída" };
}

export async function salvarAvisoAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    await salvarConfigAviso({ ativo: form.get("ativo") === "1", numeros: String(form.get("numeros") ?? ""), hora: Number(form.get("hora") ?? 8) });
    return ok("Aviso diário salvo");
  } catch (e) { return erro(e); }
}

export async function testarAvisoAcao(): Promise<Resultado> {
  const u = await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    const r = await enviarAvisoConciliacao({ forcar: true, usuarioNome: u.nome });
    if (r.motivo === "nada pendente") return { ok: true, mensagem: "Nada pendente na conciliação: o aviso não seria mandado hoje." };
    if (!r.enviado) return { ok: false, mensagem: r.motivo ?? "Não foi enviado" };
    return { ok: true, mensagem: `Aviso mandado para ${r.enviado} número(s).${r.erros?.length ? ` Falhou em ${r.erros.length}: ${r.erros[0]}` : ""}` };
  } catch (e) { return erro(e); }
}
