"use client";

import { useState } from "react";
import Icone from "@/components/Icone";

/** Copia o PIX copia-e-cola ou a linha digitável do boleto. */
export default function BotaoCopiar({ texto, rotulo, classe = "btn-sec" }: { texto: string; rotulo: string; classe?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className={classe}
      onClick={async () => {
        try { await navigator.clipboard.writeText(texto); } catch {
          const t = document.createElement("textarea"); t.value = texto; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove();
        }
        setOk(true); setTimeout(() => setOk(false), 2500);
      }}>
      <Icone nome={ok ? "ok" : "copiar"} size={15} /> {ok ? "Copiado!" : rotulo}
    </button>
  );
}
