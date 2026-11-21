"use client";

import { useFormAcao } from "@/components/ui/useFormAcao";
import { importar, type EstadoMigracao } from "./actions";

export default function Importador() {
  const [estado, , pendente, formAct] = useFormAcao<EstadoMigracao>(importar, null);
  const r = estado?.resultado;
  return (
    <div className="space-y-4">
      <form {...formAct} className="cartao grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span>O que é a planilha</span>
          <select name="tipo" className="campo w-full" defaultValue="produtos">
            <option value="produtos">Produtos (com estoque)</option>
            <option value="clientes">Clientes</option>
            <option value="fornecedores">Fornecedores</option>
            <option value="servicos">Serviços</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Arquivo (.xlsx ou .csv)</span>
          <input name="arquivo" type="file" accept=".xlsx,.csv,.txt" className="campo w-full" required />
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="estoque" defaultChecked /> Trazer a quantidade em estoque (só produtos)
        </label>
        <div className="flex gap-2 sm:col-span-2">
          <button className="btn-sec" name="modo" value="simular" disabled={pendente}>{pendente ? "Lendo…" : "Simular"}</button>
          <button className="btn" name="modo" value="gravar" disabled={pendente}>Importar de verdade</button>
        </div>
      </form>

      {estado && (
        <div className="cartao space-y-2 text-sm">
          <p className={estado.ok ? "font-medium text-emerald-700" : "font-medium text-red-700"}>{estado.mensagem}</p>
          {r && (
            <>
              <p>
                {r.lidas} linhas lidas · {r.criados} {r.simulado ? "seriam criados" : "criados"} · {r.atualizados} {r.simulado ? "seriam atualizados" : "atualizados"} · {r.ignorados.length} ignorados
              </p>
              {estado.colunas && <p className="text-slate-500">Colunas encontradas: {estado.colunas.join(", ")}</p>}
              {r.avisos.map((a, i) => <p key={i} className="text-amber-700">{a}</p>)}
              {r.ignorados.length > 0 && (
                <details>
                  <summary className="cursor-pointer">Linhas ignoradas</summary>
                  <ul className="mt-1 list-disc pl-5">
                    {r.ignorados.slice(0, 200).map((x) => <li key={x.linha}>Linha {x.linha}: {x.motivo}</li>)}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
