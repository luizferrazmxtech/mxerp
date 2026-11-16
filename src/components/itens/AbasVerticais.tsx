"use client";

import Icone from "@/components/Icone";

/** Abas verticais do formulário de produto/serviço (cartões com ícone, título e subtítulo; ativa em preto). */
export default function AbasVerticais({ abas, ativa, onTrocar }: { abas: { chave: string; titulo: string; sub: string; icone: string }[]; ativa: string; onTrocar: (c: string) => void }) {
  return (
    <nav className="flex gap-2 overflow-x-auto lg:flex-col">
      {abas.map((a) => (
        <button type="button" key={a.chave} onClick={() => onTrocar(a.chave)}
          className={`flex min-w-44 items-center gap-3 rounded-md border px-3 py-2.5 text-left ${ativa === a.chave ? "border-tinta bg-tinta text-white" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
          <Icone nome={a.icone} size={18} />
          <span><span className="block text-[14px] font-semibold">{a.titulo}</span><span className={`block text-[11px] ${ativa === a.chave ? "text-slate-300" : "text-slate-500"}`}>{a.sub}</span></span>
        </button>
      ))}
    </nav>
  );
}

export function Ajuda({ texto }: { texto: string }) {
  return <span title={texto} className="ml-1 inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full bg-slate-400 text-[9px] font-bold text-white">?</span>;
}

export function SimNao({ valor, onChange }: { valor: boolean; onChange: (v: boolean) => void }) {
  return (
    <select className="campo" value={valor ? "1" : "0"} onChange={(e) => onChange(e.target.value === "1")}>
      <option value="1">Sim</option><option value="0">Não</option>
    </select>
  );
}

export function LinhaToggle({ titulo, texto, ligado, onChange, children }: { titulo: string; texto?: string; ligado: boolean; onChange: (v: boolean) => void; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded border border-slate-200 px-3 py-2">
      <div className="flex-1"><div className="text-[13px] font-semibold">{titulo}</div>{texto && <div className="text-[11px] text-slate-500">{texto}</div>}</div>
      {children}
      <button type="button" role="switch" aria-checked={ligado} onClick={() => onChange(!ligado)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${ligado ? "bg-marca" : "bg-slate-300"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${ligado ? "left-[18px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}

/** Área de fotos: até 10, a primeira é a principal; novas entram como arquivos "fotos". */
export function Fotos({ existentes, url, onOrdem, onRemover }: {
  existentes: string[]; url: (id: string) => string; onOrdem: (ids: string[]) => void; onRemover: (id: string) => void;
}) {
  const mover = (i: number, d: number) => { const n = [...existentes]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); onOrdem(n); };
  return (
    <div>
      <div className="mb-2 text-[12px] text-slate-500">{existentes.length} de 10 fotos · a primeira é a principal</div>
      <div className="mb-3 flex flex-wrap gap-3">
        {existentes.map((id, i) => (
          <div key={id} className="relative rounded border border-slate-200 p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url(id)} alt="" className="h-24 w-24 object-cover" />
            {i === 0 && <span className="absolute left-1 top-1 rounded bg-tinta px-1 text-[10px] text-white">Principal</span>}
            <div className="mt-1 flex justify-between">
              <button type="button" className="text-[11px] disabled:opacity-30" disabled={i === 0} onClick={() => mover(i, -1)}>◀</button>
              <button type="button" className="text-[11px] text-red-600" onClick={() => onRemover(id)}>remover</button>
              <button type="button" className="text-[11px] disabled:opacity-30" disabled={i === existentes.length - 1} onClick={() => mover(i, 1)}>▶</button>
            </div>
          </div>
        ))}
      </div>
      <label className="relative flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-slate-300 px-4 py-8 text-center text-[13px] text-slate-500 hover:bg-slate-50">
        <Icone nome="foto" size={26} />
        Arraste as fotos aqui ou clique para selecionar
        <span className="text-[11px]">JPG, PNG ou GIF de até 5 MB</span>
        <input type="file" name="fotos" multiple accept="image/jpeg,image/png,image/gif" className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
    </div>
  );
}
