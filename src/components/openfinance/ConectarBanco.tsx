"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { registrarConexaoAcao, tokenConexaoAcao } from "@/lib/openfinance/acoes";

type PluggyConnectCtor = new (o: {
  connectToken: string; updateItem?: string; includeSandbox?: boolean;
  onSuccess: (d: { item: { id: string } }) => void; onError?: (e: { message?: string }) => void; onClose?: () => void;
}) => { init: () => Promise<void> };

const SCRIPT = "https://cdn.pluggy.ai/pluggy-connect/latest/pluggy-connect.js";

function carregarScript(): Promise<PluggyConnectCtor> {
  const w = window as unknown as { PluggyConnect?: PluggyConnectCtor };
  if (w.PluggyConnect) return Promise.resolve(w.PluggyConnect);
  return new Promise((ok, falha) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => (w.PluggyConnect ? ok(w.PluggyConnect) : falha(new Error("Pluggy Connect não carregou")));
    s.onerror = () => falha(new Error("Sem acesso ao Pluggy Connect (cdn.pluggy.ai)"));
    document.head.appendChild(s);
  });
}

/** Abre a janela do Pluggy Connect: o cliente escolhe o banco e autoriza o compartilhamento pelo Open Finance. */
export default function ConectarBanco({ itemId, rotulo = "Conectar banco", secundario }: { itemId?: string; rotulo?: string; secundario?: boolean }) {
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const router = useRouter();
  async function abrir() {
    setOcupado(true);
    setMsg(null);
    try {
      const t = await tokenConexaoAcao(itemId);
      if (!t.ok) throw new Error(t.mensagem);
      const Ctor = await carregarScript();
      await new Ctor({
        connectToken: t.token, ...(itemId ? { updateItem: itemId } : {}),
        onSuccess: async ({ item }) => {
          const r = await registrarConexaoAcao(item.id);
          setMsg(r ? { ok: r.ok, texto: r.mensagem } : null);
          router.refresh();
        },
        onError: (e) => setMsg({ ok: false, texto: e?.message ?? "O banco não autorizou a conexão" }),
      }).init();
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setOcupado(false);
    }
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" onClick={abrir} disabled={ocupado} className={secundario ? "btn-sec" : "btn-verde"}>{ocupado ? "Abrindo…" : rotulo}</button>
      {msg && <span className={`text-[12px] ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.texto}</span>}
    </span>
  );
}
