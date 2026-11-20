"use client";

import { useState } from "react";
import Busca from "@/components/ui/Busca";
import LinhaPessoaBusca from "@/components/cadastros/LinhaPessoaBusca";
import type { PessoaBusca } from "@/lib/cadastros/tipos";

type P = PessoaBusca;


/** Campo "Digite para buscar" de fornecedor, com input escondido para formulários GET/POST. */
export default function BuscaFornecedor({ nome, inicial, onEscolher }: { nome?: string; inicial?: P | null; onEscolher?: (p: P | null) => void }) {
  const [v, setV] = useState<P | null>(inicial ?? null);
  return (
    <>
      {nome && <input type="hidden" name={nome} value={v?.id ?? ""} />}
      <Busca<P> url={(q) => `/api/pessoas?papel=fornecedor&q=${encodeURIComponent(q)}`} valor={v} rotulo={(p) => p.nome}
        onEscolher={(p) => { setV(p); onEscolher?.(p); }}
        linha={(p) => <LinhaPessoaBusca p={p} />} />
    </>
  );
}
