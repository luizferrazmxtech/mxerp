"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icone from "@/components/Icone";
import { desabilitarAreaCliente, enviarLinkAreaCliente, gerarLinkAreaCliente, type ResultadoPortal } from "@/lib/portal/acoesErp";

type Props = {
  id: string;
  habilitada: boolean;
  temSenha: boolean;
  ultimoAcesso: string | null;
  email: string | null;
  celular: string | null;
  nome: string;
};

/**
 * Botão verde "Área do Cliente" do cadastro: habilita o acesso e gera o link para o cliente criar a senha
 * (copiar, mandar pelo WhatsApp ou por e-mail). Também mostra se o cliente já entrou e permite desabilitar.
 */
export function BotaoAreaCliente(p: Props) {
  const [aberto, setAberto] = useState(false);
  const [r, setR] = useState<ResultadoPortal>(null);
  const [pendente, start] = useTransition();
  const [copiado, setCopiado] = useState(false);
  const router = useRouter();
  const rodar = (f: () => Promise<ResultadoPortal>) => start(async () => { setR(await f()); router.refresh(); });
  const whats = p.celular?.replace(/\D/g, "");
  const msg = r?.link ? `Olá! Seu acesso à nossa Área do Cliente está pronto. Por lá você acompanha suas OS e compras e baixa notas e boletos. Crie sua senha neste link (vale 7 dias): ${r.link}` : "";

  return (
    <>
      <button type="button" className="btn-verde" onClick={() => { setAberto(true); setR(null); }}>
        <Icone nome="pessoa" size={15} /> {p.habilitada ? "Área do Cliente" : "Habilitar Área do Cliente"}
      </button>
      {aberto && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[10vh]" onClick={() => setAberto(false)}>
          <div className="cartao w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 rounded-t-md border-b border-slate-200 bg-[#f7f7f7] px-4 py-3">
              <h2 className="flex-1 text-[17px] font-light">Área do Cliente · <b className="font-semibold">{p.nome}</b></h2>
              <button className="btn-icone" onClick={() => setAberto(false)} aria-label="Fechar"><Icone nome="fechar" size={16} /></button>
            </div>
            <div className="space-y-3 p-4 text-[14px]">
              <p className="text-slate-600">
                No portal o cliente acompanha as OS e compras e baixa notas fiscais (PDF e XML) e boletos. Ele entra com o CPF/CNPJ (ou e-mail) e uma senha que ele mesmo cria pelo link.
              </p>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[13px]">
                {!p.habilitada ? "Ainda não habilitada." : p.temSenha
                  ? <>Habilitada. Senha criada{p.ultimoAcesso ? <>, último acesso em <b>{p.ultimoAcesso}</b></> : ", ainda não entrou"}.</>
                  : "Habilitada, mas o cliente ainda não criou a senha."}
              </div>

              {r?.link ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input readOnly value={r.link} className="campo flex-1 text-[12px]" onFocus={(e) => e.currentTarget.select()} />
                    <button type="button" className="btn-sec" onClick={async () => { await navigator.clipboard.writeText(r.link!).catch(() => {}); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }}>
                      <Icone nome={copiado ? "ok" : "copiar"} size={14} /> {copiado ? "Copiado" : "Copiar"}
                    </button>
                  </div>
                  {whats && <a className="btn-verde" target="_blank" rel="noreferrer" href={`https://wa.me/55${whats}?text=${encodeURIComponent(msg)}`}><Icone nome="whatsapp" size={15} /> Mandar pelo WhatsApp</a>}
                </div>
              ) : null}
              {r && <p className={`text-[13px] ${r.ok ? "text-emerald-700" : "text-red-700"}`}>{r.mensagem}</p>}

              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                <button type="button" className="btn-marca" disabled={pendente} onClick={() => rodar(() => gerarLinkAreaCliente(p.id))}>
                  <Icone nome="chave" size={15} /> {p.habilitada ? (p.temSenha ? "Gerar link para trocar a senha" : "Gerar novo link") : "Habilitar e gerar link"}
                </button>
                {p.email && <button type="button" className="btn-sec" disabled={pendente} onClick={() => rodar(() => enviarLinkAreaCliente(p.id))}><Icone nome="email" size={15} /> Mandar link por e-mail</button>}
                <a href="/area-cliente/entrar" target="_blank" className="btn-sec"><Icone nome="olho" size={15} /> Abrir o portal</a>
                {p.habilitada && <button type="button" className="btn-sec ml-auto text-red-700" disabled={pendente}
                  onClick={() => { if (window.confirm("Desabilitar a Área do Cliente? A senha é apagada e o cliente sai na hora.")) rodar(() => desabilitarAreaCliente(p.id)); }}>Desabilitar</button>}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
