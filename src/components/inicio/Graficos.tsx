import { abreviar, escalaEixo } from "@/lib/inicio/escala";

export type Serie = { nome: string; cor: string; valores: number[]; tipo?: "barra" | "linha"; tracejada?: boolean };

const L = 640, A = 230, ESQ = 44, DIR = 8, TOPO = 10, BASE = 26;

/**
 * Gráfico de colunas por mês (SVG renderizado no servidor). Barras lado a lado ou empilhadas,
 * linhas por cima no MESMO eixo (nunca dois eixos). Passar o mouse numa coluna mostra os valores do mês.
 */
export function GraficoColunas({ rotulos, series, empilhar = false, formatar, titulo, links }: {
  rotulos: string[]; series: Serie[]; empilhar?: boolean; formatar: (v: number) => string; titulo: string;
  /** Endereço aberto ao clicar na coluna de cada mês (opcional). */
  links?: (string | undefined)[];
}) {
  const barras = series.filter((s) => s.tipo !== "linha");
  const linhas = series.filter((s) => s.tipo === "linha");
  const n = rotulos.length;
  const pilhas = rotulos.map((_, i) => barras.reduce((s, b) => s + Math.max(b.valores[i], 0), 0));
  const todos = [...(empilhar ? pilhas : barras.flatMap((b) => b.valores)), ...linhas.flatMap((l) => l.valores)];
  const { baixo, alto, valores: marcas } = escalaEixo(Math.min(0, ...todos), Math.max(0, ...todos));
  const y = (v: number) => TOPO + ((alto - v) / (alto - baixo)) * (A - TOPO - BASE);
  const larg = (L - ESQ - DIR) / n;
  // muitos rótulos (ex.: 31 dias, 36 meses): mostra um a cada `passo` para não encavalar; o mouse mostra todos
  const passo = Math.max(1, Math.ceil(n / Math.floor((L - ESQ - DIR) / Math.max(...rotulos.map((r) => r.length * 6.5 + 6), 1))));
  const cx = (i: number) => ESQ + larg * i + larg / 2;
  const grupo = Math.min(larg * 0.55, 56);
  const lb = empilhar ? grupo : Math.max((grupo - (barras.length - 1) * 2) / barras.length, 4);

  return (
    <figure>
      <svg viewBox={`0 0 ${L} ${A}`} className="h-auto w-full" role="img" aria-label={titulo}>
        {marcas.map((m) => (
          <g key={m}>
            <line x1={ESQ} x2={L - DIR} y1={y(m)} y2={y(m)} stroke={m === 0 ? "#cbd5e1" : "#eef0f2"} />
            <text x={ESQ - 6} y={y(m) + 3.5} textAnchor="end" fontSize="10" fill="#64748b">{abreviar(m)}</text>
          </g>
        ))}
        {rotulos.map((r, i) => {
          let acima = 0;
          return (
            <g key={r}>
              {barras.map((b, j) => {
                const v = b.valores[i];
                if (!v) return null;
                let y0: number, y1: number, x: number;
                if (empilhar) { y0 = y(acima); acima += Math.max(v, 0); y1 = y(acima); x = cx(i) - grupo / 2; }
                else { y0 = y(0); y1 = y(v); x = cx(i) - grupo / 2 + j * (lb + 2); }
                const top = Math.min(y0, y1), h = Math.max(Math.abs(y0 - y1) - (empilhar && j > 0 ? 2 : 0), 1);
                return <rect key={b.nome} x={x} y={top} width={lb} height={h} rx={empilhar && j < barras.length - 1 ? 0 : 3} fill={b.cor} />;
              })}
              {i % passo === 0 && <text x={cx(i)} y={A - 8} textAnchor="middle" fontSize="11" fill="#64748b">{r}</text>}
            </g>
          );
        })}
        {linhas.map((l) => (
          <g key={l.nome}>
            <polyline fill="none" stroke={l.cor} strokeWidth={l.tracejada ? 1.5 : 2} strokeDasharray={l.tracejada ? "4 4" : undefined}
              points={l.valores.map((v, i) => `${cx(i)},${y(v)}`).join(" ")} />
            {!l.tracejada && l.valores.map((v, i) => <circle key={i} cx={cx(i)} cy={y(v)} r={4} fill="#fff" stroke={l.cor} strokeWidth={2} />)}
          </g>
        ))}
        {/* área de passar o mouse: a coluna inteira do mês */}
        {rotulos.map((r, i) => {
          const area = (
            <rect key={r} x={ESQ + larg * i} y={TOPO} width={larg} height={A - TOPO - BASE} fill="transparent" className={`hover:fill-slate-500/5 ${links?.[i] ? "cursor-pointer" : ""}`}>
              <title>{`${r}\n${series.map((s) => `${s.nome}: ${formatar(s.valores[i])}`).join("\n")}${links?.[i] ? "\nClique para detalhar" : ""}`}</title>
            </rect>
          );
          return links?.[i] ? <a key={r} href={links[i]}>{area}</a> : area;
        })}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 px-2 text-[12px] text-slate-600">
        {series.map((s) => (
          <span key={s.nome} className="flex items-center gap-1.5">
            {s.tipo === "linha"
              ? <svg width="18" height="8"><line x1="0" x2="18" y1="4" y2="4" stroke={s.cor} strokeWidth="2" strokeDasharray={s.tracejada ? "4 3" : undefined} />{!s.tracejada && <circle cx="9" cy="4" r="3" fill="#fff" stroke={s.cor} strokeWidth="1.5" />}</svg>
              : <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.cor }} />}
            {s.nome}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/** Anel de percentual (como "Recebido em novembro 61%"). */
export function Anel({ pct, cor }: { pct: number; cor: string }) {
  const r = 14, c = 2 * Math.PI * r;
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" className="shrink-0" aria-label={`${Math.round(pct)}%`}>
      <circle cx="18" cy="18" r={r} fill="none" stroke="#eee" strokeWidth="3" />
      <circle cx="18" cy="18" r={r} fill="none" stroke={cor} strokeWidth="3" strokeLinecap={pct > 0 ? "round" : "butt"} strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 18 18)" />
      <text x="18" y="21" textAnchor="middle" fontSize="8" fill="#555">{Math.round(pct)}%</text>
    </svg>
  );
}
