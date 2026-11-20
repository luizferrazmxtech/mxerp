import Link from "next/link";
import type { ReactNode } from "react";

export function Pagina({ titulo, sub, acoes, children }: { titulo: string; sub?: ReactNode; acoes?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-tinta">{titulo}</h1>
          {sub && <div className="text-[13px] text-slate-500">{sub}</div>}
        </div>
        {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
      </div>
      {children}
    </div>
  );
}

export function Bloco({ titulo, acoes, children }: { titulo?: string; acoes?: ReactNode; children: ReactNode }) {
  return (
    <section className="cartao mb-4 overflow-hidden">
      {(titulo || acoes) && (
        <div className="flex items-center justify-between gap-2 border-b border-[#dee2e6] bg-[#f7f7f7] px-4 py-2.5">
          <h2 className="font-semibold">{titulo}</h2>
          {acoes}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Resumo({ itens }: { itens: { rotulo: string; valor: ReactNode; cor?: string; href?: string }[] }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      {itens.map((i) => {
        const conteudo = (
          <div className="cartao h-full p-4" style={{ borderTop: `3px solid ${i.cor ?? "#018e83"}` }}>
            <div className="text-[12px] uppercase tracking-wide text-slate-500">{i.rotulo}</div>
            <div className="mt-1 text-[22px] font-semibold">{i.valor}</div>
          </div>
        );
        return i.href ? <Link key={i.rotulo} href={i.href}>{conteudo}</Link> : <div key={i.rotulo}>{conteudo}</div>;
      })}
    </div>
  );
}

const CORES: Record<string, string> = {
  EM_DIA: "#1f9d55", AVISO: "#d97706", SO_LEITURA: "#ea580c", BLOQUEADO: "#dc2626",
  ATIVO: "#1f9d55", CRIANDO: "#2563eb", SUSPENSO: "#dc2626", CANCELADO: "#64748b",
  ABERTA: "#d97706", PAGA: "#1f9d55", CANCELADA: "#64748b",
  PENDENTE: "#2563eb", EXECUTANDO: "#7c3aed", OK: "#1f9d55", ERRO: "#dc2626",
};
export function Pilula({ valor, rotulo }: { valor: string; rotulo?: string }) {
  return <span className="pilula" style={{ color: CORES[valor] ?? "#475569" }}>{rotulo ?? valor.replace("_", " ").toLowerCase()}</span>;
}

export function Aviso({ tipo = "ok", children }: { tipo?: "ok" | "erro" | "info"; children: ReactNode }) {
  const c = tipo === "erro" ? "border-red-300 bg-red-50 text-red-800" : tipo === "info" ? "border-sky-300 bg-sky-50 text-sky-900" : "border-emerald-300 bg-emerald-50 text-emerald-900";
  return <div className={`mb-4 rounded border px-3 py-2 text-[14px] ${c}`}>{children}</div>;
}

export function Campo({ rotulo, obrig, children, className }: { rotulo: string; obrig?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className={`rotulo ${obrig ? "obrig" : ""}`}>{rotulo}</span>
      {children}
    </label>
  );
}
