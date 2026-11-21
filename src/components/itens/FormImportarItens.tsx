"use client";

import { useFormAcao } from "@/components/ui/useFormAcao";
import Link from "next/link";
import { importarItensAcao, type EstadoImportacao } from "@/lib/itens/importacao";

export default function FormImportarItens({ tipo, nfe }: { tipo: "produtos" | "servicos"; nfe: boolean }) {
  const [r, , pendente, formAcao] = useFormAcao<EstadoImportacao>(importarItensAcao, null);
  const res = r?.resultado;
  return (
    <form {...formAcao} className="space-y-3">
      <input type="hidden" name="tipo" value={tipo} />
      {nfe && <input type="hidden" name="nfe" value="1" />}
      <input type="file" name="arquivo" multiple={nfe} accept={nfe ? ".xml" : ".xlsx,.csv,.txt"} className="block text-[13px]" />
      {tipo === "produtos" && !nfe && (
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="estoque" value="1" /> Ajustar o estoque pela coluna &quot;Estoque&quot; (só produtos ainda sem movimentação)</label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button name="modo" value="simular" className="btn-sec" disabled={pendente}>Simular</button>
        <button name="modo" value="gravar" className="btn" disabled={pendente}>{pendente ? "Importando…" : "Importar de verdade"}</button>
        <Link href={`/${tipo}`} className="btn-sec ml-auto">Voltar</Link>
      </div>
      {r && (
        <div className={`rounded px-3 py-2 text-[13px] ${r.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
          {r.mensagem}
          {res && <div className="mt-1">{res.lidas} linha(s) lida(s) · {res.criados} novo(s) · {res.atualizados} atualizado(s) · {res.ignorados.length} ignorado(s)</div>}
          {res && [...res.ignorados.map((x) => `Linha ${x.linha}: ${x.motivo}`), ...res.avisos].slice(0, 30).map((t, i) => <div key={i} className="text-[12px] text-amber-800">{t}</div>)}
        </div>
      )}
    </form>
  );
}
