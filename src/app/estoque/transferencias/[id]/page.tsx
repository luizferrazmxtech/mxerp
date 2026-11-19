import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { excluirAnotacaoAcao } from "@/lib/orcamentos/acoes";
import { anotarTransferenciaAcao } from "@/lib/compras/acoes";
import { brl, dataSP, horaSP, num2, qtd } from "@/lib/ui/format";
import { Pagina } from "@/components/ui/Pagina";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import Icone from "@/components/Icone";
import FormAnotacaoOrc from "@/components/orcamentos/FormAnotacaoOrc";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visualizar transferência" };

export default async function VerTransferencia({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const t = await prisma.transferenciaEstoque.findUnique({ where: { id }, include: { itens: { orderBy: { ordem: "asc" }, include: { produto: { select: { id: true, codigo: true, nome: true, unidade: true } } } } } });
  if (!t) notFound();
  const [depositos, anotacoes] = await Promise.all([
    prisma.deposito.findMany({ where: { id: { in: [t.origemDepositoId, t.destinoDepositoId] } }, select: { id: true, nome: true } }),
    prisma.anotacao.findMany({ where: { entidade: "TRANSFERENCIA", entidadeId: id }, orderBy: { createdAt: "desc" } }),
  ]);
  const nome = new Map(depositos.map((d) => [d.id, d.nome]));
  const usuarios = new Map((await prisma.usuario.findMany({ where: { id: { in: anotacoes.map((x) => x.usuarioId).filter((x): x is string => !!x) } }, select: { id: true, nome: true } })).map((u) => [u.id, u.nome]));
  const base = `/estoque/transferencias/${id}`;
  const aba = sp.aba === "anotacoes" ? "anotacoes" : "produtos";
  return (
    <Pagina titulo="Visualizar transferência" trilha={[{ rotulo: "Transferências", href: "/estoque/transferencias" }, { rotulo: "Visualizar" }]}>
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[18px]"><Icone nome="transferir" size={18} /> Transferência #{t.numero}</h2>
          <p className="text-[12px] text-slate-500">Criado em {t.createdAt.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" })}{t.criadoPorNome ? ` por ${t.criadoPorNome.toUpperCase()}` : ""}</p>
        </div>
        <a href={`${base}/imprimir`} target="_blank" className="btn ml-auto"><Icone nome="imprimir" size={15} /> Imprimir</a>
      </div>
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <aside className="cartao h-fit p-4 text-[13px]">
          <div className="text-slate-500">Valor total</div>
          <div className="mb-2 text-[26px] font-semibold text-marca">{brl(t.total)}</div>
          <dl className="space-y-1.5 border-t pt-2">
            <div className="flex"><span className="text-slate-500">Origem</span><b className="ml-auto uppercase">{nome.get(t.origemDepositoId)}</b></div>
            <div className="flex"><span className="text-slate-500">Destino</span><b className="ml-auto uppercase">{nome.get(t.destinoDepositoId)}</b></div>
            <div className="flex"><span className="text-slate-500">Itens</span><b className="ml-auto">{t.itens.length} produto{t.itens.length === 1 ? "" : "s"}</b></div>
          </dl>
          {t.observacoes && <p className="mt-2 border-t pt-2 whitespace-pre-wrap"><b>Observações:</b> {t.observacoes}</p>}
        </aside>
        <section>
          <nav className="mb-3 flex flex-wrap gap-1">
            <Link href={base} className={`aba ${aba === "produtos" ? "aba-ativa" : ""}`}><Icone nome="produtos" size={14} /> Produtos</Link>
            <Link href={`${base}?aba=anotacoes`} className={`aba ${aba === "anotacoes" ? "aba-ativa" : ""}`}><Icone nome="anotacoes" size={14} /> Interações</Link>
          </nav>
          {aba === "produtos" ? (
            <div className="cartao overflow-x-auto">
              <table className="tabela">
                <thead><tr><th>Produto</th><th className="text-right">Quantidade</th><th className="text-right">Custo unit.</th><th className="text-right">Custo total</th></tr></thead>
                <tbody>{t.itens.map((i) => (
                  <tr key={i.id}>
                    <td><Link href={`/produtos/${i.produto.id}`} className="font-semibold uppercase sublinhado">{i.produto.nome}</Link><div className="font-mono text-[11px] text-slate-500">{i.produto.codigo}</div></td>
                    <td className="text-right">{qtd(i.quantidade)} {i.produto.unidade}</td><td className="text-right">{num2(i.custoUnit)}</td><td className="text-right">{num2(Number(i.custoUnit) * Number(i.quantidade))}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : (
            <div className="cartao p-4">
              <FormAnotacaoOrc id={id} caminho={`${base}?aba=anotacoes`} acao={anotarTransferenciaAcao} sobre="a transferência" />
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
