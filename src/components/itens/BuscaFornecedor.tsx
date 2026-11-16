"use client";

import { useState } from "react";
import Busca from "@/components/ui/Busca";

type P = { id: string; nome: string; fantasia?: string | null; documento?: string | null };

/** Campo "Digite para buscar" de fornecedor, com input escondido para formulários GET/POST. */
export default function BuscaFornecedor({ nome, inicial, onEscolher }: { nome?: string; inicial?: P | null; onEscolher?: (p: P | null) => void }) {
  const [v, setV] = useState<P | null>(inicial ?? null);
  return (
    <>
      {nome && <input type="hidden" name={nome} value={v?.id ?? ""} />}
      <Busca<P> url={(q) => `/api/pessoas?papel=fornecedor&q=${encodeURIComponent(q)}`} valor={v} rotulo={(p) => p.nome}
        onEscolher={(p) => { setV(p); onEscolher?.(p); }}
        linha={(p) => <span>{p.nome}{p.fantasia && <i className="text-slate-500"> ({p.fantasia})</i>}<span className="block text-[11px] text-slate-500">{p.documento}</span></span>} />
    </>
  );
}
