import { prisma } from "@/lib/db";
import { PRIORIDADES_OS, SITUACOES_OS } from "@/lib/os/os";

/** Listas que o formulário de OS precisa (técnicos, vendedores, serviços, canais). */
export async function opcoesFormOs() {
  const [usuarios, servicos, canais] = await Promise.all([
    prisma.usuario.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true, tecnico: true, vendedor: true } }),
    prisma.servico.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true, preco: true } }),
    prisma.ordemServico.findMany({ distinct: ["canal"], select: { canal: true } }),
  ]);
  return {
    usuarios,
    servicos: servicos.map((s) => ({ ...s, preco: Number(s.preco) })),
    situacoes: SITUACOES_OS.map(({ valor, rotulo }) => ({ valor, rotulo })),
    prioridades: PRIORIDADES_OS,
    canais: [...new Set(["Presencial", "Internet", "Telefone", "WhatsApp", ...canais.map((c) => c.canal)])],
  };
}

/** Instante → "AAAA-MM-DDTHH:mm" no horário de São Paulo (para os campos de data e hora). */
export function paraCampo(d: Date | null | undefined) {
  if (!d) return "";
  const s = d.toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }); // "AAAA-MM-DD HH:mm:ss"
  return s.slice(0, 16).replace(" ", "T");
}
