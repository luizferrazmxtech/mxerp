import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { lerNumero, type DadosServico } from "./tipos";

const t = (s: string | undefined | null) => (s ?? "").trim() || null;
const D = (v: number | null) => (v == null ? null : new Prisma.Decimal(v));

export async function gerarCodigoServico() {
  const [{ max }] = await prisma.$queryRaw<{ max: number | null }[]>`SELECT MAX(codigo::bigint)::int AS max FROM "Servico" WHERE codigo ~ '^[0-9]{1,9}$'`;
  return String((max ?? 0) + 1);
}

export async function salvarServico(d: DadosServico, id?: string) {
  if (!d.nome.trim()) throw new Error("Informe o nome do serviço");
  const codigo = d.codigo.trim() || (await gerarCodigoServico());
  const outro = await prisma.servico.findUnique({ where: { codigo }, select: { id: true } });
  if (outro && outro.id !== id) throw new Error(`Já existe serviço com o código ${codigo}`);
  if (!d.lojas.length) throw new Error("Selecione ao menos uma loja");
  const dados = {
    nome: d.nome.trim(), codigo, comissao: D(lerNumero(d.comissao)), custo: D(lerNumero(d.custo) ?? 0)!, preco: D(lerNumero(d.preco) ?? 0)!,
    descricao: t(d.descricao), ativo: d.ativo, camposExtras: (d.camposExtras ?? {}) as Prisma.InputJsonValue, lojas: d.lojas,
    atividade: t(d.atividade), codigoLc116: t(d.codigoLc116), codigoTributacaoMunicipal: t(d.codigoTributacaoMunicipal),
    codigoTributacaoNacional: t(d.codigoTributacaoNacional)?.replace(/\D/g, "") ?? null, codigoNbs: t(d.codigoNbs)?.replace(/\D/g, "") ?? null,
    cnae: t(d.cnae)?.replace(/\D/g, "") ?? null, descricaoAtividade: t(d.descricaoAtividade),
    aliquotaIss: D(lerNumero(d.aliquotaIss)), aliquotaCofins: D(lerNumero(d.aliquotaCofins)), aliquotaPis: D(lerNumero(d.aliquotaPis)),
    aliquotaCsll: D(lerNumero(d.aliquotaCsll)), aliquotaIr: D(lerNumero(d.aliquotaIr)), aliquotaInss: D(lerNumero(d.aliquotaInss)),
    descontarImpostos: d.descontarImpostos, descontarDeducoes: d.descontarDeducoes, construcaoCivil: d.construcaoCivil, reterIss: d.reterIss,
  };
  const forn = { fornecedores: { create: d.fornecedores.filter((f) => f.fornecedorId).map((f) => ({ fornecedorId: f.fornecedorId, codigo: t(f.codigo) })) } };
  return prisma.$transaction(async (tx) => {
    if (id) {
      await tx.itemFornecedor.deleteMany({ where: { servicoId: id } });
      return tx.servico.update({ where: { id }, data: { ...dados, ...forn } });
    }
    return tx.servico.create({ data: { ...dados, ...forn } });
  });
}

export async function excluirServico(id: string) {
  const s = await prisma.servico.findUniqueOrThrow({ where: { id }, select: { nome: true, _count: { select: { itensOs: true, itensVenda: true } } } });
  if (s._count.itensOs + s._count.itensVenda > 0) {
    await prisma.servico.update({ where: { id }, data: { ativo: false } });
    return { ok: true, mensagem: `${s.nome} está em OS ou vendas e foi inativado.` };
  }
  await prisma.$transaction([prisma.anexo.deleteMany({ where: { entidade: "FOTO_SERVICO", entidadeId: id } }), prisma.servico.delete({ where: { id } })]);
  return { ok: true, mensagem: `${s.nome} excluído.` };
}
