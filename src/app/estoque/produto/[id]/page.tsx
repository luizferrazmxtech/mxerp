import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { disponivelPorLocal, resumoProduto } from "@/lib/estoque/estoque";
import { brl, dataHora, qtd } from "@/lib/ui/format";
import { darEntrada, darSaida, definirLocalPadrao, fazerTransferencia, salvarFiscalProduto } from "../../actions";

export const dynamic = "force-dynamic";

export default async function ProdutoEstoque({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const produto = await prisma.produto.findUnique({ where: { id }, include: { localPadrao: true } });
  if (!produto) notFound();

  const [resumo, porLocal, locais, reservas, movimentos] = await Promise.all([
    prisma.$transaction((tx) => resumoProduto(tx, id)),
    prisma.$transaction((tx) => disponivelPorLocal(tx, id)),
    prisma.local.findMany({ where: { ativo: true }, orderBy: { codigo: "asc" } }),
    prisma.reserva.findMany({ where: { produtoId: id, status: "ATIVA" }, include: { local: true }, orderBy: { createdAt: "asc" } }),
    prisma.movimentoEstoque.findMany({ where: { produtoId: id }, include: { local: true }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  const nomeLocal = new Map(locais.map((l) => [l.id, l.codigo]));
  const osIds = [...new Set(reservas.filter((r) => r.origemTipo === "OS").map((r) => r.origemId))];
  const oss = await prisma.ordemServico.findMany({ where: { id: { in: osIds } }, select: { id: true, numero: true } });
  const numeroOs = new Map(oss.map((o) => [o.id, o.numero]));

  return (
    <div className="space-y-4">
      <div>
        <Link href="/estoque" className="text-sm text-slate-500 hover:underline">← Estoque</Link>
        <h1 className="text-xl font-semibold">{produto.nome}</h1>
        <p className="text-sm text-slate-500">
          {produto.codigo} · {brl(produto.precoVenda)} · local padrão: {produto.localPadrao?.codigo ?? "não definido"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Físico", resumo.fisico, "text-slate-900"],
          ["Reservado", resumo.reservado, "text-amber-700"],
          ["Disponível", resumo.disponivel, resumo.disponivel > 0 ? "text-emerald-700" : "text-red-600"],
          ["Em falta (pedido sem estoque)", resumo.falta, resumo.falta ? "text-red-600" : "text-slate-400"],
        ].map(([r, v, c]) => (
          <div key={r as string} className="cartao p-4">
            <div className="text-xs text-slate-500">{r}</div>
            <div className={`text-2xl font-semibold ${c}`}>{qtd(v as number)}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="cartao">
          <h2 className="border-b px-4 py-3 font-semibold">Onde está</h2>
          <table className="tabela">
            <thead><tr><th>Local</th><th className="text-right">Físico</th><th className="text-right">Reservado</th><th className="text-right">Livre</th></tr></thead>
            <tbody>
              {porLocal.filter((l) => l.fisico !== 0 || l.reservado !== 0).map((l) => (
                <tr key={l.localId}>
                  <td className="font-mono">{nomeLocal.get(l.localId)}</td>
                  <td className="text-right">{qtd(l.fisico)}</td>
                  <td className="text-right text-amber-700">{qtd(l.reservado)}</td>
                  <td className="text-right font-semibold">{qtd(l.disponivel)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="cartao">
          <h2 className="border-b px-4 py-3 font-semibold">Reservado para</h2>
          <table className="tabela">
            <thead><tr><th>Documento</th><th>Local</th><th className="text-right">Qtd</th></tr></thead>
            <tbody>
              {reservas.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.origemTipo === "OS" ? (
                      <Link className="text-marca hover:underline" href={`/os/${r.origemId}`}>OS {numeroOs.get(r.origemId)}</Link>
                    ) : r.origemTipo}
                  </td>
                  <td className="font-mono">{r.local?.codigo ?? <span className="text-red-600">em falta</span>}</td>
                  <td className="text-right">{qtd(r.quantidade)}</td>
                </tr>
              ))}
              {!reservas.length && <tr><td colSpan={3} className="text-slate-500">Nenhuma reserva.</td></tr>}
            </tbody>
          </table>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <form action={darEntrada} className="cartao space-y-2 p-4">
          <h3 className="font-semibold">Entrada</h3>
          <input type="hidden" name="produtoId" value={id} />
          <SelectLocal name="localId" locais={locais} padrao={produto.localPadraoId} />
          <input name="quantidade" className="campo" placeholder="Quantidade" required />
          <input name="custoUnit" className="campo" placeholder="Custo unitário (opcional)" />
          <input name="observacao" className="campo" placeholder="Observação" />
          <button className="btn w-full">Dar entrada</button>
        </form>
        <form action={fazerTransferencia} className="cartao space-y-2 p-4">
          <h3 className="font-semibold">Mudar de prateleira</h3>
          <input type="hidden" name="produtoId" value={id} />
          <SelectLocal name="deLocalId" locais={locais} rotulo="De" />
          <SelectLocal name="paraLocalId" locais={locais} rotulo="Para" />
          <input name="quantidade" className="campo" placeholder="Quantidade" required />
          <button className="btn w-full">Transferir</button>
        </form>
        <div className="space-y-4">
          <form action={darSaida} className="cartao space-y-2 p-4">
            <h3 className="font-semibold">Saída (perda/uso interno)</h3>
            <input type="hidden" name="produtoId" value={id} />
            <SelectLocal name="localId" locais={locais} padrao={produto.localPadraoId} />
            <input name="quantidade" className="campo" placeholder="Quantidade" required />
            <input name="observacao" className="campo" placeholder="Motivo" />
            <button className="btn-sec w-full">Dar saída</button>
          </form>
          <form action={definirLocalPadrao} className="cartao flex gap-2 p-4">
            <input type="hidden" name="produtoId" value={id} />
            <SelectLocal name="localId" locais={locais} padrao={produto.localPadraoId} rotulo="Local padrão" vazio />
            <button className="btn-sec">Salvar</button>
          </form>
        </div>
      </div>

      <form action={salvarFiscalProduto} className="cartao grid gap-2 p-4 md:grid-cols-8">
        <h2 className="font-semibold md:col-span-8">Dados fiscais</h2>
        <input type="hidden" name="produtoId" value={id} />
        {[["ncm", "NCM", produto.ncm], ["cest", "CEST", produto.cest], ["gtin", "Código de barras (GTIN)", produto.gtin],
          ["cfopInterno", "CFOP dentro de SP", produto.cfopInterno ?? "5102"], ["cfopExterno", "CFOP fora de SP", produto.cfopExterno ?? "6102"],
          ["csosn", "CSOSN", produto.csosn ?? "102"], ["origem", "Origem", String(produto.origem)]].map(([n, r, v]) => (
          <label key={n} className="text-xs text-slate-500">{r}<input name={n!} defaultValue={v ?? ""} className="campo mt-1" /></label>
        ))}
        <div className="flex items-end"><button className="btn w-full">Salvar</button></div>
      </form>

      <section className="cartao">
        <h2 className="border-b px-4 py-3 font-semibold">Últimas movimentações</h2>
        <table className="tabela">
          <thead><tr><th>Data</th><th>Tipo</th><th>Local</th><th className="text-right">Qtd</th><th>Origem</th></tr></thead>
          <tbody>
            {movimentos.map((m) => (
              <tr key={m.id}>
                <td>{dataHora(m.createdAt)}</td>
                <td className={m.tipo === "ENTRADA" ? "text-emerald-700" : "text-red-600"}>{m.tipo === "ENTRADA" ? "Entrada" : "Saída"}</td>
                <td className="font-mono">{m.local.codigo}</td>
                <td className="text-right">{qtd(m.quantidade)}</td>
                <td className="text-slate-600">{m.origemTipo}{m.observacao ? ` · ${m.observacao}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function SelectLocal({ name, locais, padrao, rotulo, vazio }: {
  name: string; locais: { id: string; codigo: string }[]; padrao?: string | null; rotulo?: string; vazio?: boolean;
}) {
  return (
    <select name={name} defaultValue={padrao ?? ""} className="campo" required={!vazio} aria-label={rotulo ?? "Local"}>
      <option value="">{rotulo ? `${rotulo}…` : "Local…"}</option>
      {locais.map((l) => <option key={l.id} value={l.id}>{l.codigo}</option>)}
    </select>
  );
}
