import Link from "next/link";
import type { DocumentoReserva } from "@/lib/estoque/reservas";
import { cor } from "@/lib/orcamentos/tipos";
import { dataSP, qtd } from "@/lib/ui/format";

/** Tabela "Reservado para": cada venda/OS que segura o produto, com link, situação, prateleira e quantidade. */
export default function TabelaReservas({ docs, unidade }: { docs: DocumentoReserva[]; unidade?: string }) {
  const total = docs.reduce((s, d) => s + d.quantidade, 0);
  return (
    <table className="tabela">
      <thead><tr><th>Documento</th><th>Cliente</th><th>Situação</th><th>Data</th><th>Onde está</th><th className="text-right">Qtd</th></tr></thead>
      <tbody>
        {docs.map((d) => (
          <tr key={d.chave}>
            <td><Link className="font-medium text-marca hover:underline" href={d.href}>{d.rotulo}</Link></td>
            <td className="text-[12px]">{d.pessoa ?? "—"}</td>
            <td><span className={`pilula ${cor(d.cor).pilula}`}>{d.situacao}</span></td>
            <td className="text-[12px]">{dataSP(d.data)}</td>
            <td className="text-[12px] text-slate-600">
              {d.locais.map((l) => <div key={`${l.deposito}|${l.codigo}`}>{l.deposito} · {l.codigo}: <b>{qtd(l.quantidade)}</b></div>)}
              {d.falta > 0 && <span className="pilula border-red-300 bg-red-50 text-red-700">em falta: {qtd(d.falta)}</span>}
              {d.separado && !d.falta && <span className="etiqueta text-emerald-700">separado</span>}
            </td>
            <td className="text-right font-semibold">{qtd(d.quantidade)}{unidade ? ` ${unidade}` : ""}</td>
          </tr>
        ))}
        {!docs.length && <tr><td colSpan={6} className="py-6 text-center text-slate-500">Nenhuma venda ou OS reservando este produto.</td></tr>}
        {docs.length > 1 && <tr className="bg-slate-50"><td colSpan={5} className="text-right font-semibold">Total reservado</td><td className="text-right font-semibold">{qtd(total)}{unidade ? ` ${unidade}` : ""}</td></tr>}
      </tbody>
    </table>
  );
}
