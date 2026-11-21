import Link from "next/link";
import type { Licenca } from "@/lib/licenca/licenca";

/** Faixa no topo quando a mensalidade da revenda está atrasada (aviso ou só leitura). */
export default function FaixaLicenca({ l }: { l: Licenca }) {
  if (l.situacao === "EM_DIA" || !l.mensagem) return null;
  const forte = l.situacao !== "AVISO";
  return (
    <div className={`no-print mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded border px-3 py-2 text-[14px] ${forte ? "border-red-300 bg-red-50 text-red-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
      <span className="font-semibold">{l.mensagem}</span>
      {l.fatura?.link && <a className="underline" href={l.fatura.link} target="_blank" rel="noreferrer">Abrir boleto</a>}
      <Link className="underline" href="/licenca">Pagar com Pix ou linha digitável</Link>
    </div>
  );
}
