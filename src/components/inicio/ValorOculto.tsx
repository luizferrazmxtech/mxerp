"use client";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

const CHAVE = "mxerp:saldos-visiveis";

function ler() {
  try { return localStorage.getItem(CHAVE) === "1"; } catch { return false; }
}

/** Saldo oculto por padrão (R$ ••••••), com o olho para mostrar; a escolha fica guardada no navegador. */
export function ValorOculto({ valor, className = "" }: { valor: string; className?: string }) {
  const [ver, setVer] = useState(false);
  useEffect(() => {
    setVer(ler());
    const f = () => setVer(ler());
    window.addEventListener("mxerp:saldos", f);
    return () => window.removeEventListener("mxerp:saldos", f);
  }, []);
  return <span className={className}>{ver ? valor : "R$ ••••••"}</span>;
}

export function BotaoOlho({ className = "" }: { className?: string }) {
  const [ver, setVer] = useState(false);
  useEffect(() => setVer(ler()), []);
  const alternar = () => {
    const novo = !ver;
    try { localStorage.setItem(CHAVE, novo ? "1" : "0"); } catch {}
    setVer(novo);
    window.dispatchEvent(new Event("mxerp:saldos"));
  };
  return (
    <button type="button" onClick={alternar} className={className} title={ver ? "Ocultar saldos" : "Mostrar saldos"} aria-label={ver ? "Ocultar saldos" : "Mostrar saldos"}>
      {ver ? <EyeOff size={14} strokeWidth={1.8} /> : <Eye size={14} strokeWidth={1.8} />}
    </button>
  );
}
