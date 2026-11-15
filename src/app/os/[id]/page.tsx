import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { estadoEstoque, SITUACOES_OS } from "@/lib/os/os";
import { brl, dataHora, qtd } from "@/lib/ui/format";
import { adicionarServico, alterarQuantidade, removerProduto, removerServico } from "../actions";
import AdicionarProduto from "./AdicionarProduto";
import MudarSituacao from "./MudarSituacao";

export const dynamic = "force-dynamic";

export default async function DetalheOs({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const os = await prisma.ordemServico.findUnique({
    where: { id },
    include: {
      cliente: true,
      tecnico: true,
      produtos: { include: { produto: true }, orderBy: { createdAt: "asc" } },
      servicos: { include: { servico: true }, orderBy: { createdAt: "asc" } },
      historico: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!os) notFound();

  const [reservas, servicos] = await Promise.all([
    prisma.reserva.findMany({
      where: { origemTipo: "OS", origemId: id, status: { in: ["ATIVA", "BAIXADA"] } },
      include: { local: true },
    }),
    prisma.servico.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
  ]);
  const porItem = new Map<string, typeof reservas>();
  for (const r of reservas) porItem.set(r.origemItemId, [...(porItem.get(r.origemItemId) ?? []), r]);
  const editavel = estadoEstoque(os.situacao) === "RESERVADO";
  const sit = SITUACOES_OS.find((s) => s.valor === os.situacao)!;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/os" className="text-sm text-slate-500 hover:underline">← Ordens de serviço</Link>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            OS #{os.numero}
            <span className={`rounded px-2 py-0.5 text-xs ${sit.cor}`}>{sit.rotulo}</span>
          </h1>
          <p className="text-sm text-slate-600">
            {os.cliente.nome} · entrada {dataHora(os.entrada)}{os.tecnico ? ` · técnico ${os.tecnico.nome}` : ""}
          </p>
          {os.equipamento && <p className="text-sm text-slate-600">Equipamento: {os.equipamento}</p>}
          {os.defeito && <p className="text-sm text-slate-600">Defeito: {os.defeito}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-right">
            <div className="text-xs text-slate-500">Total</div>
            <div className="text-2xl font-semibold">{brl(os.total)}</div>
            <div className="text-xs text-slate-500">Produtos {brl(os.totalProdutos)} · Serviços {brl(os.totalServicos)}</div>
          </div>
          <Link href={`/os/${id}/separacao`} className="btn-sec">Lista de separação</Link>
        </div>
      </div>

      <section className="cartao">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold">Produtos / peças</h2>
          {!editavel && <span className="text-xs text-slate-500">Estoque já baixado. Reabra a OS para alterar.</span>}
        </div>
        {editavel && <div className="border-b p-4"><AdicionarProduto osId={id} /></div>}
        <div className="overflow-x-auto">
          <table className="tabela">
            <thead><tr><th>Produto</th><th>Onde pegar</th><th className="text-right">Qtd</th><th className="text-right">Valor</th><th className="text-right">Subtotal</th><th></th></tr></thead>
            <tbody>
              {os.produtos.map((i) => {
                const rs = porItem.get(i.id) ?? [];
                return (
                  <tr key={i.id}>
                    <td><span className="font-mono text-xs text-slate-500">{i.produto.codigo}</span> {i.produto.nome}</td>
                    <td className="text-xs">
                      {rs.map((r) => (
                        <div key={r.id} className={r.local ? "" : "font-semibold text-red-600"}>
                          {r.local ? <span className="font-mono">{r.local.codigo}</span> : "EM FALTA"} · {qtd(r.quantidade)}
                          {r.status === "BAIXADA" && <span className="text-slate-400"> (baixado)</span>}
                          {r.separado && r.status === "ATIVA" && <span className="text-emerald-700"> ✓ separado</span>}
                        </div>
                      ))}
                    </td>
                    <td className="text-right">
                      {editavel ? (
                        <form action={alterarQuantidade} className="flex justify-end gap-1">
                          <input type="hidden" name="osId" value={id} />
                          <input type="hidden" name="itemId" value={i.id} />
                          <input name="quantidade" defaultValue={qtd(i.quantidade)} className="campo w-20 py-1 text-right" />
                          <button className="btn-sec px-2 py-1 text-xs">ok</button>
                        </form>
                      ) : qtd(i.quantidade)}
                    </td>
                    <td className="text-right">{brl(i.valorUnit)}</td>
                    <td className="text-right">{brl(i.subtotal)}</td>
                    <td className="text-right">
                      {editavel && (
                        <form action={removerProduto}>
                          <input type="hidden" name="osId" value={id} />
                          <input type="hidden" name="itemId" value={i.id} />
                          <button className="text-xs text-red-600 hover:underline">remover</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!os.produtos.length && <tr><td colSpan={6} className="text-slate-500">Nenhum produto.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="cartao">
        <h2 className="border-b px-4 py-3 font-semibold">Serviços</h2>
        <form action={adicionarServico} className="flex flex-wrap gap-2 border-b p-4">
          <input type="hidden" name="osId" value={id} />
          <select name="servicoId" required className="campo min-w-64 flex-1">
            <option value="">Serviço…</option>
            {servicos.map((s) => <option key={s.id} value={s.id}>{s.nome} — {brl(s.preco)}</option>)}
          </select>
          <input name="valorUnit" className="campo w-28" placeholder="Valor" />
          <button className="btn">Adicionar</button>
        </form>
        <table className="tabela">
          <tbody>
            {os.servicos.map((s) => (
              <tr key={s.id}>
                <td>{s.servico.nome}</td>
                <td className="text-right">{qtd(s.quantidade)} × {brl(s.valorUnit)}</td>
                <td className="text-right">{brl(s.subtotal)}</td>
                <td className="text-right">
                  <form action={removerServico}>
                    <input type="hidden" name="osId" value={id} />
                    <input type="hidden" name="itemId" value={s.id} />
                    <button className="text-xs text-red-600 hover:underline">remover</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="cartao p-4">
          <h2 className="mb-2 font-semibold">Situação</h2>
          <MudarSituacao osId={id} atual={os.situacao} opcoes={SITUACOES_OS} />
          <p className="mt-2 text-xs text-slate-500">
            Concluída/Faturada baixam o estoque. Cancelada/Devolvida liberam as reservas. As demais mantêm as peças reservadas.
          </p>
        </section>
        <section className="cartao p-4">
          <h2 className="mb-2 font-semibold">Histórico</h2>
          <ul className="space-y-1 text-sm">
            {os.historico.map((h) => <li key={h.id}><span className="text-slate-500">{dataHora(h.createdAt)}</span> · {h.descricao}</li>)}
            {!os.historico.length && <li className="text-slate-500">Sem alterações ainda.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
