"use client";

import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icone from "@/components/Icone";
import { anexarAcao, anotarAcao, areaClienteAcao, type Resultado } from "@/lib/cadastros/acoes";

function Aviso({ r }: { r: Resultado }) {
  if (!r) return null;
  return <p className={`mt-2 text-[13px] ${r.ok ? "text-emerald-700" : "text-red-700"}`}>{r.mensagem}</p>;
}

export function FormAnexo({ entidade, entidadeId, caminho }: { entidade: string; entidadeId: string; caminho: string }) {
  const [r, acao, pendente] = useActionState<Resultado, FormData>(anexarAcao, null);
  return (
    <form action={acao} className="mb-3 flex flex-wrap items-center gap-2">
      <input type="hidden" name="entidade" value={entidade} />
      <input type="hidden" name="entidadeId" value={entidadeId} />
      <input type="hidden" name="caminho" value={caminho} />
      <input type="file" name="arquivo" multiple className="text-[13px]" />
      <button className="btn" disabled={pendente}><Icone nome="mais" size={14} /> {pendente ? "Enviando…" : "Adicionar anexo"}</button>
      <span className="text-[11px] text-slate-500">Máximo de 5 MB por arquivo.</span>
      <Aviso r={r} />
    </form>
  );
}

export function FormAnotacao({ pessoaId, caminho }: { pessoaId: string; caminho: string }) {
  const [r, acao, pendente] = useActionState<Resultado, FormData>(anotarAcao, null);
  return (
    <form action={acao} className="mb-4">
      <input type="hidden" name="pessoaId" value={pessoaId} />
      <input type="hidden" name="caminho" value={caminho} />
      <textarea name="texto" rows={3} className="campo" placeholder="Escreva uma anotação sobre o cliente" key={r?.ok ? Math.random() : "t"} />
      <div className="mt-2 flex items-center gap-2"><button className="btn" disabled={pendente}>{pendente ? "Salvando…" : "Adicionar anotação"}</button><Aviso r={r} /></div>
    </form>
  );
}

export function BotaoAreaCliente({ id, habilitada }: { id: string; habilitada: boolean }) {
  const [pendente, start] = useTransition();
  const router = useRouter();
  return (
    <button type="button" className="btn-verde" disabled={pendente}
      onClick={() => start(async () => { const r = await areaClienteAcao(id); if (!r.ok) window.alert(r.mensagem); router.refresh(); })}>
      <Icone nome="pessoa" size={15} /> {habilitada ? "Desabilitar Área do Cliente" : "Habilitar Área do Cliente"}
    </button>
  );
}
