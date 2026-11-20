"use client";

import { useState } from "react";
import Busca from "@/components/ui/Busca";
import LinhaPessoaBusca from "@/components/cadastros/LinhaPessoaBusca";
import type { PessoaBusca } from "@/lib/cadastros/tipos";

type R = PessoaBusca;

/** Campo "Digite para buscar" de cliente, transportadora, produto ou serviço, com input escondido para formulários. */
export default function BuscaPessoa({ nome, papel, inicial, onEscolher, placeholder }: {
  nome?: string; papel: "cliente" | "transportadora" | "fornecedor" | "produto" | "servico"; inicial?: R | null; onEscolher?: (r: R | null) => void; placeholder?: string;
}) {
  const [v, setV] = useState<R | null>(inicial ?? null);
  const url = (q: string) => (papel === "produto" || papel === "servico" ? `/api/itens/busca?tipo=${papel}&q=${encodeURIComponent(q)}` : `/api/pessoas?papel=${papel}&q=${encodeURIComponent(q)}`);
  return (
    <>
      {nome && <input type="hidden" name={nome} value={v?.id ?? ""} />}
      <Busca<R> url={url} valor={v} rotulo={(p) => p.nome} placeholder={placeholder}
        onEscolher={(p) => { setV(p); onEscolher?.(p); }}
        linha={(p) => (papel === "produto" || papel === "servico"
          ? <span>{p.codigo && <span className="font-mono text-[11px] text-slate-500">{p.codigo} </span>}{p.nome}</span>
          : <LinhaPessoaBusca p={p} />)} />
    </>
  );
}
