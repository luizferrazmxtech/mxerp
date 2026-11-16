"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Icone from "@/components/Icone";

/** 🗑 vermelho: pergunta antes, chama a ação do servidor e mostra a resposta. */
export default function BotaoExcluir({ acao, pergunta, depois, rotulo }: {
  acao: () => Promise<{ ok: boolean; mensagem: string }>; pergunta: string; depois?: string; rotulo?: string;
}) {
  const [pendente, start] = useTransition();
  const router = useRouter();
  return (
    <button type="button" disabled={pendente} title="Excluir" className={rotulo ? "flex w-full items-center gap-2 px-3 py-[7px] text-left text-red-600 hover:bg-slate-100" : "btn-icone text-red-600"}
      onClick={() => {
        if (!window.confirm(pergunta)) return;
        start(async () => {
          const r = await acao();
          if (!r.ok) window.alert(r.mensagem);
          if (r.ok && depois) router.push(depois); else router.refresh();
        });
      }}>
      <Icone nome="excluir" size={13} />{rotulo && <span>{rotulo}</span>}
    </button>
  );
}
