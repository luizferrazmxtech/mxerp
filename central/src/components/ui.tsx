import Link from "next/link";
import type { ReactNode } from "react";
import Icone, { type NomeIcone } from "./Icone";

/** Título da página com ícone e trilha "Início › …" à direita (igual ao MXERP). */
export function Pagina({ titulo, icone, trilha = [], sub, acoes, children }: {
  titulo: ReactNode; icone?: NomeIcone; trilha?: { rotulo: string; href?: string }[]; sub?: ReactNode; acoes?: ReactNode; children: ReactNode;
}) {
  return (
    <div>
      <div className="-mx-4 mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 px-4 pb-3 md:-mx-5 md:px-5">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-[24px] font-medium text-[#212529]">{icone && <Icone nome={icone} size={22} />}{titulo}</h1>
          {sub && <div className="text-[13px] text-slate-500">{sub}</div>}
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
        <nav className="ml-auto hidden items-center gap-1 text-[12px] text-slate-500 sm:flex">
          <Link href="/" className="flex items-center gap-1 hover:underline"><Icone nome="inicio" size={12} /> Início</Link>
          {trilha.map((t, i) => (
            <span key={i} className="flex items-center gap-1">
              <span>›</span>
              {t.href ? <Link href={t.href} className="hover:underline">{t.rotulo}</Link> : <span className="font-semibold text-slate-700">{t.rotulo}</span>}
            </span>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}

/** Bloco com cabeçalho cinza ("Informe os **dados** …") como nos formulários do MXERP. */
export function Bloco({ titulo, icone, subtitulo, acoes, children, corpo = "p-4" }: {
  titulo?: ReactNode; icone?: NomeIcone; subtitulo?: string; acoes?: ReactNode; children: ReactNode; corpo?: string;
}) {
  return (
    <section className="cartao mb-3 overflow-hidden">
      {(titulo || acoes) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-[#f7f7f7] px-4 py-3">
          <div className="flex-1">
            <h2 className="flex items-center gap-1.5 text-[17px] font-light text-slate-800 [&_b]:font-semibold">{icone && <Icone nome={icone} size={15} />} {titulo}</h2>
            {subtitulo && <p className="mt-0.5 text-[11px] text-slate-500">{subtitulo}</p>}
          </div>
          {acoes}
        </div>
      )}
      <div className={corpo}>{children}</div>
    </section>
  );
}

export type CorResumo = "tinta" | "vermelho" | "amarelo" | "verde" | "cinza" | "azul";
// medidas e cores dos cartões do MXERP (ícone em quadrado de 32px e anel de percentual)
const COR: Record<CorResumo, { fundo: string; texto: string; anel: string; trilho: string }> = {
  tinta: { fundo: "bg-[#e9ecef]", texto: "text-[#212529]", anel: "#0c1b25", trilho: "#e5e7ea" },
  vermelho: { fundo: "bg-[#f4e4e5]", texto: "text-[#a8323e]", anel: "#a8323e", trilho: "#f1dcde" },
  amarelo: { fundo: "bg-[#f5ebdc]", texto: "text-[#a2620a]", anel: "#a2620a", trilho: "#f1e4cf" },
  verde: { fundo: "bg-[#e3efe3]", texto: "text-[#1d7a34]", anel: "#1d7a34", trilho: "#d9eadb" },
  cinza: { fundo: "bg-[#e9ecef]", texto: "text-[#6c757d]", anel: "#6c757d", trilho: "#e5e7ea" },
  azul: { fundo: "bg-[#e9ecef]", texto: "text-[#495057]", anel: "#495057", trilho: "#e5e7ea" },
};

function Anel({ pct, cor }: { pct: number; cor: CorResumo }) {
  const p = Math.max(0, Math.min(100, pct));
  const r = 18, c = 2 * Math.PI * r, k = COR[cor];
  return (
    <svg viewBox="0 0 42 42" className="h-[42px] w-[42px] shrink-0" role="img" aria-label={`${Math.round(p)}%`}>
      <circle cx="21" cy="21" r={r} fill="none" stroke={k.trilho} strokeWidth="2.2" />
      <circle cx="21" cy="21" r={r} fill="none" stroke={k.anel} strokeWidth="2.2" strokeDasharray={`${(p / 100) * c} ${c}`} transform="rotate(-90 21 21)" />
      <text x="21" y="21.5" textAnchor="middle" dominantBaseline="central" fill={k.anel} style={{ fontSize: 9 }}>{p > 0 && p < 1 ? "1" : Math.round(p)}%</text>
    </svg>
  );
}

export type Cartao = { rotulo: string; valor: ReactNode; legenda?: ReactNode; icone: NomeIcone; cor: CorResumo; pct?: number; href?: string; ativo?: boolean };

/** Cartões de resumo do topo das listas. Com href, o cartão filtra a lista. */
export function Resumo({ cartoes }: { cartoes: Cartao[] }) {
  const cols = cartoes.length >= 4 ? "xl:grid-cols-4" : "xl:grid-cols-3";
  return (
    <div className={`mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 ${cols}`}>
      {cartoes.map((k) => {
        const c = COR[k.cor];
        const corpo = (
          <>
            <div className="flex min-h-[42px] items-start gap-3">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded ${c.fundo} ${c.texto}`}><Icone nome={k.icone} size={16} strokeWidth={2.2} /></span>
              <span className="flex-1 pt-1.5 text-[13px] font-semibold text-[#495057]">{k.rotulo}</span>
              {k.pct !== undefined && <Anel pct={k.pct} cor={k.cor} />}
            </div>
            <div className="mt-1.5 text-[24px] font-bold leading-7 text-[#212529]">{k.valor}</div>
            {k.legenda && <div className="mt-0.5 text-[12px] text-[#6c757d]">{k.legenda}</div>}
          </>
        );
        const cls = `block rounded-lg border bg-white p-4 ${k.ativo ? "border-[#0c1b25] ring-1 ring-[#0c1b25]" : "border-[#dee2e6]"}`;
        return k.href ? <Link key={k.rotulo} href={k.href} className={`${cls} transition hover:shadow-sm`}>{corpo}</Link> : <div key={k.rotulo} className={cls}>{corpo}</div>;
      })}
    </div>
  );
}

const CORES: Record<string, string> = {
  EM_DIA: "#1d7a34", AVISO: "#a2620a", SO_LEITURA: "#c2410c", BLOQUEADO: "#a8323e",
  ATIVO: "#1d7a34", CRIANDO: "#2563eb", SUSPENSO: "#a8323e", CANCELADO: "#6c757d",
  ABERTA: "#a2620a", PAGA: "#1d7a34", CANCELADA: "#6c757d",
  PENDENTE: "#2563eb", EXECUTANDO: "#7c3aed", OK: "#1d7a34", ERRO: "#a8323e", CASA: "#018e83",
};
export function Pilula({ valor, rotulo }: { valor: string; rotulo?: string }) {
  return <span className="pilula" style={{ color: CORES[valor] ?? "#475569" }}>{rotulo ?? valor.replace("_", " ").toLowerCase()}</span>;
}

export function Aviso({ tipo = "ok", children }: { tipo?: "ok" | "erro" | "info" | "alerta"; children: ReactNode }) {
  const c = tipo === "erro" ? "border-red-300 bg-red-50 text-red-800" : tipo === "info" ? "border-sky-300 bg-sky-50 text-sky-900"
    : tipo === "alerta" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-300 bg-emerald-50 text-emerald-900";
  return <div className={`mb-3 rounded border px-3 py-2 text-[14px] ${c}`}>{children}</div>;
}

export function Campo({ rotulo, obrig, children, className }: { rotulo: string; obrig?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className={`rotulo ${obrig ? "obrig" : ""}`}>{rotulo}</span>
      {children}
    </label>
  );
}

/** Tabela das listagens com rodapé "Registros | N no total". */
export function Lista({ total, children }: { total: number; children: ReactNode }) {
  return (
    <div className="cartao overflow-hidden">
      <div className="overflow-x-auto">{children}</div>
      <div className="border-t border-slate-200 px-3 py-2.5 text-[12px] text-slate-600">Registros <span className="mx-1 text-slate-300">|</span> <b>{total}</b> no total</div>
    </div>
  );
}

/** Abas (filtros e fichas) no estilo do MXERP. */
export function Abas({ itens, atual }: { itens: { chave: string; rotulo: string; href: string; icone?: NomeIcone }[]; atual: string }) {
  return (
    <div className="mb-3 flex flex-wrap gap-1 border-b border-slate-200">
      {itens.map((a) => (
        <Link key={a.chave} href={a.href}
          className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[14px] ${a.chave === atual ? "border-marca font-semibold text-black" : "border-transparent text-slate-600 hover:text-black"}`}>
          {a.icone && <Icone nome={a.icone} size={14} />} {a.rotulo}
        </Link>
      ))}
    </div>
  );
}

export function NoAr({ ar }: { ar: boolean | null }) {
  return ar === null ? <span className="text-slate-400">—</span> : ar ? <Pilula valor="OK" rotulo="no ar" /> : <Pilula valor="ERRO" rotulo="fora do ar" />;
}
