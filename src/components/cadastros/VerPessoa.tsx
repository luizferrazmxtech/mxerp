import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PAPEIS, SITUACOES_FIN, TIPOS_PESSOA, CONTRIBUINTES, situacoesFinanceiras, type PapelPessoa } from "@/lib/cadastros/pessoas";
import { excluirAnexoAcao, excluirAnotacaoAcao, excluirPessoaAcao } from "@/lib/cadastros/acoes";
import { SITUACOES_OS } from "@/lib/os/os";
import { cor } from "@/lib/orcamentos/tipos";
import { brl, data, dataSP, horaSP } from "@/lib/ui/format";
import { Pagina, Pilula } from "@/components/ui/Pagina";
import Suspenso from "@/components/ui/Suspenso";
import { LinkSuspenso, urlCom } from "@/components/ui/BarraLista";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import Icone from "@/components/Icone";
import { formatarDoc } from "./ListaPessoas";
import { BotaoAreaCliente, FormAnexo, FormAnotacao } from "./FormsVer";
import { cadaPalavra, contem } from "@/lib/busca/palavras";
import { boletoAbrivel } from "@/lib/financeiro/lista";
import { ATIVOS } from "@/lib/financeiro/boletos";
import Resumo from "@/components/ui/Resumo";

type Sp = { aba?: string; t?: string; per?: string; qt?: string };

const ABAS_CLIENTE = [
  { chave: "transacoes", rotulo: "Transações", icone: "dinheiro" }, { chave: "envios", rotulo: "Envios", icone: "envios" },
  { chave: "eventos", rotulo: "Eventos", icone: "eventos" }, { chave: "serasa", rotulo: "Serasa", icone: "serasa" },
  { chave: "anexos", rotulo: "Anexos", icone: "anexos" }, { chave: "anotacoes", rotulo: "Anotações", icone: "anotacoes" },
  { chave: "detalhes", rotulo: "Detalhes", icone: "detalhes" },
];
const ABAS_OUTROS = [
  { chave: "transacoes", rotulo: "Transações", icone: "dinheiro" }, { chave: "anexos", rotulo: "Anexos", icone: "anexos" },
  { chave: "anotacoes", rotulo: "Anotações", icone: "anotacoes" }, { chave: "detalhes", rotulo: "Detalhes", icone: "detalhes" },
];
const PERIODOS = [
  { v: "", r: "Todo o período" }, { v: "mes", r: "Este mês" }, { v: "30", r: "Últimos 30 dias" }, { v: "90", r: "Últimos 90 dias" }, { v: "ano", r: "Este ano" },
];
function desde(per?: string): Date | undefined {
  const h = new Date();
  if (per === "mes") return new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), 1));
  if (per === "ano") return new Date(Date.UTC(h.getUTCFullYear(), 0, 1));
  if (per === "30" || per === "90") return new Date(h.getTime() - Number(per) * 86400000);
  return undefined;
}
const tamanho = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

function Vazio({ icone, titulo, texto }: { icone: string; titulo: string; texto: string }) {
  return (
    <div className="flex flex-col items-center py-14 text-center text-slate-500">
      <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100"><Icone nome={icone} size={26} /></span>
      <div className="text-[16px] font-semibold text-slate-700">{titulo}</div>
      <p className="mt-1 max-w-md text-[13px]">{texto}</p>
    </div>
  );
}

function Ficha({ itens }: { itens: [string, React.ReactNode][] }) {
  return (
    <dl className="space-y-1 text-[13px]">
      {itens.map(([k, v]) => <div key={k}><dt className="inline font-semibold">{k}: </dt><dd className="inline break-words">{v || ""}</dd></div>)}
    </dl>
  );
}

export default async function VerPessoa({ papel, id, sp }: { papel: PapelPessoa; id: string; sp: Sp }) {
  const cfg = PAPEIS[papel];
  const p = await prisma.pessoa.findFirst({
    where: { id, [papel]: true },
    omit: { foto: true },
    include: { enderecos: { orderBy: { ordem: "asc" } }, contatos: { orderBy: { ordem: "asc" } }, vendedor: { select: { nome: true } }, criadoPor: { select: { nome: true } } },
  });
  if (!p) return <Pagina titulo={`Visualizar ${cfg.rotulo.toLowerCase()}`} trilha={[{ rotulo: cfg.plural, href: cfg.base }, { rotulo: "Visualizar" }]}><p>Cadastro não encontrado.</p></Pagina>;
  const temFoto = (await prisma.$queryRaw<{ t: boolean }[]>`SELECT foto IS NOT NULL AS t FROM "Pessoa" WHERE id = ${id}`)[0]?.t;
  const abas = papel === "cliente" ? ABAS_CLIENTE : ABAS_OUTROS;
  const aba = abas.some((a) => a.chave === sp.aba) ? sp.aba! : "transacoes";
  const base = `${cfg.base}/${id}`;
  const tipoLanc = papel === "cliente" ? "RECEBER" : "PAGAR";
  const sitFin = papel === "cliente" ? (await situacoesFinanceiras([id])).get(id) : null;
  const sit = sitFin ? SITUACOES_FIN.find((s) => s.valor === sitFin)! : null;
  const tipo = TIPOS_PESSOA.find((t) => t.valor === p.tipoPessoa)!;
  const pj = p.tipoPessoa === "JURIDICA";
  const ficha: [string, React.ReactNode][] = [
    [`Tipo de ${cfg.rotulo.toLowerCase()}`, tipo.rotulo],
    ...(pj ? [
      ["Razão social", p.nome], ["CNPJ", formatarDoc(p.documento)], ["Inscrição estadual", p.inscricaoEstadual],
      ["Tipo de contribuinte", CONTRIBUINTES.find((c) => c.valor === p.contribuinteIcms)?.rotulo], ["Inscrição municipal", p.inscricaoMunicipal],
      ["Inscrição SUFRAMA", p.suframa], ["Responsável", p.responsavel],
    ] as [string, React.ReactNode][] : p.tipoPessoa === "FISICA" ? [
      ["CPF", formatarDoc(p.documento)], ["Nome social", p.nomeSocial], ["RG", p.rg], ["Nascimento", p.nascimento ? data(p.nascimento) : ""],
    ] as [string, React.ReactNode][] : [["Documento", p.documento]] as [string, React.ReactNode][]),
    ["Telefone", p.telefone],
    ["Celular", p.celular ? <span className="inline-flex items-center gap-1">{p.celular}
      <a href={`https://wa.me/55${p.celular.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="text-emerald-600" title="WhatsApp"><Icone nome="whatsapp" size={13} /></a></span> : ""],
    ["E-mail", p.email], ["País", p.pais],
    ...(papel === "cliente" ? [["Vendedor", p.vendedor?.nome]] as [string, React.ReactNode][] : []),
  ];

  return (
    <Pagina voltar={cfg.base} titulo={`Visualizar ${cfg.rotulo.toLowerCase()}`} trilha={[{ rotulo: cfg.plural, href: cfg.base }, { rotulo: "Visualizar" }]}>
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[18px]"><Icone nome={cfg.icone} size={18} /> {cfg.rotulo} #{p[cfg.codigo] ?? "—"} {sit && <Pilula rotulo={sit.rotulo} cor={sit.cor} />}
            {!p.ativo && <Pilula rotulo="Inativo" cor="border-red-300 bg-red-50 text-red-700" />}</h2>
          <p className="text-[12px] text-slate-500">Criado em {p.createdAt.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" })}{p.criadoPor ? ` por ${p.criadoPor.nome.toUpperCase()}` : ""}</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Link href={`${base}/editar`} className="btn-laranja"><Icone nome="editar" size={15} /> Editar cadastro</Link>
          {papel === "cliente" && <BotaoAreaCliente id={id} habilitada={p.areaCliente} />}
          <Suspenso direita classe="btn-sec px-2" botao={<Icone nome="opcoes" size={15} />}>
            {papel === "cliente" && <LinkSuspenso href={`/vendas/adicionar?cliente=${id}`} icone="vendas">Nova venda</LinkSuspenso>}
            {papel === "cliente" && <LinkSuspenso href={`/os/adicionar?cliente=${id}`} icone="os">Nova OS</LinkSuspenso>}
            {papel === "cliente" && <LinkSuspenso href={`/chamados/novo?cliente=${id}`} icone="atendimento">Novo chamado</LinkSuspenso>}
            <BotaoExcluir acao={excluirPessoaAcao.bind(null, papel, id)} pergunta={`Excluir ${p.nome}?`} depois={cfg.base} rotulo="Excluir" />
          </Suspenso>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <aside className="cartao h-fit p-4">
          <div className="mb-3 flex flex-col items-center text-center">
            {temFoto
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={`/api/cadastros/foto/pessoa/${id}`} alt="" className="mb-2 h-36 w-36 rounded object-cover" />
              : <span className="mb-2 flex h-36 w-36 items-center justify-center rounded bg-slate-200 text-slate-400"><Icone nome="pessoa" size={72} /></span>}
            <div className="font-semibold uppercase">{p.fantasia ?? p.nome}</div>
            <div className="text-[12px] text-slate-500">{formatarDoc(p.documento)}</div>
          </div>
          <div className="border-t pt-3"><Ficha itens={ficha} /></div>
          <div className="mt-3 border-t pt-2 text-[11px] text-slate-500">
            <Icone nome="relogio" size={11} className="inline" /> Atualizado em {dataSP(p.updatedAt)} {horaSP(p.updatedAt)}
            <Link href={`${base}/editar`} className="ml-2 text-marca hover:underline">Editar {cfg.rotulo.toLowerCase()}</Link>
          </div>
        </aside>

        <section>
          <nav className="mb-3 flex flex-wrap gap-1">
            {abas.map((a) => (
              <Link key={a.chave} href={a.chave === "transacoes" ? base : `${base}?aba=${a.chave}`} className={`aba ${aba === a.chave ? "aba-ativa" : ""}`}>
                <Icone nome={a.icone} size={14} /> {a.rotulo}
              </Link>
            ))}
          </nav>
          {aba === "transacoes" && <Transacoes papel={papel} id={id} sp={sp} base={base} tipoLanc={tipoLanc} />}
          {aba === "envios" && <div className="cartao"><Vazio icone="envios" titulo="Nenhum envio registrado" texto="Os e-mails e mensagens enviados ao cliente (orçamentos, OS, boletos, notas) aparecem aqui." /></div>}
          {aba === "eventos" && <div className="cartao"><Vazio icone="eventos" titulo="Nenhum evento cadastrado" texto="Compromissos e lembretes da agenda ligados a este cliente aparecem aqui." /></div>}
          {aba === "serasa" && <div className="cartao"><Vazio icone="serasa" titulo="Nenhuma consulta realizada" texto="A consulta de CPF/CNPJ na Serasa depende da contratação da integração." /></div>}
          {aba === "anexos" && <Anexos id={id} base={base} />}
          {aba === "anotacoes" && <Anotacoes id={id} base={base} />}
          {aba === "detalhes" && <Detalhes p={p} papel={papel} />}
        </section>
      </div>
    </Pagina>
  );
}

async function Transacoes({ papel, id, sp, base, tipoLanc }: { papel: PapelPessoa; id: string; sp: Sp; base: string; tipoLanc: "RECEBER" | "PAGAR" }) {
  const t = sp.t ?? (papel === "cliente" ? "recebimentos" : "pagamentos");
  const tipos = papel === "cliente"
    ? [{ v: "recebimentos", r: "Recebimentos" }, { v: "vendas", r: "Vendas" }, { v: "os", r: "Ordens de serviço" }]
    : [{ v: "pagamentos", r: "Pagamentos" }, ...(papel === "fornecedor" ? [{ v: "compras", r: "Compras" }] : [])];
  const ini = desde(sp.per);
  const hoje = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) + "T00:00:00Z");
  const params = { aba: undefined, t: sp.t, per: sp.per, qt: sp.qt };

  const todos = await prisma.lancamento.findMany({ where: { pessoaId: id, tipo: tipoLanc }, select: { valor: true, valorPago: true, pagoEm: true, vencimento: true } });
  const soma = (l: typeof todos) => l.reduce((s, x) => s + Number(x.pagoEm ? x.valorPago ?? x.valor : x.valor), 0);
  const cards = [
    { r: "Vencidos", v: soma(todos.filter((x) => !x.pagoEm && x.vencimento < hoje)), s: "Valores que já venceram", k: "vermelho" as const, i: "atrasado" },
    { r: "A vencer", v: soma(todos.filter((x) => !x.pagoEm && x.vencimento >= hoje)), s: "Valores a vencer", k: "amarelo" as const, i: "hoje" },
    { r: "Pagos", v: soma(todos.filter((x) => x.pagoEm)), s: "Valores já quitados", k: "verde" as const, i: "confirmado" },
    { r: "Em aberto", v: soma(todos.filter((x) => !x.pagoEm)), s: "Valores ainda pendentes", k: "azul" as const, i: "lista" },
  ];
  const totalCards = soma(todos);

  type Card = { id: string; icone: string; titulo: string; href?: string; origem?: { rotulo: string; href: string }; boleto?: string | null; pilula: { r: string; c: string }; extra?: string; data: Date; valor: number };
  let lista: Card[] = [];
  const q = sp.qt?.trim();
  if (t === "recebimentos" || t === "pagamentos") {
    const w: Prisma.LancamentoWhereInput = { pessoaId: id, tipo: tipoLanc, ...(ini ? { vencimento: { gte: ini } } : {}), AND: cadaPalavra(q, (p): Prisma.LancamentoWhereInput[] => [{ descricao: contem(p) }]) };
    const ls = await prisma.lancamento.findMany({ where: w, include: { formaPagamento: { select: { nome: true } }, boletos: { select: { id: true, situacao: true }, orderBy: { createdAt: "desc" } } }, orderBy: { vencimento: "desc" }, take: 100 });
    const nums = new Map<string, string>();
    const os = await prisma.ordemServico.findMany({ where: { id: { in: ls.filter((l) => l.origemTipo === "OS").map((l) => l.origemId!) } }, select: { id: true, numero: true } });
    const vs = await prisma.venda.findMany({ where: { id: { in: ls.filter((l) => l.origemTipo === "VENDA").map((l) => l.origemId!) } }, select: { id: true, numero: true } });
    os.forEach((o) => nums.set(o.id, `Ordem de serviço de nº ${o.numero}`));
    vs.forEach((v) => nums.set(v.id, `Venda de nº ${v.numero}`));
    lista = ls.map((l) => ({
      id: l.id,
      icone: l.origemTipo === "OS" ? "os" : l.origemTipo === "VENDA" ? "notas" : "dinheiro",
      titulo: `${(l.origemId && nums.get(l.origemId)) || l.descricao}${l.totalParcelas > 1 ? ` · parcela ${l.parcela}/${l.totalParcelas}` : ""}`,
      // abre o recebimento/pagamento em si; a venda ou OS de origem fica num link à parte
      href: `/financeiro/lancamentos/${l.id}`,
      origem: l.origemId && (l.origemTipo === "OS" || l.origemTipo === "VENDA")
        ? { rotulo: l.origemTipo === "OS" ? "Abrir a OS" : "Abrir a venda", href: `${l.origemTipo === "OS" ? "/os" : "/vendas"}/${l.origemId}?conta=${l.id}` } : undefined,
      boleto: l.tipo === "RECEBER" ? boletoAbrivel(l.boletos.find((b) => ATIVOS.includes(b.situacao))) : null,
      pilula: l.pagoEm ? { r: "Confirmado", c: "border-emerald-300 bg-emerald-50 text-emerald-700" } : l.vencimento < hoje ? { r: "Atrasado", c: "border-red-300 bg-red-50 text-red-700" } : { r: "Em aberto", c: "border-slate-300 bg-white text-slate-600" },
      extra: l.formaPagamento?.nome ?? undefined,
      data: l.pagoEm ?? l.vencimento,
      valor: Number(l.pagoEm ? l.valorPago ?? l.valor : l.valor),
    }));
  } else if (t === "vendas") {
    const n = Number(q);
    const vs = await prisma.venda.findMany({ where: { clienteId: id, ...(ini ? { data: { gte: ini } } : {}), ...(q && Number.isInteger(n) ? { numero: n } : {}) }, orderBy: { data: "desc" }, take: 100, include: { situacaoCfg: { select: { nome: true, cor: true } } } });
    lista = vs.map((v) => ({ id: v.id, icone: "notas", titulo: `${v.tipo === "BALCAO" ? "Venda balcão" : "Venda"} de nº ${v.numero}`, href: `/vendas/${v.id}`, pilula: { r: v.situacaoCfg?.nome ?? v.situacao, c: cor(v.situacaoCfg?.cor ?? "cinza").pilula }, data: v.data, valor: Number(v.total) }));
  } else if (t === "os") {
    const n = Number(q);
    const os = await prisma.ordemServico.findMany({ where: { clienteId: id, ...(ini ? { entrada: { gte: ini } } : {}), ...(q && Number.isInteger(n) ? { numero: n } : {}) }, orderBy: { entrada: "desc" }, take: 100 });
    const s = new Map(SITUACOES_OS.map((x) => [x.valor, x]));
    lista = os.map((o) => ({ id: o.id, icone: "os", titulo: `Ordem de serviço de nº ${o.numero}`, href: `/os/${o.id}`, pilula: { r: s.get(o.situacao)!.rotulo, c: s.get(o.situacao)!.cor }, data: o.entrada, valor: Number(o.total) }));
  } else if (t === "compras") {
    const cs = await prisma.compra.findMany({ where: { fornecedorId: id, ...(ini ? { data: { gte: ini } } : {}) }, orderBy: { data: "desc" }, take: 100 });
    lista = cs.map((c) => ({ id: c.id, icone: "carrinho", titulo: `Compra de nº ${c.numero}`, href: `/compras/${c.id}`, pilula: { r: "Confirmado", c: "border-emerald-300 bg-emerald-50 text-emerald-700" }, data: c.data, valor: Number(c.total) }));
  }
  const rotT = tipos.find((x) => x.v === t)?.r ?? tipos[0].r;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Suspenso classe="btn" botao={<><Icone nome="lista" size={14} /> {rotT} <Icone nome="abaixo" size={13} /></>}>
          {tipos.map((x) => <LinkSuspenso key={x.v} href={urlCom(base, params, { t: x.v, qt: undefined })}>{x.r}</LinkSuspenso>)}
        </Suspenso>
        <form action={base} className="ml-auto flex">
          {sp.t && <input type="hidden" name="t" value={sp.t} />}
          {sp.per && <input type="hidden" name="per" value={sp.per} />}
          <input name="qt" defaultValue={sp.qt} placeholder={`Buscar ${rotT.toLowerCase().replace(/s$/, "")}`} className="campo w-56 rounded-r-none sm:w-72" />
          <button className="btn rounded-l-none px-2.5"><Icone nome="buscar" size={15} /></button>
        </form>
        <Suspenso direita classe="btn" botao={<><Icone nome="calendario" size={14} /> {PERIODOS.find((x) => x.v === (sp.per ?? ""))?.r} <Icone nome="abaixo" size={13} /></>}>
          {PERIODOS.map((x) => <LinkSuspenso key={x.v} href={urlCom(base, params, { per: x.v || undefined })}>{x.r}</LinkSuspenso>)}
        </Suspenso>
      </div>
      {/* mesmos cartões de resumo das listas (ícone, valor, anel com o percentual do total) */}
      <Resumo cartoes={cards.map((c) => ({ rotulo: c.r, valor: brl(c.v), legenda: c.s, icone: c.i, cor: c.k, pct: totalCards > 0 ? (c.v / totalCards) * 100 : 0 }))} />
      <div className="space-y-2">
        {lista.map((c) => (
          <div key={c.id} className="cartao flex items-center gap-3 px-4 py-3">
            <Icone nome={c.icone} size={20} className="text-slate-600" />
            <div className="min-w-0 flex-1">
              <div className="text-[14px]">{c.href ? <Link href={c.href} className="hover:underline">{c.titulo}</Link> : c.titulo}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                <Pilula rotulo={c.pilula.r} cor={c.pilula.c} />
                {c.extra && <span className="flex items-center gap-1"><Icone nome="cartao" size={11} /> {c.extra}</span>}
                <span className="flex items-center gap-1"><Icone nome="calendario" size={11} /> {data(c.data)}</span>
                <span className="flex items-center gap-1"><Icone nome="dinheiro" size={11} /> {brl(c.valor)}</span>
                {c.origem && <Link href={c.origem.href} className="flex items-center gap-1 text-marca hover:underline"><Icone nome="vendas" size={11} /> {c.origem.rotulo.replace("Abrir a ", "")}</Link>}
                {c.boleto && <a href={c.boleto} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-marca hover:underline"><Icone nome="boleto" size={11} /> boleto</a>}
              </div>
            </div>
            {c.href && (
              <Suspenso direita classe="btn-icone border-0" botao={<Icone nome="opcoes" size={15} />}>
                <LinkSuspenso href={c.href} icone="ver">Visualizar</LinkSuspenso>
                {c.origem && <LinkSuspenso href={c.origem.href} icone="vendas">{c.origem.rotulo}</LinkSuspenso>}
                {c.boleto && <a href={c.boleto} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100"><Icone nome="boleto" size={15} /> Abrir boleto</a>}
              </Suspenso>
            )}
          </div>
        ))}
        {!lista.length && <div className="cartao"><Vazio icone="dinheiro" titulo={`Nenhum registro em ${rotT.toLowerCase()}`} texto="Troque o tipo de transação ou o período para ver outros registros." /></div>}
      </div>
    </div>
  );
}

async function Anexos({ id, base }: { id: string; base: string }) {
  const lista = await prisma.anexo.findMany({ where: { entidade: "PESSOA", entidadeId: id }, select: { id: true, nome: true, tamanho: true, createdAt: true }, orderBy: { createdAt: "desc" } });
  return (
    <div className="cartao p-4">
      <FormAnexo entidade="PESSOA" entidadeId={id} caminho={base} />
      {lista.length ? (
        <table className="tabela"><thead><tr><th>Arquivo</th><th className="w-24">Tamanho</th><th className="w-36">Enviado em</th><th className="w-20"></th></tr></thead>
          <tbody>{lista.map((a) => (
            <tr key={a.id}>
              <td><a href={`/api/cadastros/anexo/${a.id}`} className="text-marca hover:underline">{a.nome}</a></td>
              <td>{tamanho(a.tamanho)}</td><td>{dataSP(a.createdAt)} {horaSP(a.createdAt)}</td>
              <td className="text-right"><BotaoExcluir acao={excluirAnexoAcao.bind(null, a.id)} pergunta={`Excluir o anexo ${a.nome}?`} /></td>
            </tr>))}
          </tbody></table>
      ) : <Vazio icone="anexos" titulo="Nenhum anexo" texto="Contratos, documentos e fotos do cadastro ficam guardados aqui." />}
    </div>
  );
}

async function Anotacoes({ id, base }: { id: string; base: string }) {
  const lista = await prisma.pessoaAnotacao.findMany({ where: { pessoaId: id }, include: { usuario: { select: { nome: true } } }, orderBy: { createdAt: "desc" } });
  return (
    <div className="cartao p-4">
      <FormAnotacao pessoaId={id} caminho={base} />
      <div className="space-y-2">
        {lista.map((a) => (
          <div key={a.id} className="rounded border border-slate-200 bg-[#fffdf3] p-3">
            <div className="mb-1 flex items-center gap-2 text-[11px] text-slate-500">
              <b>{a.usuario?.nome ?? "—"}</b> · {dataSP(a.createdAt)} {horaSP(a.createdAt)}
              <span className="ml-auto"><BotaoExcluir acao={excluirAnotacaoAcao.bind(null, a.id)} pergunta="Excluir esta anotação?" /></span>
            </div>
            <p className="whitespace-pre-wrap text-[13px]">{a.texto}</p>
          </div>
        ))}
        {!lista.length && <Vazio icone="anotacoes" titulo="Nenhuma anotação" texto="Registre aqui conversas, combinados e observações sobre o cliente." />}
      </div>
    </div>
  );
}

async function Detalhes({ p, papel }: {
  papel: PapelPessoa;
  p: Prisma.PessoaGetPayload<{ omit: { foto: true }; include: { enderecos: true; contatos: true; vendedor: { select: { nome: true } }; criadoPor: { select: { nome: true } } } }>;
}) {
  const campos = papel === "cliente" ? await prisma.campoExtra.findMany({ where: { entidade: "CLIENTE" }, orderBy: [{ ordem: "asc" }, { nome: "asc" }] }) : [];
  const ce = (p.camposExtras ?? {}) as Record<string, string | string[]>;
  return (
    <div className="space-y-3">
      <div className="cartao p-4">
        <h3 className="mb-2 font-semibold">Endereços</h3>
        {p.enderecos.length ? p.enderecos.map((e) => (
          <p key={e.id} className="mb-1 text-[13px]"><b>{e.tipo ?? "Endereço"}:</b> {[e.logradouro, e.numero, e.complemento, e.bairro, e.cidade && `${e.cidade}/${e.uf ?? ""}`, e.cep && `CEP ${e.cep.replace(/^(\d{5})(\d{3})$/, "$1-$2")}`].filter(Boolean).join(", ")}</p>
        )) : <p className="text-[13px] text-slate-500">Nenhum endereço cadastrado.</p>}
      </div>
      <div className="cartao p-4">
        <h3 className="mb-2 font-semibold">Contatos</h3>
        {p.contatos.length ? (
          <table className="tabela"><thead><tr><th>Tipo</th><th>Nome</th><th>Contato</th><th>Cargo</th><th>Observação</th></tr></thead>
            <tbody>{p.contatos.map((c) => <tr key={c.id}><td>{c.tipo}</td><td>{c.nome}</td><td>{c.contato}</td><td>{c.cargo}</td><td>{c.observacao}</td></tr>)}</tbody></table>
        ) : <p className="text-[13px] text-slate-500">Nenhum contato adicional.</p>}
      </div>
      {papel === "cliente" && (
        <div className="cartao p-4 text-[13px]">
          <h3 className="mb-2 font-semibold">Limite de crédito</h3>
          {p.limiteCredito != null ? <>{brl(p.limiteCredito)} · {p.excederLimite ? "pode exceder o limite" : "não pode exceder o limite"}</> : "Sem limite de crédito."}
          {p.fax && <p className="mt-2"><b>FAX:</b> {p.fax}</p>}
          {p.site && <p><b>Site:</b> {p.site}</p>}
        </div>
      )}
      {campos.length > 0 && (
        <div className="cartao p-4 text-[13px]">
          <h3 className="mb-2 font-semibold">Campos extras</h3>
          {campos.map((c) => <p key={c.id}><b>{c.nome}:</b> {Array.isArray(ce[c.id]) ? (ce[c.id] as string[]).join(", ") : String(ce[c.id] ?? "")}</p>)}
        </div>
      )}
      <div className="cartao p-4 text-[13px]">
        <h3 className="mb-2 font-semibold">Observações</h3>
        <p className="whitespace-pre-wrap">{p.observacoes || <span className="text-slate-500">Sem observações.</span>}</p>
      </div>
    </div>
  );
}
