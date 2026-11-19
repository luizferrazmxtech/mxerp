import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { excluirAnotacaoAcao } from "@/lib/orcamentos/acoes";
import { anotarAjusteAcao } from "@/lib/compras/acoes";
import { brl, dataSP, horaSP, num2, qtd } from "@/lib/ui/format";
import { Pagina } from "@/components/ui/Pagina";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import Icone from "@/components/Icone";
import FormAnotacaoOrc from "@/components/orcamentos/FormAnotacaoOrc";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visualizar ajuste de estoque" };

export default async function VerAjuste({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const a = await prisma.ajusteEstoque.findUnique({ where: { id }, include: { itens: { orderBy: { ordem: "asc" }, include: { produto: { select: { id: true, codigo: true, nome: true, unidade: true } } } } } });
  if (!a) notFound();
  const [empresa, anotacoes, inventario, locais] = await Promise.all([
    prisma.empresa.findFirst({ select: { nomeFantasia: true, razaoSocial: true } }),
    prisma.anotacao.findMany({ where: { entidade: "AJUSTE", entidadeId: id }, orderBy: { createdAt: "desc" } }),
    a.inventarioId ? prisma.inventario.findUnique({ where: { id: a.inventarioId }, select: { id: true, numero: true, descricao: true } }) : null,
    prisma.local.findMany({ where: { id: { in: a.itens.map((i) => i.localId).filter((x): x is string => !!x) } }, select: { id: true, codigo: true } }),
  ]);
  const usuarios = new Map((await prisma.usuario.findMany({ where: { id: { in: anotacoes.map((x) => x.usuarioId).filter((x): x is string => !!x) } }, select: { id: true, nome: true } })).map((u) => [u.id, u.nome]));
  const localDe = new Map(locais.map((l) => [l.id, l.codigo]));
  const saida = a.tipo === "SAIDA";
  const base = `/estoque/ajustes/${id}`;
  const aba = sp.aba === "anotacoes" ? "anotacoes" : "produtos";
  return (
    <Pagina titulo="Visualizar ajuste de estoque" trilha={[{ rotulo: "Ajustes de estoque", href: "/estoque/ajustes" }, { rotulo: "Visualizar" }]}>
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[18px]"><Icone nome="estoque" size={18} /> Ajuste de estoque #{a.numero}
            <span className={`pilula ${saida ? "border-red-300 bg-red-50 text-red-700" : "border-emerald-300 bg-emerald-50 text-emerald-700"}`}>{saida ? "Saída" : "Entrada"}</span></h2>
          <p className="text-[12px] text-slate-500">Criado em {a.createdAt.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" })}{a.criadoPorNome ? ` por ${a.criadoPorNome.toUpperCase()}` : ""}</p>
        </div>
        <div className="no-print ml-auto flex gap-2">
          <Link href={`/estoque/ajustes/adicionar?clonar=${id}`} className="btn-sec"><Icone nome="copiar" size={15} /> Clonar</Link>
          <a href={`${base}/imprimir`} target="_blank" className="btn"><Icone nome="imprimir" size={15} /> Imprimir</a>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <aside className="cartao h-fit p-4 text-[13px]">
          <div className="text-slate-500">Valor total</div>
          <div className="mb-2 text-[26px] font-semibold text-marca">{brl(a.total)}</div>
          <dl className="space-y-1.5 border-t pt-2">
            <div className="flex"><span className="text-slate-500">Loja</span><b className="ml-auto uppercase">{empresa?.nomeFantasia || empresa?.razaoSocial}</b></div>
            <div className="flex"><span className="text-slate-500">Frete</span><b className="ml-auto">{brl(a.frete)}</b></div>
            <div className="flex"><span className="text-slate-500">Itens</span><b className="ml-auto">{a.itens.length} produto{a.itens.length === 1 ? "" : "s"}</b></div>
            {inventario && <div className="flex gap-2"><span className="text-slate-500">Inventário</span><Link href={`/estoque/inventarios/${inventario.id}`} className="ml-auto text-right text-marca hover:underline">nº {inventario.numero} · {inventario.descricao}</Link></div>}
          </dl>
          {a.observacoes && <p className="mt-2 border-t pt-2 whitespace-pre-wrap"><b>Observações:</b> {a.observacoes}</p>}
        </aside>
        <section>
          <nav className="mb-3 flex flex-wrap gap-1">
            <Link href={base} className={`aba ${aba === "produtos" ? "aba-ativa" : ""}`}><Icone nome="produtos" size={14} /> Produtos</Link>
            <Link href={`${base}?aba=anotacoes`} className={`aba ${aba === "anotacoes" ? "aba-ativa" : ""}`}><Icone nome="anotacoes" size={14} /> Interações</Link>
          </nav>
          {aba === "produtos" ? (
            <div className="cartao overflow-x-auto">
              <table className="tabela">
                <thead><tr><th>Produto</th><th>Local</th><th className="text-right">Quantidade</th><th className="text-right">Custo unit.</th><th className="text-right">Custo total</th></tr></thead>
                <tbody>{a.itens.map((i) => (
                  <tr key={i.id}>
                    <td><Link href={`/produtos/${i.produto.id}`} className="font-semibold uppercase sublinhado">{i.produto.nome}</Link><div className="font-mono text-[11px] text-slate-500">{i.produto.codigo}</div></td>
                    <td className="text-[12px] text-slate-600">{i.localId ? localDe.get(i.localId) : "—"}</td>
                    <td className={`text-right font-semibold ${saida ? "text-red-600" : "text-emerald-700"}`}>{saida ? "− " : "+ "}{qtd(i.quantidade)} {i.produto.unidade}</td>
                    <td className="text-right">{num2(i.custoUnit)}</td><td className="text-right">{num2(i.total)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : (
            <div className="cartao p-4">
              <FormAnotacaoOrc id={id} caminho={`${base}?aba=anotacoes`} acao={anotarAjusteAcao} sobre="o ajuste" />
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
