import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { PapelUsuario } from "@prisma/client";
import { COOKIE, usuarioDoToken } from "./sessao";

/** Usuário logado (páginas e ações). */
export async function usuarioAtual() {
  return usuarioDoToken((await cookies()).get(COOKIE)?.value);
}

/** Para ações sensíveis: garante login e, se pedido, um dos papéis. */
export async function exigirUsuario(papeis?: PapelUsuario[]) {
  const u = await usuarioAtual();
  if (!u) redirect("/login");
  if (papeis && !papeis.includes(u.papel)) throw new Error("Sem permissão para esta ação");
  return u;
}

/** Usado no layout de cada área restrita: confere de novo a permissão no servidor (além do middleware). */
export async function exigirArea(caminho: string) {
  const u = await usuarioAtual();
  if (!u) redirect("/login");
  const { podeAcessar, acaoDaArea } = await import("./permissoes");
  const acao = acaoDaArea(caminho);
  const acoes = acao ? await (await import("./permissoesAcao")).acoesLiberadas(u.papel, [acao as import("./permissoesAcao").ChaveAcao]) : undefined;
  if (!podeAcessar(u.papel, caminho, acoes)) redirect("/?negado=1");
  return u;
}

/** Para ações configuráveis em Usuários › Permissões (excluir, cancelar, estornar…). */
export async function exigirAcao(acao: import("./permissoesAcao").ChaveAcao) {
  const u = await exigirUsuario();
  const { pode, ACOES } = await import("./permissoesAcao");
  if (!(await pode(u.papel, acao))) throw new Error(`Sem permissão para: ${ACOES[acao].rotulo.toLowerCase()}. Fale com o administrador.`);
  return u;
}
