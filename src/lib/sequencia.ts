import type { Tx } from "@/lib/db";
import { empresaPrincipalId, lojaAtualId, todasAsLojas } from "@/lib/empresa/loja";

/** Próximo número de um contador (OS, VENDA, COMPRA, NFE-1...). Atômico. */
export async function proximoNumero(tx: Tx, chave: string): Promise<number> {
  const [r] = await tx.$queryRaw<{ valor: number }[]>`
    INSERT INTO "Sequencia" (chave, valor) VALUES (${chave}, 1)
    ON CONFLICT (chave) DO UPDATE SET valor = "Sequencia".valor + 1
    RETURNING valor`;
  return r.valor;
}

/** Sobe o contador até `valor` (nunca desce). */
export async function subirSequencia(tx: Pick<Tx, "$executeRaw">, chave: string, valor: number) {
  await tx.$executeRaw`INSERT INTO "Sequencia" (chave, valor) VALUES (${chave}, ${valor}) ON CONFLICT (chave) DO UPDATE SET valor = GREATEST("Sequencia".valor, ${valor})`;
}

/** Empresa da numeração: a informada (null = sem empresa) ou, sem informar, a loja atual. */
async function empresaDaNumeracao(empresaId?: string | null) {
  const emp = empresaId !== undefined ? empresaId : await lojaAtualId();
  const principal = await empresaPrincipalId();
  return { emp: emp && emp !== principal ? emp : null, principal };
}

/**
 * Chave do contador de um documento (VENDA, OS, ORCAMENTO, COMPRA…) na empresa: a principal usa a chave pura
 * (a numeração de sempre); as outras, "VENDA#emp:<id>". Cada empresa tem a sua sequência.
 */
export async function chaveDoc(chave: string, empresaId?: string | null): Promise<string> {
  const { emp } = await empresaDaNumeracao(empresaId);
  return emp ? `${chave}#emp:${emp}` : chave;
}

/** Próximo número do documento na empresa (a loja atual, se não informar). */
export async function proximoDoc(tx: Tx, chave: string, empresaId?: string | null): Promise<number> {
  return proximoNumero(tx, await chaveDoc(chave, empresaId));
}

/** Filtro dos documentos que dividem a numeração: na principal entram também os sem empresa. */
export async function escopoNumeracao(empresaId?: string | null) {
  const { emp, principal } = await empresaDaNumeracao(empresaId);
  if (emp) return { empresaId: emp };
  return principal ? { OR: [{ empresaId: null }, { empresaId: principal }] } : { empresaId: null };
}

type ComNumero = { findFirst(a: { where: object; select: { id: true } }): Promise<{ id: string } | null> };

/** Já existe o documento com esse número na empresa? */
export async function numeroEmUso(tabela: ComNumero, numero: number, empresaId?: string | null, excetoId?: string) {
  const escopo = await escopoNumeracao(empresaId);
  const where = { AND: [{ numero }, escopo, ...(excetoId ? [{ id: { not: excetoId } }] : [])] };
  return !!(await todasAsLojas(() => tabela.findFirst({ where, select: { id: true } })));
}

/** Próximo número livre do documento na empresa (pula os já usados, ex.: digitados à mão ou importados). */
export async function proximoDocLivre(tx: Tx, tabela: ComNumero, chave: string, empresaId?: string | null): Promise<number> {
  const k = await chaveDoc(chave, empresaId);
  let n: number;
  do n = await proximoNumero(tx, k); while (await numeroEmUso(tabela, n, empresaId));
  return n;
}
