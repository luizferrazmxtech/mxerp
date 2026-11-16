"use client";

import { useState } from "react";
import Icone from "@/components/Icone";

export default function CopiarLink({ url, menu }: { url: string; menu?: boolean }) {
  const [ok, setOk] = useState(false);
  const copiar = async () => { try { await navigator.clipboard.writeText(url); setOk(true); setTimeout(() => setOk(false), 2000); } catch { window.prompt("Copie o link:", url); } };
  if (menu) return <button type="button" onClick={copiar} className="flex w-full items-center gap-2 px-3 py-[7px] text-left hover:bg-slate-100"><Icone nome="copiar" size={15} /> {ok ? "Link copiado" : "Copiar link"}</button>;
  return (
    <div className="flex">
      <input readOnly value={url} className="campo rounded-r-none text-[11px]" onFocus={(e) => e.target.select()} />
      <button type="button" onClick={copiar} className="btn rounded-l-none px-2" title="Copiar">{ok ? <Icone nome="ok" size={14} /> : <Icone nome="copiar" size={14} />}</button>
    </div>
  );
}
