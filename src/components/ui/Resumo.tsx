import Link from "next/link";
import Icone from "@/components/Icone";

export type CorResumo = "tinta" | "vermelho" | "amarelo" | "azul" | "verde" | "cinza" | "roxo";

// medidas e cores tiradas dos cartões do Gestão Click (ícone em quadrado 32px com fundo claro, anel de 40px)
const COR: Record<CorResumo, { fundo: string; texto: string; anel: string; trilho: string }> = {
  tinta: { fundo: "bg-[#e9ecef]", texto: "text-[#212529]", anel: "#0c1b25", trilho: "#0c1b25" },
  vermelho: { fundo: "bg-[#f4e4e5]", texto: "text-[#a8323e]", anel: "#a8323e", trilho: "#f1dcde" },
  amarelo: { fundo: "bg-[#f5ebdc]", texto: "text-[#a2620a]", anel: "#a2620a", trilho: "#f1e4cf" },
  azul: { fundo: "bg-[#e9ecef]", texto: "text-[#495057]", anel: "#495057", trilho: "#e5e7ea" },
  verde: { fundo: "bg-[#e3efe3]", texto: "text-[#1d7a34]", anel: "#1d7a34", trilho: "#d9eadb" },
  cinza: { fundo: "bg-[#e9ecef]", texto: "text-[#6c757d]", anel: "#6c757d", trilho: "#e5e7ea" },
  roxo: { fundo: "bg-violet-50", texto: "text-violet-700", anel: "#6d28d9", trilho: "#ede9fe" },
};

export type Cartao = {
  rotulo: string;
  valor: string;
  legenda?: React.ReactNode;
  icone: string;
  cor: CorResumo;
  /** 0 a 100: desenha o anel com o percentual (como no Gestão Click) */
  pct?: number;
  href?: string;
  ativo?: boolean;
};

/** Anel de percentual (SVG), com o número no meio. */
export function Anel({ pct, cor }: { pct: number; cor: CorResumo }) {
  const p = Math.max(0, Math.min(100, pct));
  const r = 18, c = 2 * Math.PI * r;
  const k = COR[cor];
  return (
    <svg viewBox="0 0 42 42" className="h-[42px] w-[42px] shrink-0" role="img" aria-label={`${Math.round(p)}%`}>
      <circle cx="21" cy="21" r={r} fill="none" stroke={k.trilho} strokeWidth="2.2" />
      <circle cx="21" cy="21" r={r} fill="none" stroke={k.anel} strokeWidth="2.2"
        strokeDasharray={`${(p / 100) * c} ${c}`} transform="rotate(-90 21 21)" />
      <text x="21" y="21.5" textAnchor="middle" dominantBaseline="central" fill={cor === "tinta" ? "#212529" : k.anel} style={{ fontSize: 9 }}>
        {p > 0 && p < 1 ? "1" : Math.round(p)}%
      </text>
    </svg>
  );
}

/**
 * Cartões de resumo do topo das listas (Total do período, Vencidos, Vencem hoje, A vencer, Recebidos…),
 * no mesmo desenho do Gestão Click. Com `href`, clicar no cartão filtra a lista por aquela situação.
 */
/** `compacto`: duas colunas já no celular (Área do Cliente). */
export default function Resumo({ cartoes, compacto }: { cartoes: Cartao[]; compacto?: boolean }) {
  const cols = cartoes.length >= 5 ? "xl:grid-cols-5" : cartoes.length === 4 ? "xl:grid-cols-4" : "xl:grid-cols-3";
  return (
    <div className={`no-print mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 ${compacto ? "grid-cols-2" : "grid-cols-1"} ${cols}`}>
      {cartoes.map((k) => {
        const c = COR[k.cor];
        const corpo = (
          <>
            <div className="flex min-h-[42px] items-start gap-3">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded ${c.fundo} ${c.texto}`}><Icone nome={k.icone} size={16} strokeWidth={2.2} /></span>
              <span className="flex-1 pt-1.5 text-[13px] font-semibold text-[#495057]">{k.rotulo}</span>
              {k.pct !== undefined && <span className={compacto ? "hidden sm:block" : undefined}><Anel pct={k.pct} cor={k.cor} /></span>}
            </div>
            <div className={`mt-1.5 font-bold leading-7 text-[#212529] ${compacto ? "text-[19px] sm:text-[24px]" : "text-[24px]"}`}>{k.valor}</div>
            {k.legenda && <div className="mt-0.5 text-[12px] text-[#6c757d]">{k.legenda}</div>}
          </>
        );
        const cls = `block rounded-lg border bg-white ${compacto ? "p-3 sm:p-4" : "p-4"} ${k.ativo ? "border-[#0c1b25] ring-1 ring-[#0c1b25]" : "border-[#dee2e6]"}`;
        return k.href
          ? <Link key={k.rotulo} href={k.href} className={`${cls} transition hover:shadow-sm`} title={k.ativo ? "Clique para mostrar todos" : `Mostrar só: ${k.rotulo.toLowerCase()}`}>{corpo}</Link>
          : <div key={k.rotulo} className={cls}>{corpo}</div>;
      })}
    </div>
  );
}
