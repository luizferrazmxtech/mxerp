import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { estadoEstoqueVenda, SITUACOES_VENDA } from "@/lib/vendas/vendas";
import { garantirPadroes } from "@/lib/financeiro/padroes";
import { brl, data, dataHora, qtd } from "@/lib/ui/format";
import AdicionarProduto from "@/components/AdicionarProduto";
import { adicionarItem, removerItem } from "../actions";
import Fechamento from "./Fechamento";
import NotasDoDocumento from "@/components/NotasDoDocumento";

export const dynamic = "force-dynamic";

export default async function DetalheVenda({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await prisma.venda.findUnique({
    where: { id },
    include: { cliente: true, itens: { include: { produto: true } }, pagamentos: { include: { formaPagamento: true } } },
  });
  if (!v) notFound();
  await prisma.$transaction((tx) => garantirPadroes(tx));
  const [reservas, formas, lancamentos] = await Promise.all([
    prisma.reserva.findMany({ where: { origemTipo: "VENDA", origemId: id, status: { in: ["ATIVA", "BAIXADA"] } }, include: { local: true } }),
    prisma.formaPagamento.findMany({ where: { ativa: true }, orderBy: { nome: "asc" } }),
    prisma.lancamento.findMany({ where: { origemTipo: "VENDA", origemId: id }, orderBy: [{ vencimento: "asc" }] }),
  ]);
  const porItem = new Map<string, typeof reservas>();
  for (const r of reservas) porItem.set(r.origemItemId, [...(porItem.get(r.origemItemId) ?? []), r]);
  const sit = SITUACOES_VENDA.find((s) => s.valor === v.situacao)!;
  const editavel = v.situacao === "ABERTA" || v.situacao === "ORCAMENTO";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/vendas" className="text-sm text-slate-500 hover:underline">← Vendas</Link>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            {v.tipo === "BALCAO" ? "Venda balcão" : "Pedido"} #{v.numero}
            <span className={`rounded px-2 py-0.5 text-xs ${sit.cor}`}>{sit.rotulo}</span>
          </h1>
          <p className="text-sm text-slate-600">{v.cliente?.nome ?? "Consumidor"} · {dataHora(v.data)}</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">Total</div>
          <div className="text-2xl font-semibold">{brl(v.total)}</div>
        </div>
      </div>

      <section className="cartao">
        <h2 className="border-b px-4 py-3 font-semibold">Itens</h2>
        {editavel && (
          <div className="border-b p-4">
            <AdicionarProduto docId={id} acao={adicionarItem} rotuloBotao={estadoEstoqueVenda(v.situacao) === "RESERVADO" ? "Adicionar e reservar" : "Adicionar"} />
          </div>
        )}
        <table className="tabela">
          <thead><tr><th>Produto</th><th>Onde pegar</th><th className="text-right">Qtd</th><th className="text-right">Valor</th><th className="text-right">Subtotal</th><th></th></tr></thead>
          <tbody>
            {v.itens.map((i) => (
              <tr key={i.id}>
                <td><span className="font-mono text-xs text-slate-500">{i.produto.codigo}</span> {i.produto.nome}</td>
                <td className="text-xs">
                  {(porItem.get(i.id) ?? []).map((r) => (
                    <div key={r.id} className={r.local ? "" : "font-semibold text-red-600"}>
                      {r.local?.codigo ?? "EM FALTA"} · {qtd(r.quantidade)}{r.status === "BAIXADA" && <span className="text-slate-400"> (baixado)</span>}
                    </div>
                  ))}
                </td>
                <td className="text-right">{qtd(i.quantidade)}</td>
                <td className="text-right">{brl(i.valorUnit)}</td>
                <td className="text-right">{brl(i.subtotal)}</td>
                <td className="text-right">
                  {editavel && (
                    <form action={removerItem}>
                      <input type="hidden" name="vendaId" value={id} />
                      <input type="hidden" name="itemId" value={i.id} />
                      <button className="text-xs text-red-600 hover:underline">remover</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <Fechamento vendaId={id} situacao={v.situacao} total={Number(v.total)} formas={formas.map((f) => ({ id: f.id, nome: f.nome, diasPrazo: f.diasPrazo }))} />

      <NotasDoDocumento origemTipo="VENDA" origemId={id} podeEmitir={v.situacao === "CONCLUIDA"} />

      {lancamentos.length > 0 && (
        <section className="cartao">
          <h2 className="border-b px-4 py-3 font-semibold">Financeiro</h2>
          <table className="tabela">
            <thead><tr><th>Descrição</th><th>Vencimento</th><th className="text-right">Valor</th><th>Situação</th></tr></thead>
            <tbody>
              {lancamentos.map((l) => (
                <tr key={l.id}>
                  <td>{l.descricao}</td>
                  <td>{data(l.vencimento)}</td>
                  <td className="text-right">{brl(l.valor)}</td>
                  <td>{l.pagoEm ? <span className="text-emerald-700">recebido</span> : "a receber"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
