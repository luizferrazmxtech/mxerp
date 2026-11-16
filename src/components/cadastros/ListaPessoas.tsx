import Link from "next/link";
import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/atual";
import { PAPEIS, SITUACOES_FIN, TIPOS_PESSOA, situacoesFinanceiras, type PapelPessoa, type SituacaoFin } from "@/lib/cadastros/pessoas";
import { excluirPessoaAcao } from "@/lib/cadastros/acoes";
import { formatarDoc, ordemPessoas, wherePessoas, type ParamsLista } from "@/lib/cadastros/filtros";
import { colunasVisiveis } from "@/lib/ui/colunas";
import { dataSP } from "@/lib/ui/format";
import { Pagina, Pilula } from "@/components/ui/Pagina";
import BarraCadastro, { AcoesLinha } from "@/components/ui/BarraCadastro";
import { LinkSuspenso, urlCom } from "@/components/ui/BarraLista";
import GerenciarColunas from "@/components/ui/GerenciarColunas";
import Paginacao, { Ordenar, lerPagina } from "@/components/ui/Paginacao";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import FormExcluirVarios from "./FormExcluirVarios";

export type { ParamsLista };
export { formatarDoc };

const COLUNAS: Record<PapelPessoa, { chave: string; rotulo: string }[]> = {
  cliente: [
    { chave: "codigo", rotulo: "Código" }, { chave: "nome", rotulo: "Nome" }, { chave: "tipo", rotulo: "Tipo" }, { chave: "documento", rotulo: "Documento" },
    { chave: "situacao", rotulo: "Situação" }, { chave: "telefone", rotulo: "Telefone" }, { chave: "celular", rotulo: "Celular" }, { chave: "email", rotulo: "E-mail" },
    { chave: "ativo", rotulo: "Ativo" }, { chave: "areaCliente", rotulo: "Área do Cliente" }, { chave: "cadastrado", rotulo: "Cadastrado em" },
  ],
  fornecedor: [
    { chave: "codigo", rotulo: "Código" }, { chave: "nome", rotulo: "Nome" }, { chave: "tipo", rotulo: "Tipo" }, { chave: "documento", rotulo: "Documento" },
    { chave: "telefone", rotulo: "Telefone" }, { chave: "celular", rotulo: "Celular" }, { chave: "email", rotulo: "E-mail" }, { chave: "ativo", rotulo: "Situação" },
    { chave: "cadastrado", rotulo: "Cadastrado em" },
  ],
  transportadora: [
    { chave: "codigo", rotulo: "Código" }, { chave: "nome", rotulo: "Nome" }, { chave: "tipo", rotulo: "Tipo" }, { chave: "documento", rotulo: "Documento" },
    { chave: "telefone", rotulo: "Telefone" }, { chave: "celular", rotulo: "Celular" }, { chave: "email", rotulo: "E-mail" }, { chave: "ativo", rotulo: "Situação" },
    { chave: "cadastrado", rotulo: "Cadastrado em" },
  ],
};
const PADRAO: Record<PapelPessoa, string[]> = {
  cliente: ["nome", "documento", "situacao", "telefone"],
  fornecedor: ["nome", "documento", "telefone"],
  transportadora: ["nome", "documento", "telefone"],
};

export default async function ListaPessoas({ papel, sp, maisAcoes }: { papel: PapelPessoa; sp: ParamsLista; maisAcoes: React.ReactNode }) {
  const cfg = PAPEIS[papel];
  const u = await usuarioAtual();
  const where = await wherePessoas(papel, sp);
  const { pagina, porPagina, skip, take } = lerPagina(sp);
  const [lista, total, vendedores, campos] = await Promise.all([
    prisma.pessoa.findMany({
      where, orderBy: [ordemPessoas(papel, sp.o), { id: "asc" }], skip, take,
      select: { id: true, nome: true, fantasia: true, tipoPessoa: true, documento: true, telefone: true, celular: true, email: true, ativo: true, areaCliente: true, createdAt: true, codigoCliente: true, codigoFornecedor: true, codigoTransportadora: true },
    }),
    prisma.pessoa.count({ where }),
    papel === "cliente" ? prisma.usuario.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }) : [],
    papel === "cliente" ? prisma.campoExtra.findMany({ where: { entidade: "CLIENTE" }, orderBy: [{ ordem: "asc" }, { nome: "asc" }] }) : [],
  ]);
  const sit = papel === "cliente" ? await situacoesFinanceiras(lista.map((p) => p.id)) : new Map<string, SituacaoFin>();
  const corSit = new Map(SITUACOES_FIN.map((s) => [s.valor, s]));
  const todas = COLUNAS[papel];
  const vis = colunasVisiveis(u?.preferencias, cfg.base, todas, PADRAO[papel]);
  const tem = (c: string) => vis.includes(c);
  const params = sp;
  const excluindo = sp.excluir === "1";
  const siglaTipo = new Map(TIPOS_PESSOA.map((t) => [t.valor, t.sigla]));

  const tabela = (
    <div className="cartao overflow-x-auto">
      <table className="tabela">
        <thead>
          <tr>
            {excluindo && <th className="w-8"></th>}
            {tem("codigo") && <Ordenar base={cfg.base} params={params} campo="codigo" className="w-20">Código</Ordenar>}
            {tem("nome") && <Ordenar base={cfg.base} params={params} campo="nome">Nome</Ordenar>}
            {tem("tipo") && <th className="w-24">Tipo</th>}
            {tem("documento") && <Ordenar base={cfg.base} params={params} campo="documento" className="w-44">Documento</Ordenar>}
            {tem("situacao") && <th className="w-28 text-center">Situação</th>}
            {tem("telefone") && <th className="w-36">Telefone</th>}
            {tem("celular") && <th className="w-36">Celular</th>}
            {tem("email") && <th>E-mail</th>}
            {tem("ativo") && <th className="w-20">{papel === "cliente" ? "Ativo" : "Situação"}</th>}
            {tem("areaCliente") && <th className="w-28">Área do Cliente</th>}
            {tem("cadastrado") && <Ordenar base={cfg.base} params={params} campo="cadastrado" className="w-32">Cadastrado em</Ordenar>}
            <th className="w-28 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((p) => {
            const s = corSit.get(sit.get(p.id) ?? "NOVO")!;
            return (
              <tr key={p.id} className={p.ativo ? "" : "text-slate-400"}>
                {excluindo && <td><input type="checkbox" name="ids" value={p.id} /></td>}
                {tem("codigo") && <td>{p[cfg.codigo]}</td>}
                {tem("nome") && <td><Link href={`${cfg.base}/${p.id}`} className="hover:underline">{p.nome}</Link>{p.fantasia && <div className="text-[11px] italic text-slate-500">{p.fantasia}</div>}</td>}
                {tem("tipo") && <td>{siglaTipo.get(p.tipoPessoa)}</td>}
                {tem("documento") && <td>{formatarDoc(p.documento)}</td>}
                {tem("situacao") && <td className="text-center"><Pilula rotulo={s.rotulo} cor={s.cor} /></td>}
                {tem("telefone") && <td>{p.telefone}</td>}
                {tem("celular") && <td>{p.celular}</td>}
                {tem("email") && <td className="break-all">{p.email}</td>}
                {tem("ativo") && <td>{p.ativo ? "Ativo" : "Inativo"}</td>}
                {tem("areaCliente") && <td>{p.areaCliente ? "Habilitada" : "—"}</td>}
                {tem("cadastrado") && <td>{dataSP(p.createdAt)}</td>}
                <td>
                  <AcoesLinha ver={`${cfg.base}/${p.id}`} editar={`${cfg.base}/${p.id}/editar`}
                    excluir={<BotaoExcluir acao={excluirPessoaAcao.bind(null, papel, p.id)} pergunta={`Excluir ${p.nome}?`} />} />
                </td>
              </tr>
            );
          })}
          {!lista.length && <tr><td colSpan={14} className="py-10 text-center text-slate-500">Nenhum{cfg.artigo === "a" ? "a" : ""} {cfg.rotulo.toLowerCase()} encontrad{cfg.artigo}.</td></tr>}
        </tbody>
      </table>
      <Paginacao base={cfg.base} params={params} total={total} pagina={pagina} porPagina={porPagina} />
    </div>
  );

  return (
    <Pagina titulo={cfg.plural} icone={cfg.icone} trilha={[{ rotulo: cfg.plural, href: cfg.base }, { rotulo: "Listar" }]}>
      <BarraCadastro base={cfg.base} params={params} adicionar={{ href: `${cfg.base}/adicionar` }} maisAcoes={maisAcoes}
        colunas={<GerenciarColunas lista={cfg.base} colunas={todas} visiveis={vis} />} />

      {sp.busca === "1" && (
        <form action={cfg.base} className="cartao no-print mb-3 p-4">
          <input type="hidden" name="busca" value="1" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label><span className="rotulo">Tipo</span>
              <select name="tipo" defaultValue={sp.tipo ?? ""} className="campo">
                <option value="">Todos</option>
                {TIPOS_PESSOA.filter((t) => papel !== "transportadora" || t.valor !== "ESTRANGEIRO").map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
              </select></label>
            <label><span className="rotulo">Código</span><input name="codigo" defaultValue={sp.codigo} className="campo" inputMode="numeric" /></label>
            <label><span className="rotulo">Nome</span><input name="nome" defaultValue={sp.nome} className="campo" /></label>
            <label><span className="rotulo">CPF/CNPJ</span><input name="doc" defaultValue={sp.doc} className="campo" /></label>
            <label><span className="rotulo">Telefone/Celular</span><input name="fone" defaultValue={sp.fone} className="campo" /></label>
            <label><span className="rotulo">E-mail</span><input name="email" defaultValue={sp.email} className="campo" /></label>
            <label><span className="rotulo">Cidade</span><input name="cidade" defaultValue={sp.cidade} className="campo" /></label>
            <label><span className="rotulo">Estado</span><input name="uf" defaultValue={sp.uf} className="campo" maxLength={2} placeholder="UF" /></label>
            {papel === "cliente" && (
              <>
                <label><span className="rotulo">Vendedor/Responsável</span>
                  <select name="vend" defaultValue={sp.vend ?? ""} className="campo">
                    <option value="">Todos</option>
                    {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
                  </select></label>
                <label><span className="rotulo">Situação</span>
                  <select name="sit" defaultValue={sp.sit ?? ""} className="campo">
                    <option value="">Todas</option>
                    {SITUACOES_FIN.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
                  </select></label>
              </>
            )}
            <label><span className="rotulo">Ativo</span>
              <select name="ativo" defaultValue={sp.ativo ?? ""} className="campo">
                <option value="">Todos</option><option value="sim">Sim</option><option value="nao">Não</option>
              </select></label>
            {campos.map((c) => (
              <label key={c.id}><span className="rotulo">{c.nome}</span>
                {c.opcoes.length ? (
                  <select name={`ce_${c.id}`} defaultValue={sp[`ce_${c.id}`] ?? ""} className="campo">
                    <option value="">Todos</option>{c.opcoes.map((o) => <option key={o}>{o}</option>)}
                  </select>
                ) : <input name={`ce_${c.id}`} defaultValue={sp[`ce_${c.id}`]} className="campo" />}
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button className="btn">Buscar</button>
            <a href={urlCom(cfg.base, {}, { busca: "1" })} className="btn-sec">Limpar</a>
          </div>
        </form>
      )}

      {excluindo ? <FormExcluirVarios papel={papel} plural={cfg.plural} voltar={cfg.base}>{tabela}</FormExcluirVarios> : tabela}
    </Pagina>
  );
}

/** Itens comuns do "Mais ações" (importar, exportar…). */
export function MaisAcoesPessoas({ papel, sp }: { papel: PapelPessoa; sp: ParamsLista }) {
  const cfg = PAPEIS[papel];
  const filtros = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && !["p", "pp", "busca", "excluir"].includes(k)) as [string, string][]).toString();
  return (
    <>
      <LinkSuspenso href={`${cfg.base}/importar`} icone="importar">Importar</LinkSuspenso>
      {papel !== "transportadora" && <LinkSuspenso href={`${cfg.base}/importar?origem=nfe`} icone="notas">Importar de notas fiscais</LinkSuspenso>}
      <a href={`/api/cadastros/exportar?papel=${papel}${filtros ? "&" + filtros : ""}`} className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100">Exportar {cfg.plural.toLowerCase()}</a>
      {papel === "cliente" && <a href={`/api/cadastros/exportar?papel=${papel}&so=emails${filtros ? "&" + filtros : ""}`} className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100">Exportar e-mails</a>}
      {papel === "cliente" && <LinkSuspenso href={urlCom(cfg.base, sp, { excluir: "1" })} icone="excluir">Excluir {cfg.plural.toLowerCase()}</LinkSuspenso>}
    </>
  );
}
