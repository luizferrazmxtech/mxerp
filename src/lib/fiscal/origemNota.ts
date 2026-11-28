import { prisma } from "@/lib/db";
import { todasAsLojas } from "@/lib/empresa/loja";
import { linkNaEmpresa } from "@/lib/empresa/abrirNaEmpresa";

export type OrigemNota = {
  rotulo: string;
  /** link para o documento; de outra empresa, passa pela troca de empresa (/api/loja/abrir) */
  href: string;
  cliente: { id: string; nome: string; fantasia: string | null } | null;
  /** venda/OS de outra empresa do grupo (ex.: NFS-e da VFX dos serviços de uma OS da MXTECH) */
  outraEmpresa: { id: string; nome: string } | null;
};

type NotaComOrigem = { origemTipo: string | null; origemId: string | null; empresaId: string | null };

/**
 * Venda ou OS que gerou cada nota, com o cliente. A nota pode ser de uma empresa e o documento de outra do grupo
 * (serviços da OS da MXTECH faturados pela VFX): só os documentos das notas pedidas são lidos, de qualquer empresa,
 * e o link troca para a empresa do documento antes de abrir. Chave do mapa: origemId.
 */
export async function origensDasNotas(notas: NotaComOrigem[]): Promise<Map<string, OrigemNota>> {
  const ids = (t: string) => [...new Set(notas.filter((n) => n.origemTipo === t && n.origemId).map((n) => n.origemId!))];
  const vIds = ids("VENDA"), oIds = ids("OS");
  const cliente = { select: { id: true, nome: true, fantasia: true } } as const;
  // ids pedidos em lista são filtrados pela empresa atual: aqui são só os das notas listadas, então lê de todas
  const [vendas, oss] = await todasAsLojas(() => Promise.all([
    vIds.length ? prisma.venda.findMany({ where: { id: { in: vIds } }, select: { id: true, numero: true, empresaId: true, cliente } }) : [],
    oIds.length ? prisma.ordemServico.findMany({ where: { id: { in: oIds } }, select: { id: true, numero: true, empresaId: true, cliente } }) : [],
  ]));
  const empresaDaNota = new Map(notas.filter((n) => n.origemId).map((n) => [n.origemId!, n.empresaId]));
  const docs = [...vendas.map((v) => ({ ...v, tipo: "venda" as const })), ...oss.map((o) => ({ ...o, tipo: "OS" as const }))];
  const fora = docs.filter((d) => d.empresaId && empresaDaNota.get(d.id) && d.empresaId !== empresaDaNota.get(d.id));
  const empresas = fora.length
    ? new Map((await prisma.empresa.findMany({ where: { id: { in: [...new Set(fora.map((d) => d.empresaId!))] } }, select: { id: true, nomeFantasia: true, razaoSocial: true } }))
      .map((e) => [e.id, e.nomeFantasia || e.razaoSocial]))
    : new Map<string, string>();
  const mapa = new Map<string, OrigemNota>();
  for (const d of docs) {
    const href = d.tipo === "venda" ? `/vendas/${d.id}` : `/os/${d.id}`;
    const outra = fora.includes(d) ? { id: d.empresaId!, nome: empresas.get(d.empresaId!) ?? "outra empresa" } : null;
    mapa.set(d.id, { rotulo: `${d.tipo} #${d.numero}`, href: outra ? linkNaEmpresa(outra.id, href) : href, cliente: d.cliente, outraEmpresa: outra });
  }
  return mapa;
}
