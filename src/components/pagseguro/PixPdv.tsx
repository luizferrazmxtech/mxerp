"use client";

import { useEffect, useRef, useState } from "react";
import Icone from "@/components/Icone";
import { cancelarPixAcao, consultarPixAcao, criarPixAcao, type PixTela, type ProvedorPix } from "@/lib/pagseguro/acoes";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * PDV: QR do PIX do PagSeguro ou do Banco Inter. Consulta o pagamento a cada poucos segundos; quando o banco
 * confirma, chama onPago e a venda fecha sozinha.
 */
export default function PixPdv({ valor, clienteId, provedor = "PAGSEGURO", onPago, onFechar }: { valor: number; clienteId?: string | null; provedor?: ProvedorPix; onPago: (cobrancaId: string) => void; onFechar: () => void }) {
  const [pix, setPix] = useState<PixTela | null>(null);
  const [situacao, setSituacao] = useState("PENDENTE");
  const [aviso, setAviso] = useState("");
  const [copiado, setCopiado] = useState(false);
  const pago = useRef(false);
  const aoPagar = useRef(onPago);
  useEffect(() => { aoPagar.current = onPago; }, [onPago]);

  useEffect(() => { void criarPixAcao(valor, clienteId, provedor).then(setPix); }, [valor, clienteId, provedor]);

  useEffect(() => {
    if (!pix?.ok) return;
    const t = setInterval(async () => {
      const r = await consultarPixAcao(pix.id);
      setAviso(r.ok ? "" : r.mensagem ?? "");
      setSituacao(r.situacao);
      if (r.situacao === "PAGA" && !pago.current) { pago.current = true; clearInterval(t); aoPagar.current(pix.id); }
      if (r.situacao === "EXPIRADA" || r.situacao === "CANCELADA") clearInterval(t);
    }, provedor === "INTER" ? 4000 : 3000);
    return () => clearInterval(t);
  }, [pix, provedor]);

  const fechar = async () => { if (pix?.ok && situacao === "PENDENTE") await cancelarPixAcao(pix.id); onFechar(); };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-12">
      <div className="cartao w-full max-w-sm shadow-xl">
        <div className="flex items-center border-b px-4 py-3">
          <h3 className="flex items-center gap-2 text-[16px]"><Icone nome="pix" size={16} /> PIX <b>{provedor === "INTER" ? "Banco Inter" : "PagSeguro"}</b></h3>
          {situacao !== "PAGA" && <button className="ml-auto text-slate-500 hover:text-black" onClick={fechar} aria-label="Fechar"><Icone nome="fechar" /></button>}
        </div>
        <div className="flex flex-col items-center gap-3 p-4 text-center">
          <div className="text-[28px] font-semibold">{brl(valor)}</div>
          {!pix && <p className="py-16 text-[13px] text-slate-500">Gerando o QR…</p>}
          {pix && !pix.ok && <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">{pix.mensagem}</p>}
          {pix?.ok && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pix.imagem} alt="QR do PIX" className={`h-64 w-64 ${situacao !== "PENDENTE" ? "opacity-30" : ""}`} />
              <button type="button" className="btn-sec text-[12px]" onClick={() => { void navigator.clipboard.writeText(pix.texto); setCopiado(true); }}>
                <Icone nome="copiar" size={13} /> {copiado ? "Copiado" : "Copiar PIX copia e cola"}
              </button>
              {situacao === "PENDENTE" && <p className="flex items-center gap-2 text-[13px] text-slate-600"><span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" /> Aguardando o pagamento… vale até {new Date(pix.expiraEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>}
              {situacao === "PAGA" && <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-[14px] font-semibold text-emerald-800"><Icone nome="confirmado" size={15} /> PIX recebido. Fechando a venda…</p>}
              {situacao === "EXPIRADA" && <p className="text-[13px] text-red-700">O QR venceu sem pagamento. Feche e finalize de novo para gerar outro.</p>}
              {aviso && <p className="text-[12px] text-amber-700">{aviso}</p>}
            </>
          )}
          {situacao !== "PAGA" && <button type="button" className="btn-sec w-full" onClick={fechar}>Cancelar e escolher outra forma</button>}
        </div>
      </div>
    </div>
  );
}
