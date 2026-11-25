"use client";

import { useEffect, useState } from "react";

/** Etapas mostradas enquanto a análise roda (o servidor não informa o andamento: a barra anda pelo tempo). */
export type Etapa = { ate: number; texto: string };

/**
 * Barra de progresso para telas pesadas: anda rápido no começo e vai desacelerando até 95%, com o texto da etapa.
 * Some sozinha quando a tela nova chega (o componente sai da árvore).
 */
export function BarraCarregando({ titulo, etapas, segundos = 8 }: { titulo: string; etapas: Etapa[]; segundos?: number }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const inicio = Date.now();
    const id = setInterval(() => setT((Date.now() - inicio) / 1000), 200);
    return () => clearInterval(id);
  }, []);
  const pct = Math.min(95, 100 * (1 - Math.exp(-t / (segundos / 2.3))));
  const etapa = etapas.find((e) => pct < e.ate) ?? etapas[etapas.length - 1];
  return (
    <div className="cartao space-y-2 p-4" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={titulo}>
      <div className="flex items-baseline justify-between gap-3 text-[14px]">
        <b>{titulo}</b>
        <span className="text-[12px] text-slate-500">{Math.round(pct)}% · {Math.floor(t)} s</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-marca transition-[width] duration-200 ease-linear" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[13px] text-slate-600">{etapa?.texto}</p>
      {t > segundos * 2.5 && <p className="text-[12px] text-amber-700">Está demorando mais que o normal, mas continua trabalhando. Não precisa recarregar a página.</p>}
    </div>
  );
}

/** Faixa fina no topo da tela enquanto uma navegação (aba, filtro, ordem) carrega. */
export function FaixaTopo() {
  return (
    <div className="fixed inset-x-0 top-0 z-[60] h-1 overflow-hidden bg-marca/20" aria-hidden>
      <div className="h-full w-1/3 animate-[faixa_1.1s_ease-in-out_infinite] bg-marca" />
    </div>
  );
}
