import type { Prisma, TipoPessoa, ContribuinteIcms } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { proximoNumero } from "@/lib/sequencia";
import type { DadosPessoa, PapelPessoa } from "./tipos";
export * from "./tipos";

/** Os três cadastros de pessoa do Gestão Click. Uma mesma pessoa (mesmo CPF/CNPJ) pode ter os três papéis. */

export const PAPEIS: Record<PapelPessoa, {
  rotulo: string; plural: string; base: string; icone: string; codigo: "codigoCliente" | "codigoFornecedor" | "codigoTransportadora"; sequencia: string; artigo: "o" | "a";
}> = {
  cliente: { rotulo: "Cliente", plural: "Clientes", base: "/clientes", icone: "clientes", codigo: "codigoCliente", sequencia: "CLIENTE", artigo: "o" },
  fornecedor: { rotulo: "Fornecedor", plural: "Fornecedores", base: "/fornecedores", icone: "fornecedores", codigo: "codigoFornecedor", sequencia: "FORNECEDOR", artigo: "o" },
  transportadora: { rotulo: "Transportadora", plural: "Transportadoras", base: "/transportadoras", icone: "frete", codigo: "codigoTransportadora", sequencia: "TRANSPORTADORA", artigo: "a" },
};

export const TIPOS_PESSOA: { valor: TipoPessoa; rotulo: string; sigla: string }[] = [
  { valor: "FISICA", rotulo: "Pessoa física", sigla: "PF" },
  { valor: "JURIDICA", rotulo: "Pessoa jurídica", sigla: "PJ" },
  { valor: "ESTRANGEIRO", rotulo: "Estrangeiro", sigla: "Estrangeiro" },
];

export const CONTRIBUINTES: { valor: ContribuinteIcms; rotulo: string }[] = [
  { valor: "CONTRIBUINTE", rotulo: "Contribuinte ICMS" },
  { valor: "ISENTO", rotulo: "Contribuinte ISENTO" },
  { valor: "NAO_CONTRIBUINTE", rotulo: "Não contribuinte" },
];

// ---------- situação financeira (pílula da lista de clientes)

export type SituacaoFin = "NOVO" | "EM_DIA" | "A_VENCER" | "ATRASADO";
export const SITUACOES_FIN: { valor: SituacaoFin; rotulo: string; cor: string }[] = [
  { valor: "NOVO", rotulo: "Novo", cor: "border-slate-300 bg-slate-50 text-slate-600" },
  { valor: "EM_DIA", rotulo: "Em dia", cor: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  { valor: "A_VENCER", rotulo: "A vencer", cor: "border-amber-300 bg-amber-50 text-amber-700" },
  { valor: "ATRASADO", rotulo: "Atrasado", cor: "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700" },
];

const hoje = () => new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) + "T00:00:00Z");

/** Filtro Prisma de cada situação, sobre as contas a receber (cliente) ou a pagar (fornecedor). */
export function whereSituacao(s: SituacaoFin, tipo: "RECEBER" | "PAGAR" = "RECEBER"): Prisma.PessoaWhereInput {
  const h = hoje();
  const atrasado = { some: { tipo, pagoEm: null, vencimento: { lt: h } } } as const;
  const aVencer = { some: { tipo, pagoEm: null, vencimento: { gte: h } } } as const;
  if (s === "NOVO") return { lancamentos: { none: { tipo } } };
  if (s === "ATRASADO") return { lancamentos: atrasado };
  if (s === "A_VENCER") return { AND: [{ lancamentos: aVencer }, { NOT: { lancamentos: atrasado } }] };
  return { AND: [{ lancamentos: { some: { tipo } } }, { lancamentos: { none: { tipo, pagoEm: null } } }] };
}

/** Situação de várias pessoas de uma vez (para a página da lista). */
export async function situacoesFinanceiras(ids: string[], tipo: "RECEBER" | "PAGAR" = "RECEBER") {
  const h = hoje();
  const linhas = await prisma.lancamento.groupBy({
    by: ["pessoaId"],
    where: { pessoaId: { in: ids }, tipo },
    _count: { _all: true },
  });
  const abertos = await prisma.lancamento.findMany({
    where: { pessoaId: { in: ids }, tipo, pagoEm: null },
    select: { pessoaId: true, vencimento: true },
  });
  const r = new Map<string, SituacaoFin>();
  for (const id of ids) r.set(id, "NOVO");
  for (const l of linhas) if (l.pessoaId) r.set(l.pessoaId, "EM_DIA");
  for (const a of abertos) {
    if (!a.pessoaId) continue;
    if (a.vencimento < h) r.set(a.pessoaId, "ATRASADO");
    else if (r.get(a.pessoaId) !== "ATRASADO") r.set(a.pessoaId, "A_VENCER");
  }
  return r;
}

// ---------- gravação

const t = (s: string | undefined | null) => (s ?? "").trim() || null;
const dig = (s: string | undefined | null) => (s ?? "").replace(/\D/g, "") || null;

export function validarDocumento(doc: string, tipo: TipoPessoa) {
  if (!doc || tipo === "ESTRANGEIRO") return null;
  const d = doc.replace(/\D/g, "");
  if (tipo === "FISICA" && d.length !== 11) return "CPF deve ter 11 dígitos";
  if (tipo === "JURIDICA" && d.length !== 14) return "CNPJ deve ter 14 dígitos";
  return null;
}

/** Cria ou altera a pessoa no papel indicado; endereços e contatos são substituídos pela lista do formulário. */
export async function salvarPessoa(papel: PapelPessoa, d: DadosPessoa, opts: { id?: string; usuarioId?: string } = {}) {
  if (!d.nome.trim()) throw new Error("Informe o nome");
  if (!d.tipoPessoa) throw new Error("Selecione o tipo");
  const erroDoc = validarDocumento(d.documento, d.tipoPessoa);
  if (erroDoc) throw new Error(erroDoc);
  const campos = papel === "cliente" ? await prisma.campoExtra.findMany({ where: { entidade: "CLIENTE" } }) : [];
  for (const c of campos) {
    const v = d.camposExtras?.[c.id];
    if (c.obrigatorio && (v == null || (Array.isArray(v) ? v.length === 0 : !String(v).trim()))) throw new Error(`Preencha o campo ${c.nome}`);
  }
  const documento = d.tipoPessoa === "ESTRANGEIRO" ? t(d.documento) : dig(d.documento);
  const enderecos = d.enderecos.filter((e) => Object.entries(e).some(([k, v]) => k !== "tipo" && String(v ?? "").trim()));
  const principal = enderecos.find((e) => !/entrega/i.test(e.tipo)) ?? enderecos[0];
  const ie = d.ieIsento ? "ISENTO" : t(d.inscricaoEstadual);
  const limite = d.limiteCredito.trim() ? Number(d.limiteCredito.replace(/\./g, "").replace(",", ".")) : null;
  if (limite !== null && !(limite >= 0)) throw new Error("Limite de crédito inválido");
  const pj = d.tipoPessoa === "JURIDICA";
  const dados = {
    tipoPessoa: d.tipoPessoa,
    ativo: d.ativo,
    // PJ: razão social é o nome oficial (vai na nota); o "Nome" da tela vira nome fantasia
    nome: (pj && t(d.razaoSocial)) || d.nome.trim(),
    fantasia: pj && t(d.razaoSocial) && d.razaoSocial.trim() !== d.nome.trim() ? d.nome.trim() : null,
    email: t(d.email), documento,
    nomeSocial: d.tipoPessoa === "FISICA" ? t(d.nomeSocial) : null,
    rg: d.tipoPessoa === "FISICA" ? t(d.rg) : null,
    nascimento: d.tipoPessoa === "FISICA" && d.nascimento ? new Date(d.nascimento + "T00:00:00Z") : null,
    inscricaoEstadual: pj ? ie : null,
    inscricaoMunicipal: pj ? t(d.inscricaoMunicipal) : null,
    suframa: pj ? t(d.suframa) : null,
    responsavel: pj ? t(d.responsavel) : null,
    contribuinteIcms: d.contribuinteIcms ?? (ie === "ISENTO" ? "ISENTO" : ie ? "CONTRIBUINTE" : "NAO_CONTRIBUINTE"),
    telefone: t(d.telefone), celular: t(d.celular), fax: t(d.fax), site: t(d.site),
    pais: t(d.pais) ?? "Brasil",
    observacoes: t(d.observacoes),
    cep: dig(principal?.cep), logradouro: t(principal?.logradouro), numero: t(principal?.numero), complemento: t(principal?.complemento),
    bairro: t(principal?.bairro), cidade: t(principal?.cidade), codigoMunicipio: dig(principal?.codigoMunicipio), uf: t(principal?.uf)?.toUpperCase().slice(0, 2) ?? null,
    ...(papel === "cliente" ? {
      vendedorId: t(d.vendedorId), limiteCredito: limite, excederLimite: d.excederLimite,
      camposExtras: (d.camposExtras ?? {}) as Prisma.InputJsonValue,
    } : {}),
  };
  const filhos = {
    enderecos: { create: enderecos.map((e, i) => ({ ordem: i, tipo: t(e.tipo), cep: dig(e.cep), logradouro: t(e.logradouro), numero: t(e.numero), complemento: t(e.complemento), bairro: t(e.bairro), cidade: t(e.cidade), codigoMunicipio: dig(e.codigoMunicipio), uf: t(e.uf)?.toUpperCase().slice(0, 2) ?? null })) },
    contatos: { create: d.contatos.filter((c) => t(c.nome) || t(c.contato)).map((c, i) => ({ ordem: i, tipo: t(c.tipo), nome: t(c.nome), contato: t(c.contato), cargo: t(c.cargo), observacao: t(c.observacao) })) },
  };
  const cfg = PAPEIS[papel];
  return prisma.$transaction(async (tx) => {
    if (documento) {
      const outro = await tx.pessoa.findUnique({ where: { documento }, select: { id: true, nome: true, cliente: true, fornecedor: true, transportadora: true } });
      if (outro && outro.id !== opts.id) {
        if (opts.id || outro[papel]) throw new Error(`Já existe cadastro com esse documento: ${outro.nome}`);
        // mesmo CPF/CNPJ já cadastrado em outro papel: só acrescenta este papel
        opts = { ...opts, id: outro.id };
      }
    }
    if (opts.id) {
      const atual = await tx.pessoa.findUniqueOrThrow({ where: { id: opts.id } });
      await tx.pessoaEndereco.deleteMany({ where: { pessoaId: opts.id } });
      await tx.pessoaContato.deleteMany({ where: { pessoaId: opts.id } });
      const codigo = atual[cfg.codigo] ?? (await proximoNumero(tx, cfg.sequencia));
      return tx.pessoa.update({ where: { id: opts.id }, data: { ...dados, [papel]: true, [cfg.codigo]: codigo, ...filhos } });
    }
    const codigo = await proximoNumero(tx, cfg.sequencia);
    return tx.pessoa.create({
      data: { ...dados, cliente: papel === "cliente", fornecedor: papel === "fornecedor", transportadora: papel === "transportadora", [cfg.codigo]: codigo, criadoPorId: opts.usuarioId ?? null, ...filhos },
    });
  });
}

/** Garante código de cliente/fornecedor/transportadora (cadastros criados por outras telas ou pela migração). */
export async function garantirCodigo(tx: Tx, pessoaId: string, papel: PapelPessoa) {
  const cfg = PAPEIS[papel];
  const p = await tx.pessoa.findUniqueOrThrow({ where: { id: pessoaId }, select: { codigoCliente: true, codigoFornecedor: true, codigoTransportadora: true } });
  if (p[cfg.codigo] != null) return p[cfg.codigo]!;
  const n = await proximoNumero(tx, cfg.sequencia);
  await tx.pessoa.update({ where: { id: pessoaId }, data: { [cfg.codigo]: n } });
  return n;
}

/**
 * Exclui do papel. Se a pessoa tem outro papel, só tira este; se tem movimento (venda, OS, financeiro, compra, nota),
 * não apaga: pede para inativar.
 */
export async function excluirPessoa(papel: PapelPessoa, id: string) {
  const p = await prisma.pessoa.findUniqueOrThrow({
    where: { id },
    select: { nome: true, cliente: true, fornecedor: true, transportadora: true, _count: { select: { vendas: true, ordensServico: true, lancamentos: true, compras: true } } },
  });
  const outros = (Object.keys(PAPEIS) as PapelPessoa[]).filter((x) => x !== papel && p[x]);
  if (outros.length) {
    await prisma.pessoa.update({ where: { id }, data: { [papel]: false } });
    return { ok: true as const, mensagem: `${p.nome} saiu de ${PAPEIS[papel].plural.toLowerCase()} (continua como ${outros.map((x) => PAPEIS[x].rotulo.toLowerCase()).join(" e ")}).` };
  }
  const c = p._count;
  if (c.vendas + c.ordensServico + c.lancamentos + c.compras > 0) {
    return { ok: false as const, mensagem: `${p.nome} tem vendas, OS ou lançamentos e não pode ser excluído. Marque como inativo.` };
  }
  await prisma.$transaction([
    prisma.anexo.deleteMany({ where: { entidade: "PESSOA", entidadeId: id } }),
    prisma.pessoa.delete({ where: { id } }),
  ]);
  return { ok: true as const, mensagem: `${p.nome} excluído.` };
}
