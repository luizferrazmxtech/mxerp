"use client";

import { useState } from "react";
import Icone from "@/components/Icone";
import FormCompra, { type InicialCompra } from "./FormCompra";

type Op = Parameters<typeof FormCompra>[0]["op"];

/** Mais ações › Importar XML: lê a NF-e e abre o formulário da compra já preenchido. */
export default function ImportarXmlCompra({ inicial, op }: { inicial: InicialCompra; op: Op }) {
  const [compra, setCompra] = useState<InicialCompra | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [erro, setErro] = useState("");
  const [lendo, setLendo] = useState(false);
  async function enviar(f: File) {
    setLendo(true); setErro("");
    const fd = new FormData();
    fd.append("xml", f);
    const r = await fetch("/api/compras/xml", { method: "POST", body: fd });
    const j = await r.json();
    setLendo(false);
    if (!r.ok) { setErro(j.erro ?? "Não foi possível ler o XML"); return; }
    setAvisos(j.avisos ?? []);
    setCompra({ ...inicial, ...j.dados });
  }
  if (compra) return (
    <>
      {avisos.length > 0 && <div className="mb-3 space-y-1 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">{avisos.map((a) => <p key={a}>{a}</p>)}</div>}
      <FormCompra inicial={compra} op={op} />
    </>
  );
  return (
    <div className="cartao flex flex-col items-center px-4 py-12 text-center">
      <span className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-600"><Icone nome="importar" size={30} /></span>
      <h2 className="text-[20px] font-semibold">Importar a compra pelo XML da NF-e</h2>
      <p className="mt-1 max-w-lg text-[13px] text-slate-500">O fornecedor, os produtos, o frete, os impostos e as duplicatas vêm da nota. Itens que não se ligarem a nenhum produto ficam para você escolher.</p>
      <label className="btn relative mt-4 cursor-pointer"><Icone nome="importar" size={15} /> {lendo ? "Lendo…" : "Escolher arquivo XML"}
        <input type="file" accept=".xml,text/xml" className="absolute inset-0 cursor-pointer opacity-0" disabled={lendo} onChange={(e) => e.target.files?.[0] && enviar(e.target.files[0])} /></label>
      {erro && <p className="mt-3 rounded bg-red-50 px-3 py-2 text-[13px] text-red-700">{erro}</p>}
    </div>
  );
}
