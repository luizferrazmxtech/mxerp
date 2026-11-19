"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icone from "@/components/Icone";

/** Botão de ação do servidor que mostra o resultado ao lado (processar contratos, gerar cobrança, reenviar e-mail). */
export default function BotaoResultado({ acao, icone, children, className = "btn-sec", confirmar }: {
  acao: () => Promise<{ ok: boolean; mensagem: string }>; icone?: string; children: React.ReactNode; className?: string; confirmar?: string;
}) {
  const [pendente, start] = useTransition();
  const [r, setR] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const router = useRouter();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" disabled={pendente} className={className}
        onClick={() => {
          if (confirmar && !window.confirm(confirmar)) return;
          start(async () => { const x = await acao(); setR(x); router.refresh(); });
        }}>
        {icone && <Icone nome={icone} size={14} />} {pendente ? "Aguarde…" : children}
      </button>
      {r && <span className={`text-[12px] ${r.ok ? "text-emerald-700" : "text-red-700"}`}>{r.mensagem}</span>}
    </span>
  );
}
