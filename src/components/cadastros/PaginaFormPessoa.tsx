import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/atual";
import { PAPEIS, enderecoVazio, type PapelPessoa } from "@/lib/cadastros/pessoas";
import { Pagina } from "@/components/ui/Pagina";
import FormPessoa, { type InicialPessoa } from "./FormPessoa";

/** Página "Adicionar"/"Editar" de cliente, fornecedor ou transportadora. */
export default async function PaginaFormPessoa({ papel, id }: { papel: PapelPessoa; id?: string }) {
  const cfg = PAPEIS[papel];
  const [u, vendedores, te, tc, campos] = await Promise.all([
    usuarioAtual(),
    prisma.usuario.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.tipoEndereco.findMany({ orderBy: { nome: "asc" } }),
    prisma.tipoContato.findMany({ orderBy: { nome: "asc" } }),
    papel === "cliente" ? prisma.campoExtra.findMany({ where: { entidade: "CLIENTE" }, orderBy: [{ ordem: "asc" }, { nome: "asc" }] }) : [],
  ]);
  let inicial: InicialPessoa = {
    tipoPessoa: "" as InicialPessoa["tipoPessoa"], ativo: true, nome: "", email: "", documento: "", nomeSocial: "", rg: "", nascimento: "",
    razaoSocial: "", inscricaoEstadual: "", ieIsento: false, inscricaoMunicipal: "", suframa: "", responsavel: "", contribuinteIcms: "NAO_CONTRIBUINTE",
    telefone: "", celular: "", fax: "", site: "", vendedorId: papel === "cliente" ? (u?.id ?? "") : "", pais: "Brasil",
    enderecos: [enderecoVazio()], contatos: [], limiteCredito: "", excederLimite: false, observacoes: "", camposExtras: {},
  };
  if (id) {
    const p = await prisma.pessoa.findFirst({
      where: { id, [papel]: true }, omit: { foto: true },
      include: { enderecos: { orderBy: { ordem: "asc" } }, contatos: { orderBy: { ordem: "asc" } } },
    });
    if (!p) notFound();
    const [{ t: temFoto }] = await prisma.$queryRaw<{ t: boolean }[]>`SELECT foto IS NOT NULL AS t FROM "Pessoa" WHERE id = ${id}`;
    const s = (x: string | null) => x ?? "";
    const pj = p.tipoPessoa === "JURIDICA";
    inicial = {
      id: p.id, temFoto, tipoPessoa: p.tipoPessoa, ativo: p.ativo,
      nome: pj ? (p.fantasia ?? p.nome) : p.nome, razaoSocial: pj ? p.nome : "",
      email: s(p.email), documento: s(p.documento), nomeSocial: s(p.nomeSocial), rg: s(p.rg),
      nascimento: p.nascimento ? p.nascimento.toISOString().slice(0, 10) : "",
      inscricaoEstadual: p.inscricaoEstadual === "ISENTO" ? "" : s(p.inscricaoEstadual), ieIsento: p.inscricaoEstadual === "ISENTO",
      inscricaoMunicipal: s(p.inscricaoMunicipal), suframa: s(p.suframa), responsavel: s(p.responsavel), contribuinteIcms: p.contribuinteIcms,
      telefone: s(p.telefone), celular: s(p.celular), fax: s(p.fax), site: s(p.site), vendedorId: s(p.vendedorId), pais: p.pais,
      enderecos: p.enderecos.length ? p.enderecos.map((e) => ({ tipo: s(e.tipo), cep: s(e.cep), logradouro: s(e.logradouro), numero: s(e.numero), complemento: s(e.complemento), bairro: s(e.bairro), cidade: s(e.cidade), codigoMunicipio: s(e.codigoMunicipio), uf: s(e.uf) })) : [enderecoVazio()],
      contatos: p.contatos.map((c) => ({ tipo: s(c.tipo), nome: s(c.nome), contato: s(c.contato), cargo: s(c.cargo), observacao: s(c.observacao) })),
      limiteCredito: p.limiteCredito != null ? Number(p.limiteCredito).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "",
      excederLimite: p.excederLimite, observacoes: s(p.observacoes), camposExtras: (p.camposExtras ?? {}) as Record<string, string | string[]>,
    };
  }
  const acao = id ? "Editar" : "Adicionar";
  return (
    <Pagina titulo={`${acao} ${cfg.rotulo.toLowerCase()}`} trilha={[{ rotulo: cfg.plural, href: cfg.base }, { rotulo: acao }]}>
      <FormPessoa papel={papel} inicial={inicial} vendedores={vendedores}
        tiposEndereco={te.map((x) => x.nome)} tiposContato={tc.map((x) => x.nome)}
        camposExtras={campos.map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo, opcoes: c.opcoes, obrigatorio: c.obrigatorio }))} />
    </Pagina>
  );
}
