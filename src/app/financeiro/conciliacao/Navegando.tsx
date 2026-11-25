"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { FaixaTopo } from "@/components/ui/BarraCarregando";

/**
 * Abas, filtros, ordem e busca da conciliação recarregam a tela no servidor: enquanto isso a tela antiga fica parada e
 * parecia travada. Mostra a faixa de carregamento do clique até a tela nova chegar.
 */
export default function Navegando() {
  const pathname = usePathname();
  const busca = useSearchParams();
  const [ativo, setAtivo] = useState(false);

  useEffect(() => { setAtivo(false); }, [pathname, busca]);

  useEffect(() => {
    const clique = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      setAtivo(true);
    };
    const envio = (e: SubmitEvent) => {
      const f = e.target as HTMLFormElement;
      if (f.method.toLowerCase() === "get" && f.getAttribute("action")) setAtivo(true);
    };
    document.addEventListener("click", clique);
    document.addEventListener("submit", envio);
    return () => { document.removeEventListener("click", clique); document.removeEventListener("submit", envio); };
  }, []);

  return ativo ? <FaixaTopo /> : null;
}
