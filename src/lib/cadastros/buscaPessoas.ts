import { sqlDoGrupo } from "@/lib/empresa/loja";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { palavras, semAcento, wherePalavras } from "@/lib/busca/palavras";
import { formatarDoc } from "./filtros";
import type { EtiquetaBusca, PessoaBusca } from "./tipos";

const hoje = () => new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) + "T00:00:00Z");
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const CINZA = "text-slate-600 bg-slate-50";
const AZUL = "text-sky-700 bg-sky-50";
const VERDE = "text-emerald-700 bg-emerald-50";
const AMARELO = "text-amber-700 bg-amber-50";
const VERMELHO = "text-red-700 bg-red-50";
const ROXO = "text-violet-700 bg-violet-50";

export type PapelBusca = "cliente" | "fornecedor" | "transportadora";

/**
 * Busca dos campos "Digite para buscar" de pessoa (nome, fantasia, CPF/CNPJ ou telefone),
 * já com as etiquetas da lista: PF/PJ, CPF/CNPJ, IE/contribuinte, cidade e, para clientes,
 * a situação financeira (atrasado com o valor, a vencer, em dia) e limite de crédito excedido.
 */
export async function buscarPessoas(papel: PapelBusca, q: string, take = 15): Promise<PessoaBusca[]> {
  q = q.trim();
  if (q.length < 2) return [];
  const dig = q.replace(/\D/g, "");
  // cada palavra em qualquer ordem, sem acento, no nome/fantasia; ou os dígitos no CPF/CNPJ e telefones
  const papelCol = Prisma.raw(`"${papel}"`);
  const digitos = dig.length >= 3 ? Prisma.sql`OR coalesce(p.documento,'') LIKE ${`%${dig}%`} OR regexp_replace(coalesce(p.telefone,''), '\\D', '', 'g') LIKE ${`%${dig}%`} OR regexp_replace(coalesce(p.celular,''), '\\D', '', 'g') LIKE ${`%${dig}%`}` : Prisma.empty;
  const daLoja = await sqlDoGrupo("p.lojas");
  const achados = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT p.id FROM "Pessoa" p
     WHERE p.${papelCol} AND p.ativo AND (${wherePalavras(q, [Prisma.sql`p.nome`, Prisma.sql`p.fantasia`])} ${digitos})${daLoja}
     ORDER BY (${semAcento(Prisma.sql`p.nome`)} LIKE ${`${palavras(q)[0] ?? ""}%`}) DESC, p.nome
     LIMIT ${take}`);
  const ordem = new Map(achados.map((a, i) => [a.id, i]));
  const lista = await prisma.pessoa.findMany({
    where: { id: { in: achados.map((a) => a.id) } },
    select: {
      id: true, nome: true, fantasia: true, documento: true, cidade: true, uf: true, email: true, celular: true, telefone: true,
      tipoPessoa: true, inscricaoEstadual: true, contribuinteIcms: true, limiteCredito: true,
      codigoCliente: true, codigoFornecedor: true, codigoTransportadora: true,
    },
  });
  lista.sort((a, b) => ordem.get(a.id)! - ordem.get(b.id)!);
  if (!lista.length) return [];

  // financeiro só para clientes: contas a receber em aberto (vencidas e a vencer) e se já teve alguma
  const fin = new Map<string, { atrasado: number; aberto: number; aVencer: boolean; teve: boolean }>();
  if (papel === "cliente") {
    const ids = lista.map((p) => p.id);
    const h = hoje();
    const [teve, abertos] = await Promise.all([
      prisma.lancamento.groupBy({ by: ["pessoaId"], where: { pessoaId: { in: ids }, tipo: "RECEBER" }, _count: { _all: true } }),
      prisma.lancamento.findMany({ where: { pessoaId: { in: ids }, tipo: "RECEBER", pagoEm: null }, select: { pessoaId: true, vencimento: true, valor: true } }),
    ]);
    for (const t of teve) if (t.pessoaId) fin.set(t.pessoaId, { atrasado: 0, aberto: 0, aVencer: false, teve: true });
    for (const a of abertos) {
      if (!a.pessoaId) continue;
      const f = fin.get(a.pessoaId) ?? { atrasado: 0, aberto: 0, aVencer: false, teve: true };
      const v = Number(a.valor);
      f.aberto += v;
      if (a.vencimento < h) f.atrasado += v; else f.aVencer = true;
      fin.set(a.pessoaId, f);
    }
  }

  return lista.map((p) => {
    const e: EtiquetaBusca[] = [];
    const pf = p.tipoPessoa === "FISICA";
    const doc = formatarDoc(p.documento);
    e.push({ rotulo: p.tipoPessoa === "ESTRANGEIRO" ? "Estrangeiro" : pf ? "PF" : "PJ", cor: CINZA });
    if (doc) e.push({ rotulo: `${p.documento?.length === 11 ? "CPF" : p.documento?.length === 14 ? "CNPJ" : "Doc."} ${doc}`, cor: AZUL, mono: true });
    else e.push({ rotulo: pf ? "Sem CPF" : "Sem CNPJ", cor: AMARELO });
    const ie = p.inscricaoEstadual?.trim();
    if (p.contribuinteIcms === "CONTRIBUINTE") e.push({ rotulo: ie && ie.toUpperCase() !== "ISENTO" ? `Contribuinte · IE ${ie}` : "Contribuinte (sem IE)", cor: ie ? ROXO : AMARELO });
    else if (p.contribuinteIcms === "ISENTO" || ie?.toUpperCase() === "ISENTO") e.push({ rotulo: "Isento de IE", cor: CINZA });
    else if (!pf) e.push({ rotulo: "Não contribuinte", cor: CINZA });
    if (p.cidade) e.push({ rotulo: p.uf ? `${p.cidade}/${p.uf}` : p.cidade, cor: CINZA });
    if (papel === "cliente") {
      const f = fin.get(p.id);
      if (!f) e.push({ rotulo: "Novo", cor: CINZA });
      else if (f.atrasado > 0) e.push({ rotulo: `Atrasado ${brl(f.atrasado)}`, cor: VERMELHO });
      else if (f.aVencer) e.push({ rotulo: "A vencer", cor: AMARELO });
      else e.push({ rotulo: "Em dia", cor: VERDE });
      const limite = p.limiteCredito == null ? null : Number(p.limiteCredito);
      if (limite != null && f && f.aberto > limite) e.push({ rotulo: `Limite excedido (${brl(limite)})`, cor: VERMELHO });
    }
    const codigo = papel === "cliente" ? p.codigoCliente : papel === "fornecedor" ? p.codigoFornecedor : p.codigoTransportadora;
    return {
      id: p.id, nome: p.nome, fantasia: p.fantasia, documento: doc || null, cidade: p.cidade, email: p.email,
      celular: p.celular, telefone: p.telefone, codigo: codigo ? `#${codigo}` : undefined, etiquetas: e,
    };
  });
}
