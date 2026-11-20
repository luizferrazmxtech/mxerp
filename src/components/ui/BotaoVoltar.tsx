"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Icone from "@/components/Icone";
import { destinoVoltar, registrarPagina, voltarAte } from "@/lib/ui/historico";

/** Fica no AppShell: anota cada página aberta, para o "Voltar" saber de onde a pessoa veio. */
export function RegistroNavegacao() {
  const caminho = usePathname();
  const busca = useSearchParams().toString();
  useEffect(() => { registrarPagina(busca ? `${caminho}?${busca}` : caminho); }, [caminho, busca]);
  return null;
}

/**
 * "Voltar": leva ao registro de onde a pessoa veio (a conta a receber, a venda, o kardex, a nota…).
 * Se a página foi aberta direto (link, nova aba), vai para `padrao`, normalmente a lista.
 */
export default function BotaoVoltar({ padrao, rotulo = "Voltar", className = "btn-sec" }: { padrao: string; rotulo?: string; className?: string }) {
  const router = useRouter();
  const caminho = usePathname();
  const busca = useSearchParams().toString();
  const [destino, setDestino] = useState<{ url: string; indice: number } | null>(null);
  useEffect(() => { setDestino(destinoVoltar(busca ? `${caminho}?${busca}` : caminho)); }, [caminho, busca]);
  return (
    <a href={destino?.url ?? padrao} className={`no-print ${className}`} title={destino ? "Voltar para a página anterior" : "Voltar para a lista"}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        if (destino) voltarAte(destino.indice);
        router.push(destino?.url ?? padrao);
      }}>
      <Icone nome="direita" size={14} className="rotate-180" /> {rotulo}
    </a>
  );
}
