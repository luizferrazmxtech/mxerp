"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { exigirAcao, exigirUsuario } from "@/lib/auth/atual";
import { configOs } from "./config";
import { definirOrigemItens } from "./itensTecnico";
import { localDoTecnico } from "@/lib/estoque/tecnico";
import { alterarSituacaoOrdem } from "./ordens";
import { anexarFoto, anotarTecnico, excluirFoto, lancarItemTecnico, marcarInstalado, podeMexerNaOs, removerItemTecnico } from "./tecnico";

/** Ações da tela do técnico (/tecnico). Cada uma confere login, a permissão por ação e se o usuário é técnico/equipe da OS. */

export type RespostaTecnico = { ok: boolean; mensagem: string };
const erro = (e: unknown): RespostaTecnico => ({ ok: false, mensagem: e instanceof Error ? e.message : String(e) });
const atualizar = (osId: string) => { revalidatePath(`/tecnico/${osId}`); revalidatePath("/tecnico"); revalidatePath(`/os/${osId}`); };

export async function lancarItemAcao(osId: string, item: { tipo: "produto" | "servico"; id: string; quantidade: number; detalhes?: string; instalado?: boolean; doMeuEstoque?: boolean }): Promise<RespostaTecnico> {
  const u = await exigirAcao("os.tecnicoItens");
  try {
    const r = await lancarItemTecnico(u, osId, item);
    atualizar(osId);
    if (item.tipo === "servico") return { ok: true, mensagem: "Serviço lançado na OS." };
    if (!r.alocacoes.length) return { ok: true, mensagem: "Produto lançado na OS." };
    const locais = await prisma.local.findMany({ where: { id: { in: r.alocacoes.map((a) => a.localId).filter((x): x is string => !!x) } }, select: { id: true, codigo: true } });
    const onde = r.alocacoes.map((a) => `${a.localId ? locais.find((l) => l.id === a.localId)?.codigo ?? "?" : "EM FALTA"} (${a.quantidade.toLocaleString("pt-BR")})`).join(", ");
    return { ok: true, mensagem: `Produto lançado e reservado. Pegar em: ${onde}.` };
  } catch (e) { return erro(e); }
}

/** "Saiu do meu carro": troca de onde sai a peça (carro do técnico ou loja) e refaz a reserva. */
export async function origemItemAcao(osId: string, itemId: string, doMeuCarro: boolean): Promise<RespostaTecnico> {
  const u = await exigirAcao("os.tecnicoItens");
  try {
    if (!(await podeMexerNaOs(prisma, u, osId))) throw new Error("Você não é técnico desta OS nem da equipe dela");
    const meu = await localDoTecnico(prisma, u.id);
    if (!meu) throw new Error("Você não tem estoque próprio cadastrado");
    await definirOrigemItens(osId, [{ itemId, localId: doMeuCarro ? meu : null }], u, { soDoTecnico: u.id });
    atualizar(osId);
    return { ok: true, mensagem: doMeuCarro ? "Marcado: a peça sai do seu carro." : "A peça volta a sair do estoque da loja." };
  } catch (e) { return erro(e); }
}

export async function removerItemAcao(osId: string, tipo: "produto" | "servico", itemId: string): Promise<RespostaTecnico> {
  const u = await exigirAcao("os.tecnicoItens");
  try { await removerItemTecnico(u, osId, tipo, itemId); atualizar(osId); return { ok: true, mensagem: "Item retirado da OS." }; } catch (e) { return erro(e); }
}

export async function marcarInstaladoAcao(osId: string, tipo: "produto" | "servico", itemId: string, instalado: boolean): Promise<RespostaTecnico> {
  const u = await exigirAcao("os.tecnicoItens");
  try { await marcarInstalado(u, osId, tipo, itemId, instalado); atualizar(osId); return { ok: true, mensagem: instalado ? "Marcado." : "Desmarcado." }; } catch (e) { return erro(e); }
}

export async function enviarFotoAcao(form: FormData): Promise<RespostaTecnico> {
  const u = await exigirAcao("os.tecnicoFotos");
  const osId = String(form.get("osId") ?? "");
  try {
    const f = form.get("foto");
    if (!(f instanceof File) || !f.size) throw new Error("Tire ou escolha uma foto");
    await anexarFoto(u, osId, { nome: f.name, tipo: f.type, dados: Buffer.from(await f.arrayBuffer()) }, String(form.get("itemId") ?? "") || null);
    atualizar(osId);
    return { ok: true, mensagem: "Foto anexada à OS." };
  } catch (e) { return erro(e); }
}

export async function excluirFotoAcao(osId: string, anexoId: string): Promise<RespostaTecnico> {
  const u = await exigirAcao("os.tecnicoFotos");
  try { await excluirFoto(u, osId, anexoId); atualizar(osId); return { ok: true, mensagem: "Foto apagada." }; } catch (e) { return erro(e); }
}

export async function anotarAcao(osId: string, texto: string): Promise<RespostaTecnico> {
  const u = await exigirUsuario();
  try { await anotarTecnico(u, osId, texto); atualizar(osId); return { ok: true, mensagem: "Anotação salva." }; } catch (e) { return erro(e); }
}

/** Troca de situação pela tela do técnico: mesma regra da OS (permissão "os.situacao" e grupos bloqueados) e só nas OS dele. */
export async function situacaoTecnicoAcao(osId: string, situacaoId: string): Promise<RespostaTecnico> {
  const u = await exigirAcao("os.situacao");
  try {
    if (!(await podeMexerNaOs(prisma, u, osId))) throw new Error("Você não é técnico desta OS nem da equipe dela");
    const r = await alterarSituacaoOrdem(osId, situacaoId, u, { permitirNegativo: (await configOs()).estoqueNegativo });
    atualizar(osId);
    return { ok: true, mensagem: `Situação: ${r.para.nome}.` };
  } catch (e) { return erro(e); }
}
