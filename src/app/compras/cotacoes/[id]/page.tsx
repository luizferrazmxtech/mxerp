import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { empresaDoDocumento } from "@/lib/empresa/atual";
import { comparativo } from "@/lib/compras/cotacoes";
import { anotarCotacaoAcao, cancelarCotacaoAcao, excluirCotacaoAcao } from "@/lib/compras/acoes";
import { excluirAnotacaoAcao } from "@/lib/orcamentos/acoes";
import { excluirAnexoAcao } from "@/lib/cadastros/acoes";
import { aplicarTags } from "@/lib/orcamentos/tipos";
import { SIT_COTACAO } from "@/lib/compras/tipos";
import { brl, dataSP, horaSP, num2, qtd } from "@/lib/ui/format";
import { Pagina } from "@/components/ui/Pagina";
import Suspenso from "@/components/ui/Suspenso";
import { LinkSuspenso } from "@/components/ui/BarraLista";
import BotaoAcao from "@/components/ui/BotaoAcao";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import Icone from "@/components/Icone";
import CopiarLink from "@/components/orcamentos/CopiarLink";
import FormAnotacaoOrc from "@/components/orcamentos/FormAnotacaoOrc";
import { FormAnexo } from "@/components/cadastros/FormsVer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visualizar cotação" };

const dia = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");

export default async function VerCotacao({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!(await prisma.cotacao.findUnique({ where: { id }, select: { id: true } }))) notFound();
  const { cotacao: c, melhor, totais } = await comparativo(id);
  const [empresa, modelo, anexos, anotacoes, compra] = await Promise.all([
    empresaDoDocumento(c.empresaId),
    prisma.modeloMensagem.findFirst({ where: { tipo: "COTACAO" }, orderBy: { padrao: "desc" } }),
    prisma.anexo.findMany({ where: { entidade: "COTACAO", entidadeId: id }, select: { id: true, nome: true, createdAt: true } }),
    prisma.anotacao.findMany({ where: { entidade: "COTACAO", entidadeId: id }, orderBy: { createdAt: "desc" } }),
    c.compraId ? prisma.compra.findUnique({ where: { id: c.compraId }, select: { id: true, numero: true } }) : null,
  ]);
  const usuarios = new Map((await prisma.usuario.findMany({ where: { id: { in: anotacoes.map((x) => x.usuarioId).filter((x): x is string => !!x) } }, select: { id: true, nome: true } })).map((u) => [u.id, u.nome]));
  const h = await headers();
  const origem = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const nomeEmpresa = empresa?.nomeFantasia || empresa?.razaoSocial || "MXTECH";
  const aberta = c.situacao === "ABERTA";
  const [rotulo, corSit] = SIT_COTACAO[c.situacao] ?? SIT_COTACAO.ABERTA;
  const base = `/compras/cotacoes/${id}`;
  const ABAS = [["comparativo", "Comparativo", "cotacao"], ["fornecedores", "Links dos fornecedores", "envios"], ["detalhes", "Detalhes", "detalhes"], ["anexos", "Anexos", "anexos"], ["anotacoes", "Interações", "anotacoes"]];
  const aba = ABAS.some(([k]) => k === sp.aba) ? sp.aba! : "comparativo";
  const respondidos = c.fornecedores.filter((f) => f.respondidoEm);
  const maisBarato = [...respondidos].sort((a, b) => totais.get(a.id)!.total - totais.get(b.id)!.total)[0];
  const msg = (f: (typeof c.fornecedores)[number]) => {
    const tags = { nome_fornecedor: f.fornecedor.nome, nome_cliente: f.fornecedor.nome, numero: String(c.numero), data: dia(c.data), prazo: dia(c.prazo), link: `${origem}/cotacao/${f.token}`, nome_empresa: nomeEmpresa };
    return { assunto: aplicarTags(modelo?.assunto ?? "Cotação de preços nº [numero]", tags), corpo: aplicarTags(modelo?.email ?? "Olá, [nome_fornecedor]! Pedimos a gentileza de informar seus preços para os itens da cotação nº [numero] neste link: [link]", tags) };
  };
  return (
    <Pagina titulo="Visualizar cotação" trilha={[{ rotulo: "Cotações", href: "/compras/cotacoes" }, { rotulo: "Visualizar" }]}>
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[18px]"><Icone nome="cotacao" size={18} /> Cotação #{c.numero} <span className={`pilula ${corSit}`}>{rotulo}</span></h2>
          <p className="text-[12px] text-slate-500">Criado em {c.createdAt.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" })}{c.criadoPorNome ? ` por ${c.criadoPorNome.toUpperCase()}` : ""}</p>
        </div>
        <div className="no-print ml-auto flex gap-2">
          <Suspenso direita classe="btn-laranja" botao={<><Icone nome="editar" size={15} /> Editar <Icone nome="abaixo" size={13} /></>}>
            {aberta && <LinkSuspenso href={`${base}/editar`} icone="editar">Editar cotação</LinkSuspenso>}
            {aberta && <BotaoAcao acao={cancelarCotacaoAcao.bind(null, id)} icone="fechar" confirmar="Cancelar esta cotação? Os fornecedores não poderão mais responder.">Cancelar cotação</BotaoAcao>}
            <BotaoExcluir acao={excluirCotacaoAcao.bind(null, id)} pergunta={`Excluir a cotação nº ${c.numero}?`} depois="/compras/cotacoes" rotulo="Excluir cotação" />
          </Suspenso>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <aside className="cartao h-fit p-4 text-[13px]">
          <div className="flex justify-between text-slate-500"><span>Cotação<br /><b className="text-slate-700">Nº {c.numero}</b></span><span className="text-right">Data<br /><b className="text-slate-700">{dia(c.data)}</b></span></div>
          <dl className="mt-3 space-y-1.5 border-t pt-2">
            <div className="flex"><span className="text-slate-500">Prazo</span><b className="ml-auto">{dia(c.prazo)}</b></div>
            <div className="flex"><span className="text-slate-500">Itens</span><b className="ml-auto">{c.itens.length}</b></div>
            <div className="flex"><span className="text-slate-500">Respostas</span><b className="ml-auto">{respondidos.length} de {c.fornecedores.length}</b></div>
            {maisBarato && <div className="flex gap-2"><span className="text-slate-500">Menor total</span><b className="ml-auto text-right text-emerald-700">{maisBarato.fornecedor.nome}<br />{brl(totais.get(maisBarato.id)!.total)}</b></div>}
            {compra && <div className="flex"><span className="text-slate-500">Compra</span><Link href={`/compras/${compra.id}`} className="ml-auto text-marca hover:underline">nº {compra.numero}</Link></div>}
            <div className="flex"><span className="text-slate-500">Loja</span><b className="ml-auto uppercase">{nomeEmpresa}</b></div>
          </dl>
        </aside>
        <section>
          <nav className="mb-3 flex flex-wrap gap-1">
            {ABAS.map(([k, r, i]) => <Link key={k} href={k === "comparativo" ? base : `${base}?aba=${k}`} className={`aba ${aba === k ? "aba-ativa" : ""}`}><Icone nome={i} size={14} /> {r}</Link>)}
          </nav>

          {aba === "comparativo" && (
            <div className="cartao overflow-x-auto">
              <table className="tabela">
                <thead>
                  <tr><th className="min-w-56">Item</th><th className="w-24 text-right">Qtd.</th>
                    {c.fornecedores.map((f) => <th key={f.id} className="min-w-40 text-right"><span className="uppercase">{f.fornecedor.nome}</span><div className="text-[11px] font-normal text-slate-500">{f.respondidoEm ? `respondeu ${dataSP(f.respondidoEm)}` : "aguardando resposta"}</div></th>)}</tr>
                </thead>
                <tbody>
                  {c.itens.map((i) => (
                    <tr key={i.id}>
                      <td>{i.nome}{i.detalhes && <div className="text-[11px] text-slate-500">{i.detalhes}</div>}</td>
                      <td className="text-right">{qtd(i.quantidade)} {i.unidade}</td>
                      {c.fornecedores.map((f) => {
                        const v = Number(f.respostas.find((r) => r.itemId === i.id)?.valorUnit ?? 0);
                        const top = melhor.get(i.id)?.fornecedorId === f.id;
                        return <td key={f.id} className={`text-right ${top ? "bg-emerald-50 font-semibold text-emerald-700" : ""}`}>{v > 0 ? <>{num2(v)}<div className="text-[11px] font-normal text-slate-500">total {num2(v * Number(i.quantidade))}</div></> : <span className="text-slate-400">—</span>}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="text-[13px]">
                  <tr><td colSpan={2} className="text-right text-slate-500">Itens</td>{c.fornecedores.map((f) => <td key={f.id} className="text-right">{num2(totais.get(f.id)!.itens)}</td>)}</tr>
                  <tr><td colSpan={2} className="text-right text-slate-500">Frete</td>{c.fornecedores.map((f) => <td key={f.id} className="text-right">{f.frete != null ? num2(f.frete) : "—"}</td>)}</tr>
                  <tr><td colSpan={2} className="text-right font-semibold">Total</td>{c.fornecedores.map((f) => <td key={f.id} className={`text-right font-semibold ${maisBarato?.id === f.id ? "text-emerald-700" : ""}`}>{f.respondidoEm ? brl(totais.get(f.id)!.total) : "—"}</td>)}</tr>
                  <tr><td colSpan={2} className="text-right text-slate-500">Prazo de entrega</td>{c.fornecedores.map((f) => <td key={f.id} className="text-right">{f.prazoEntrega ?? "—"}</td>)}</tr>
                  <tr><td colSpan={2} className="text-right text-slate-500">Condição</td>{c.fornecedores.map((f) => <td key={f.id} className="text-right">{f.condicao ?? "—"}</td>)}</tr>
                  <tr><td colSpan={2} className="text-right text-slate-500">Itens respondidos</td>{c.fornecedores.map((f) => <td key={f.id} className="text-right">{totais.get(f.id)!.completos} de {c.itens.length}</td>)}</tr>
                  {aberta && <tr><td colSpan={2}></td>{c.fornecedores.map((f) => <td key={f.id} className="text-right">{f.respondidoEm && <Link href={`/compras/adicionar?cotacao=${id}&f=${f.id}`} className="btn px-2 py-1 text-[12px]"><Icone nome="carrinho" size={12} /> Gerar compra</Link>}</td>)}</tr>}
                </tfoot>
              </table>
              {c.fornecedores.some((f) => f.observacao) && <div className="space-y-1 border-t p-3 text-[12px]">{c.fornecedores.filter((f) => f.observacao).map((f) => <div key={f.id}><b className="uppercase">{f.fornecedor.nome}:</b> {f.observacao}</div>)}</div>}
            </div>
          )}

          {aba === "fornecedores" && (
            <div className="space-y-2">
              {c.fornecedores.map((f) => {
                const m = msg(f);
                const fone = (f.celular ?? f.fornecedor.celular ?? "").replace(/\D/g, "");
                return (
                  <div key={f.id} className="cartao p-4 text-[13px]">
                    <div className="mb-2 flex flex-wrap items-center gap-2"><b className="uppercase">{f.fornecedor.nome}</b><span className="text-slate-500">{f.email}{f.celular ? ` · ${f.celular}` : ""}</span>
                      <span className={`pilula ml-auto ${f.respondidoEm ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-orange-300 bg-orange-50 text-orange-700"}`}>{f.respondidoEm ? `Respondeu em ${dataSP(f.respondidoEm)} ${horaSP(f.respondidoEm)}` : "Aguardando resposta"}</span></div>
                    <CopiarLink url={`${origem}/cotacao/${f.token}`} />
                    <div className="mt-2 flex gap-2">
                      <a href={`mailto:${f.email}?subject=${encodeURIComponent(m.assunto)}&body=${encodeURIComponent(m.corpo)}`} className="btn-sec"><Icone nome="email" size={14} /> Por e-mail</a>
                      <a href={`https://wa.me/${fone.length >= 10 ? "55" + fone.replace(/^55/, "") : ""}?text=${encodeURIComponent(m.corpo)}`} target="_blank" rel="noreferrer" className="btn-sec"><Icone nome="whatsapp" size={14} /> Por WhatsApp</a>
                      <a href={`/cotacao/${f.token}`} target="_blank" className="btn-sec"><Icone nome="olho" size={14} /> Ver como o fornecedor</a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {aba === "detalhes" && (
            <div className="cartao space-y-2 p-4 text-[13px]">
              <div><b>Observações para o fornecedor:</b> <span className="whitespace-pre-wrap">{c.observacoes ?? "—"}</span></div>
              <div className="border-t pt-2"><b>Observações internas:</b> <span className="whitespace-pre-wrap">{c.observacaoInterna ?? "—"}</span></div>
            </div>
          )}

          {aba === "anexos" && (
            <div className="cartao p-4">
              <FormAnexo entidade="COTACAO" entidadeId={id} caminho={`${base}?aba=anexos`} />
              {anexos.length ? (
                <table className="tabela"><tbody>{anexos.map((a) => <tr key={a.id}><td><a href={`/api/cadastros/anexo/${a.id}`} className="text-marca hover:underline">{a.nome}</a></td><td className="w-36">{dataSP(a.createdAt)}</td>
                  <td className="w-12 text-right"><BotaoExcluir acao={excluirAnexoAcao.bind(null, a.id)} pergunta={`Excluir o anexo ${a.nome}?`} /></td></tr>)}</tbody></table>
              ) : <p className="text-[13px] text-slate-500">Nenhum anexo.</p>}
            </div>
          )}

          {aba === "anotacoes" && (
            <div className="cartao p-4">
              <FormAnotacaoOrc id={id} caminho={`${base}?aba=anotacoes`} acao={anotarCotacaoAcao} sobre="a cotação" />
              <div className="space-y-2">
                {anotacoes.map((x) => (
                  <div key={x.id} className="rounded border border-slate-200 bg-[#fffdf3] p-3">
                    <div className="mb-1 flex items-center gap-2 text-[11px] text-slate-500"><b>{usuarios.get(x.usuarioId ?? "") ?? "—"}</b> · {dataSP(x.createdAt)} {horaSP(x.createdAt)}
                      <span className="ml-auto"><BotaoExcluir acao={excluirAnotacaoAcao.bind(null, x.id)} pergunta="Excluir esta anotação?" /></span></div>
                    <p className="whitespace-pre-wrap text-[13px]">{x.texto}</p>
                  </div>
                ))}
                {!anotacoes.length && <p className="text-[13px] text-slate-500">Nenhuma interação.</p>}
              </div>
            </div>
          )}
        </section>
      </div>
    </Pagina>
  );
}
