import type { Prisma, TipoPessoa } from "@prisma/client";
import { PAPEIS, whereSituacao, type PapelPessoa, type SituacaoFin } from "./pessoas";

export type ParamsLista = Record<string, string | undefined>;

export function formatarDoc(doc: string | null | undefined) {
  if (!doc) return "";
  if (/^\d{11}$/.test(doc)) return doc.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  if (/^\d{14}$/.test(doc)) return doc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  return doc;
}

/** Filtros da busca simples e da busca avançada → where do Prisma. */
export function wherePessoas(papel: PapelPessoa, sp: ParamsLista): Prisma.PessoaWhereInput {
  const and: Prisma.PessoaWhereInput[] = [{ [papel]: true }];
  const cont = (v: string) => ({ contains: v.trim(), mode: "insensitive" as const });
  if (sp.q) {
    const d = sp.q.replace(/\D/g, "");
    and.push({ OR: [{ nome: cont(sp.q) }, { fantasia: cont(sp.q) }, ...(d.length >= 3 ? [{ documento: { contains: d } }] : [])] });
  }
  if (sp.tipo) and.push({ tipoPessoa: sp.tipo as TipoPessoa });
  if (sp.codigo && Number.isInteger(Number(sp.codigo))) and.push({ [PAPEIS[papel].codigo]: Number(sp.codigo) });
  if (sp.nome) and.push({ OR: [{ nome: cont(sp.nome) }, { fantasia: cont(sp.nome) }] });
  if (sp.doc) and.push({ documento: { contains: sp.doc.replace(/\D/g, "") || sp.doc } });
  if (sp.fone) {
    const d = sp.fone.replace(/\D/g, "");
    and.push({ OR: [{ telefone: { contains: d } }, { celular: { contains: d } }, { telefone: cont(sp.fone) }, { celular: cont(sp.fone) }] });
  }
  if (sp.email) and.push({ email: cont(sp.email) });
  if (sp.cidade) and.push({ cidade: cont(sp.cidade) });
  if (sp.uf) and.push({ uf: sp.uf.toUpperCase() });
  if (sp.vend) and.push({ vendedorId: sp.vend });
  if (sp.sit) and.push(whereSituacao(sp.sit as SituacaoFin, papel === "cliente" ? "RECEBER" : "PAGAR"));
  if (sp.ativo === "sim") and.push({ ativo: true });
  if (sp.ativo === "nao") and.push({ ativo: false });
  // campos extras: ?ce_<id>=valor
  for (const [k, v] of Object.entries(sp)) {
    if (k.startsWith("ce_") && v) and.push({ camposExtras: { path: [k.slice(3)], string_contains: v } });
  }
  return { AND: and };
}

export function ordemPessoas(papel: PapelPessoa, o?: string): Prisma.PessoaOrderByWithRelationInput {
  const desc = o?.startsWith("-");
  const campo = o?.replace(/^-/, "");
  const dir = desc ? "desc" : "asc";
  if (campo === "codigo") return { [PAPEIS[papel].codigo]: dir };
  if (campo === "documento") return { documento: dir };
  if (campo === "cadastrado") return { createdAt: dir };
  return { nome: dir };
}

