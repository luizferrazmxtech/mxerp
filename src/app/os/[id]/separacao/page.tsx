import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { listaSeparacao } from "@/lib/os/os";
import { qtd } from "@/lib/ui/format";
import { marcarSeparadoAcao } from "@/lib/os/acoes";
import BotaoImprimir from "./BotaoImprimir";

export const dynamic = "force-dynamic";

export default async function Separacao({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const os = await prisma.ordemServico.findUnique({ where: { id }, include: { cliente: true } });
  if (!os) notFound();
  const itens = await listaSeparacao(id);
  return (
    <div className="max-w-3xl space-y-4">
      <div className="no-print flex items-center justify-between">
        <Link href={`/os/${id}`} className="text-sm text-slate-500 hover:underline">← OS #{os.numero}</Link>
        <BotaoImprimir />
      </div>
      <div>
        <h1 className="text-xl font-semibold">Separação · OS #{os.numero}</h1>
        <p className="text-sm text-slate-600">{os.cliente.nome}</p>
      </div>
      <table className="tabela cartao">
        <thead><tr><th>Local</th><th>Produto</th><th className="text-right">Qtd</th><th className="text-center">Pego</th></tr></thead>
        <tbody>
          {itens.map((r) => (
            <tr key={r.id} className={r.separado ? "bg-emerald-50" : ""}>
              <td className="font-mono text-base font-semibold">{r.local?.codigo ?? <span className="text-red-600">EM FALTA</span>}</td>
              <td><span className="font-mono text-xs text-slate-500">{r.produto.codigo}</span> {r.produto.nome}</td>
              <td className="text-right text-base">{qtd(r.quantidade)} {r.produto.unidade}</td>
              <td className="text-center">
                {r.local && (
                  <form action={marcarSeparadoAcao}>
                    <input type="hidden" name="osId" value={id} />
                    <input type="hidden" name="reservaId" value={r.id} />
                    <input type="hidden" name="separado" value={r.separado ? "0" : "1"} />
                    <button className={r.separado ? "text-emerald-700" : "btn-sec px-2 py-1 text-xs"}>{r.separado ? "✓" : "marcar"}</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
          {!itens.length && <tr><td colSpan={4} className="text-slate-500">Nada reservado para esta OS.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
