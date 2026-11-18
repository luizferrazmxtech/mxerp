"use client";

import { useState } from "react";
import Icone from "@/components/Icone";

/** Botão que copia um texto (linha digitável, Pix copia e cola). */
export default function CopiarTexto({ texto, rotulo, className }: { texto: string; rotulo: string; className?: string }) {
  const [ok, setOk] = useState(false);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); setOk(true); setTimeout(() => setOk(false), 2000); }
    catch { window.prompt(`Copie: ${rotulo}`, texto); }
  };
  return <button type="button" onClick={copiar} className={className}><Icone nome={ok ? "ok" : "copiar"} size={13} /> {ok ? "Copiado" : rotulo}</button>;
}
