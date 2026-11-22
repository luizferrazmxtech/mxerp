import Link from "next/link";

/**
 * Gráficos dos relatórios (HTML/SVG renderizados no servidor, sem biblioteca).
 * Mesmas regras do Início: um eixo só, legenda sempre que houver 2+ séries, valor ao passar o mouse.
 */

export type SerieH = { nome: string; cor: string };
export type LinhaH = { chave: string; rotulo: string; detalhe?: string; href?: string; valores: number[]; total?: string };

/**
 * Barras horizontais, com segmentos empilhados (ex.: custo + lucro = faturamento).
 * O nome fica em texto à esquerda e o total à direita; a barra mostra a proporção.
 */
export function BarrasH({ titulo, series, linhas, formatar, vazio = "Sem dados no período.", destaque }: {
  titulo: React.ReactNode; series: SerieH[]; linhas: LinhaH[]; formatar: (v: number) => string; vazio?: string;
  /** chave da linha a destacar (ex.: o gargalo) */
  destaque?: string;
}) {
  const soma = (l: LinhaH) => l.valores.reduce((s, v) => s + Math.max(v, 0), 0);
  const max = Math.max(1, ...linhas.map(soma));
  return (
    <div className="cartao p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[14px] font-semibold text-slate-700">{titulo}</h3>
        {series.length > 1 && (
          <div className="flex flex-wrap gap-x-3 text-[12px] text-slate-600">
            {series.map((s) => <span key={s.nome} className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.cor }} />{s.nome}</span>)}
          </div>
        )}
      </div>
      {!linhas.length && <p className="py-6 text-center text-[13px] text-slate-500">{vazio}</p>}
      <ul className="space-y-2.5">
        {linhas.map((l) => {
          const nome = <span className="truncate">{l.rotulo}{l.detalhe && <span className="ml-1.5 text-[12px] text-slate-400">{l.detalhe}</span>}</span>;
          return (
            <li key={l.chave} title={`${l.rotulo}\n${series.map((s, i) => `${s.nome}: ${formatar(l.valores[i])}`).join("\n")}`}>
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                {l.href ? <Link href={l.href} className="min-w-0 truncate text-marca hover:underline">{nome}</Link> : <span className={`min-w-0 truncate ${destaque === l.chave ? "font-semibold" : ""}`}>{nome}</span>}
                <span className="shrink-0 tabular-nums text-slate-700">{l.total ?? formatar(soma(l))}</span>
              </div>
              <div className={`mt-1 flex h-2 gap-[2px] rounded bg-slate-100 ${destaque === l.chave ? "ring-2 ring-amber-300" : ""}`}>
                {l.valores.map((v, i) => v > 0 && (
                  <div key={i} className="h-2 first:rounded-l last:rounded-r" style={{ width: `${(v / max) * 100}%`, background: series[i].cor }} />
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const CORES_ABC = { A: "#1fa855", B: "#e8a10c", C: "#94a3b8" } as const;

/**
 * Curva ABC (Pareto): % acumulado do total (eixo Y) conforme os itens vão sendo somados do maior para o menor (eixo X).
 * As faixas A, B e C são clicáveis e filtram a tabela.
 */
export function CurvaAbc({ linhas, resumo, hrefClasse, classe, unidade }: {
  linhas: { acumulado: number; classe: "A" | "B" | "C"; rotulo: string }[];
  resumo: { classe: "A" | "B" | "C"; itens: number; pctItens: number }[];
  hrefClasse: (c: "A" | "B" | "C" | undefined) => string; classe?: string; unidade: string;
}) {
  const L = 640, A = 220, E = 40, D = 10, T = 10, B = 26;
  const n = linhas.length;
  const x = (i: number) => E + (n ? (i / n) * (L - E - D) : 0);
  const y = (v: number) => T + (1 - v) * (A - T - B);
  const pontos = [`${x(0)},${y(0)}`, ...linhas.map((l, i) => `${x(i + 1)},${y(l.acumulado)}`)].join(" ");
  let ini = 0;
  const faixas = resumo.map((r) => { const f = { ...r, de: ini, ate: ini + r.itens }; ini += r.itens; return f; });
  return (
    <div className="cartao mb-3 p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[14px] font-semibold text-slate-700">Curva ABC: quanto do total os primeiros {unidade} somam</h3>
        <span className="text-[12px] text-slate-500">Clique numa faixa para ver só os itens dela</span>
      </div>
      {!n ? <p className="py-6 text-center text-[13px] text-slate-500">Nada vendido no período.</p> : (
        <svg viewBox={`0 0 ${L} ${A}`} className="h-auto w-full" role="img" aria-label="Curva ABC">
          {faixas.filter((f) => f.itens).map((f) => (
            <a key={f.classe} href={hrefClasse(classe === f.classe ? undefined : f.classe)}>
              <rect x={x(f.de)} y={T} width={Math.max(x(f.ate) - x(f.de) - 2, 2)} height={A - T - B} fill={CORES_ABC[f.classe]}
                opacity={classe && classe !== f.classe ? 0.05 : 0.14} className="cursor-pointer hover:opacity-30">
                <title>{`Classe ${f.classe}: ${f.itens} ${unidade} (${Math.round(f.pctItens * 100)}% dos ${unidade})\nClique para filtrar`}</title>
              </rect>
              <text x={(x(f.de) + x(f.ate)) / 2} y={A - 8} textAnchor="middle" fontSize="11" fill="#475569" fontWeight="600">{f.classe} · {f.itens}</text>
            </a>
          ))}
          {[0, 0.5, 0.8, 0.95, 1].map((m) => (
            <g key={m}>
              <line x1={E} x2={L - D} y1={y(m)} y2={y(m)} stroke={m === 0 ? "#cbd5e1" : "#eef0f2"} strokeDasharray={m === 0.8 || m === 0.95 ? "3 3" : undefined} />
              {m !== 1 && <text x={E - 6} y={y(m) + 3.5} textAnchor="end" fontSize="10" fill="#64748b">{Math.round(m * 100)}%</text>}
            </g>
          ))}
          <polyline points={pontos} fill="none" stroke="#018e83" strokeWidth={2} />
          {linhas.map((l, i) => (
            <circle key={i} cx={x(i + 1)} cy={y(l.acumulado)} r={n > 60 ? 0 : 3} fill="#018e83">
              <title>{`${i + 1}º ${l.rotulo}\nAcumulado: ${Math.round(l.acumulado * 1000) / 10}%`}</title>
            </circle>
          ))}
        </svg>
      )}
    </div>
  );
}
