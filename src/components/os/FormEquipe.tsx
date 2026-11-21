"use client";

import { useFormAcao } from "@/components/ui/useFormAcao";
import Link from "next/link";
import { salvarEquipeAcao, type Resultado } from "@/lib/os/equipes";

export default function FormEquipe({ e, funcionarios }: { e?: { id: string; nome: string; ativo: boolean; membros: string[] }; funcionarios: { id: string; nome: string; tecnico: boolean }[] }) {
  const [r, , pendente, formAcao] = useFormAcao<Resultado>(salvarEquipeAcao, null);
  return (
    <form {...formAcao} className="cartao mb-3 flex flex-wrap items-end gap-3 p-4">
      {e && <input type="hidden" name="id" value={e.id} />}
      <label className="min-w-64 flex-1"><span className="rotulo obrig">Nome</span><input name="nome" defaultValue={e?.nome} required autoFocus className="campo" placeholder="Ex.: Equipe de instalação" /></label>
      <label className="w-32"><span className="rotulo">Ativa</span><select name="ativo" defaultValue={e?.ativo === false ? "0" : "1"} className="campo"><option value="1">Sim</option><option value="0">Não</option></select></label>
      <fieldset className="w-full">
        <span className="rotulo obrig">Membros</span>
        <p className="mb-2 text-[12px] text-slate-500">Todos os membros veem as OS da equipe na tela do técnico e podem lançar itens, marcar instalados e anexar fotos.</p>
        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
          {funcionarios.map((f) => (
            <label key={f.id} className="flex items-center gap-2 rounded border px-2 py-1.5 text-[13px] hover:bg-slate-50">
              <input type="checkbox" name="membros" value={f.id} defaultChecked={e?.membros.includes(f.id)} /> {f.nome}
              {f.tecnico && <span className="ml-auto rounded bg-slate-100 px-1.5 text-[10px] text-slate-600">Técnico</span>}
            </label>
          ))}
        </div>
      </fieldset>
      {r && !r.ok && <p className="w-full rounded bg-red-50 px-3 py-2 text-[13px] text-red-700">{r.mensagem}</p>}
      <div className="flex w-full gap-2"><Link href="/os/equipes" className="btn-sec">Cancelar</Link><button className="btn ml-auto px-5" disabled={pendente}>{e ? "Salvar" : "Cadastrar"}</button></div>
    </form>
  );
}
