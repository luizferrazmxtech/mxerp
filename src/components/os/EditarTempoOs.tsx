"use client";

import { useEffect, useState } from "react";
import { useFormAcao } from "@/components/ui/useFormAcao";
import { corrigirTempoOsAcao, type Resultado } from "@/lib/os/acoes";
import Icone from "@/components/Icone";

type Trecho = { id: string; inicio: string; fim: string | null; motivo: string | null };
type Linha = { chave: string; id?: string; inicio: string; fim: string; motivo: string; aberto?: boolean };

/** ISO → "AAAA-MM-DDTHH:MM" no horário de Brasília (valor do input datetime-local). */
function local(iso: string | null) {
  if (!iso) return "";
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

const minutos = (l: Linha) => {
  if (!l.inicio || !l.fim) return null;
  const m = (new Date(`${l.fim}:00-03:00`).getTime() - new Date(`${l.inicio}:00-03:00`).getTime()) / 60000;
  return isNaN(m) ? null : m;
};
const txt = (m: number) => (m < 60 ? `${Math.round(m)}min` : `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, "0")}min`);

/** Correção do tempo de mão de obra pelo administrador: altera início/fim, inclui e exclui trechos. */
export default function EditarTempoOs({ osId, trechos }: { osId: string; trechos: Trecho[] }) {
  const [aberto, setAberto] = useState(false);
  const inicial = (): Linha[] => trechos.map((t) => ({ chave: t.id, id: t.id, inicio: local(t.inicio), fim: local(t.fim), motivo: t.motivo ?? "", aberto: !t.fim }));
  const [linhas, setLinhas] = useState<Linha[]>(inicial);
  const [r, , pendente, form] = useFormAcao<Resultado>(corrigirTempoOsAcao, null);
  useEffect(() => { if (r?.ok) setAberto(false); }, [r]);
  const muda = (i: number, campo: "inicio" | "fim" | "motivo", v: string) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, [campo]: v } : l)));
  const total = linhas.reduce((s, l) => s + Math.max(0, minutos(l) ?? 0), 0);

  if (!aberto) return (
    <>
      <button type="button" onClick={() => { setLinhas(inicial()); setAberto(true); }} className="mt-2 inline-flex items-center gap-1 text-[12px] text-marca hover:underline">
        <Icone nome="editar" size={13} /> Corrigir tempo
      </button>
      {r?.ok && <div className="mt-2 rounded bg-emerald-50 px-2 py-1 text-[12px] text-emerald-800">{r.mensagem}</div>}
    </>
  );

  return (
    <form {...form} className="mt-2 space-y-2 border-t pt-2 text-[12px]">
      <input type="hidden" name="id" value={osId} />
      <input type="hidden" name="trechos" value={JSON.stringify(linhas.map(({ id, inicio, fim, motivo }) => ({ id, inicio, fim, motivo })))} />
      <div className="font-semibold">Corrigir tempo de mão de obra</div>
      {linhas.map((l, i) => {
        const m = minutos(l);
        return (
          <div key={l.chave} className="space-y-1 rounded border bg-slate-50 p-2">
            <div className="flex items-center gap-1">
              <span className="w-10 text-slate-500">Início</span>
              <input type="datetime-local" required value={l.inicio} onChange={(e) => muda(i, "inicio", e.target.value)} className="campo !h-7 flex-1 !px-1 !text-[12px]" />
            </div>
            <div className="flex items-center gap-1">
              <span className="w-10 text-slate-500">Fim</span>
              <input type="datetime-local" required={!l.aberto} value={l.fim} onChange={(e) => muda(i, "fim", e.target.value)} className="campo !h-7 flex-1 !px-1 !text-[12px]" />
            </div>
            <div className="flex items-center gap-1">
              <input value={l.motivo} onChange={(e) => muda(i, "motivo", e.target.value)} placeholder="Motivo / observação do trecho" className="campo !h-7 flex-1 !px-1 !text-[12px]" />
              <b className={`w-16 text-right ${m !== null && m <= 0 ? "text-red-600" : ""}`}>{m === null ? (l.aberto && !l.fim ? "em curso" : "—") : m <= 0 ? "inválido" : txt(m)}</b>
              <button type="button" title="Excluir trecho" onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))} className="p-1 text-red-600 hover:bg-red-50"><Icone nome="excluir" size={14} /></button>
            </div>
          </div>
        );
      })}
      <button type="button" onClick={() => setLinhas((ls) => [...ls, { chave: `novo-${Date.now()}`, inicio: "", fim: "", motivo: "" }])} className="inline-flex items-center gap-1 text-marca hover:underline">
        <Icone nome="mais" size={13} /> Incluir trecho
      </button>
      <div className="flex justify-between border-t pt-2"><span className="text-slate-500">Total corrigido</span><b>{txt(total)}</b></div>
      <input name="observacao" placeholder="Motivo da correção (vai para o histórico)" className="campo !h-8 !text-[12px]" />
      {r && !r.ok && <div className="rounded bg-red-50 px-2 py-1 text-red-700">{r.mensagem}</div>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setAberto(false)} className="btn-sec">Cancelar</button>
        <button className="btn" disabled={pendente}>{pendente ? "Salvando…" : "Salvar"}</button>
      </div>
    </form>
  );
}
