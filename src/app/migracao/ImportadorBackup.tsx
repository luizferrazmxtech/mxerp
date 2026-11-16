"use client";

import { useActionState } from "react";
import { importarBackup, type EstadoBackup } from "./actions";

const NOMES: Record<string, string> = {
  clientes: "Clientes", fornecedores: "Fornecedores", servicos: "Serviços", produtos: "Produtos e estoque",
  os: "OS em andamento", orcamentos: "Orçamentos", vendas: "Vendas", receber: "Contas a receber em aberto", pagar: "Contas a pagar em aberto",
};

const ETAPAS = [
  { nome: "cadastros", rotulo: "Cadastros (clientes, fornecedores, produtos, serviços)", padrao: true },
  { nome: "estoque", rotulo: "Quantidade em estoque dos produtos", padrao: true },
  { nome: "os", rotulo: "OS em andamento, com os produtos já reservados", padrao: true },
  { nome: "orcamentos", rotulo: "Orçamentos (todos, com itens, parcelas e histórico)", padrao: true },
  { nome: "vendas", rotulo: "Vendas (todas, com itens, parcelas e histórico; as em aberto reservam as peças)", padrao: true },
  { nome: "receber", rotulo: "Contas a receber em aberto", padrao: true },
  { nome: "pagar", rotulo: "Contas a pagar que vencem a partir de hoje", padrao: true },
  { nome: "pagarVencidas", rotulo: "Incluir também as contas a pagar já vencidas", padrao: false },
];

export default function ImportadorBackup() {
  const [estado, act, pendente] = useActionState<EstadoBackup, FormData>(importarBackup, null);
  return (
    <div className="space-y-4">
      <form action={act} className="cartao space-y-3">
        <label className="block space-y-1 text-sm">
          <span>Arquivo do backup (.zip)</span>
          <input name="arquivo" type="file" accept=".zip" className="campo w-full" required />
        </label>
        <fieldset className="grid gap-1 text-sm sm:grid-cols-2">
          {ETAPAS.map((e) => (
            <label key={e.nome} className="flex items-center gap-2">
              <input type="checkbox" name={e.nome} defaultChecked={e.padrao} /> {e.rotulo}
            </label>
          ))}
        </fieldset>
        <div className="flex gap-2">
          <button className="btn-sec" name="modo" value="simular" disabled={pendente}>{pendente ? "Lendo o backup…" : "Simular"}</button>
          <button className="btn" name="modo" value="gravar" disabled={pendente}>Importar de verdade</button>
        </div>
        {pendente && <p className="text-sm text-slate-500">Pode levar cerca de um minuto.</p>}
      </form>

      {estado && (
        <div className="cartao space-y-3 text-sm">
          <p className={estado.ok ? "font-medium text-emerald-700" : "font-medium text-red-700"}>{estado.mensagem}</p>
          {estado.resultados?.map((r) => (
            <div key={r.tipo} className="space-y-1 border-t pt-2">
              <p className="font-medium">{NOMES[r.tipo] ?? r.tipo}</p>
              <p>
                {r.lidas} no backup · {r.criados} {r.simulado ? "novos" : "criados"} · {r.atualizados} {r.simulado ? "a atualizar" : "atualizados"} · {r.ignorados.length} ignorados
              </p>
              {r.avisos.map((a, i) => <p key={i} className="text-amber-700">{a}</p>)}
              {r.ignorados.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-slate-600">Ignorados</summary>
                  <ul className="mt-1 list-disc pl-5">{r.ignorados.slice(0, 200).map((x, i) => <li key={i}>{r.tipo === "os" ? "" : `Linha ${x.linha}: `}{x.motivo}</li>)}</ul>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
