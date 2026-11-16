"use client";

import Link from "next/link";
import { useActionState } from "react";
import { importarPessoasAcao, type EstadoImportacao } from "@/lib/cadastros/importacao";
import type { PapelPessoa } from "@/lib/cadastros/tipos";

export default function FormImportar({ papel, nfe, voltar }: { papel: PapelPessoa; nfe: boolean; voltar: string }) {
  const [r, acao, pendente] = useActionState<EstadoImportacao, FormData>(importarPessoasAcao, null);
  const res = r?.resultado;
  return (
    <form action={acao} className="space-y-3">
      <input type="hidden" name="papel" value={papel} />
      {nfe && <input type="hidden" name="nfe" value="1" />}
      <input type="file" name="arquivo" multiple={nfe} accept={nfe ? ".xml" : ".xlsx,.csv,.txt"} className="block text-[13px]" />
      <div className="flex flex-wrap items-center gap-2">
        <button name="modo" value="simular" className="btn-sec" disabled={pendente}>Simular</button>
        <button name="modo" value="gravar" className="btn" disabled={pendente}>{pendente ? "Importando…" : "Importar de verdade"}</button>
        <Link href={voltar} className="btn-sec ml-auto">Voltar</Link>
      </div>
      {r && (
        <div className={`rounded px-3 py-2 text-[13px] ${r.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
          {r.mensagem}
          {res && <div className="mt-1">{res.lidas} linha(s) lida(s) · {res.criados} nova(s) · {res.atualizados} atualizada(s) · {res.ignorados.length} ignorada(s)</div>}
          {res && [...res.ignorados.map((x) => `Linha ${x.linha}: ${x.motivo}`), ...res.avisos].slice(0, 30).map((t, i) => <div key={i} className="text-[12px] text-amber-800">{t}</div>)}
        </div>
      )}
    </form>
  );
}
