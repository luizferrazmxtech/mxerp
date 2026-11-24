import { prisma } from "@/lib/db";

type TipoDoc = "VENDA" | "OS" | "COMPRA";
const PREFIXO: Record<TipoDoc, string> = { VENDA: "venda", OS: "os", COMPRA: "compra" };

/**
 * Documento citado na descrição da conta, como o Gestão Click escreve: "Venda de nº 8558",
 * "Ordem de serviço de nº 6946", "Compra de nº 934 (FORNECEDOR)".
 */
export function documentoDaDescricao(descricao: string | null | undefined): { tipo: TipoDoc; numero: number } | null {
  const d = (descricao ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const m = /^(venda|ordem de servico|compra) de n\S{0,2}\s*(\d+)/.exec(d);
  if (!m) return null;
  return { tipo: m[1] === "venda" ? "VENDA" : m[1] === "compra" ? "COMPRA" : "OS", numero: Number(m[2]) };
}

type Conta = { id: string; descricao: string; origemTipo: string | null; origemId: string | null; empresaId?: string | null };

/**
 * Contas trazidas do Gestão Click sem o documento ligado: acha a venda/OS/compra pelo número da descrição,
 * só entre os documentos que vieram do mesmo backup (idLegado "venda:N" ou "<cnpj>:venda:N"), da empresa da conta.
 * Devolve, por id da conta, o documento achado (não grava nada; a conta continua avulsa para editar e excluir).
 */
export async function origemPelaDescricao(contas: Conta[]): Promise<Map<string, { origemTipo: TipoDoc; origemId: string }>> {
  const soltas = contas
    .filter((c) => !c.origemId && (!c.origemTipo || c.origemTipo === "IMPLANTACAO"))
    .map((c) => ({ c, doc: documentoDaDescricao(c.descricao) }))
    .filter((x): x is { c: Conta; doc: { tipo: TipoDoc; numero: number } } => !!x.doc);
  const origem = new Map<string, { origemTipo: TipoDoc; origemId: string }>();
  if (!soltas.length) return origem;
  const achados = new Map<string, { id: string; empresaId: string | null }[]>();
  for (const tipo of ["VENDA", "OS", "COMPRA"] as const) {
    const nums = [...new Set(soltas.filter((x) => x.doc.tipo === tipo).map((x) => x.doc.numero))];
    if (!nums.length) continue;
    const where = { OR: nums.flatMap((n) => [{ idLegado: `${PREFIXO[tipo]}:${n}` }, { idLegado: { endsWith: `:${PREFIXO[tipo]}:${n}` } }]) };
    const select = { id: true, idLegado: true, empresaId: true };
    const docs = tipo === "VENDA" ? await prisma.venda.findMany({ where, select })
      : tipo === "OS" ? await prisma.ordemServico.findMany({ where, select })
      : await prisma.compra.findMany({ where, select });
    for (const d of docs) {
      const n = /(\d+)$/.exec(d.idLegado ?? "")?.[1];
      if (!n) continue;
      const k = `${tipo}:${n}`;
      achados.set(k, [...(achados.get(k) ?? []), { id: d.id, empresaId: d.empresaId }]);
    }
  }
  for (const { c, doc } of soltas) {
    const opcoes = achados.get(`${doc.tipo}:${doc.numero}`) ?? [];
    // mais de uma empresa com o mesmo número: fica a da conta; sem como decidir, não liga
    const d = opcoes.length === 1 ? opcoes[0] : opcoes.find((o) => c.empresaId !== undefined && o.empresaId === c.empresaId);
    if (d) origem.set(c.id, { origemTipo: doc.tipo, origemId: d.id });
  }
  return origem;
}
