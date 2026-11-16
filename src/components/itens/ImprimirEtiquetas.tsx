"use client";

import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import Icone from "@/components/Icone";
import { tamanhoPagina, type MedidasEtiqueta } from "@/lib/itens/etiquetas";

type Produto = { id: string; codigo: string; nome: string; gtin: string | null; preco: number; unidade: string };
type Modelo = MedidasEtiqueta & { id: string; nome: string; mostrarNome: boolean; mostrarPreco: boolean; mostrarCodigo: boolean; mostrarBarras: boolean };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** EAN-13/EAN-8 válidos saem como EAN; o resto (código interno) sai em CODE128. */
function formato(v: string) {
  if (/^\d{13}$/.test(v)) return "EAN13";
  if (/^\d{8}$/.test(v)) return "EAN8";
  return "CODE128";
}

function Barras({ valor, alturaCm }: { valor: string; alturaCm: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, valor, { format: formato(valor), displayValue: true, fontSize: 10, textMargin: 0, margin: 0, height: Math.max(15, alturaCm * 37.8 * 0.35), width: 1.2 });
    } catch {
      JsBarcode(ref.current, valor, { format: "CODE128", displayValue: true, fontSize: 10, textMargin: 0, margin: 0, height: 20, width: 1 });
    }
  }, [valor, alturaCm]);
  return <svg ref={ref} className="max-h-full max-w-full" />;
}

export default function ImprimirEtiquetas({ produtos, modelos }: { produtos: Produto[]; modelos: Modelo[] }) {
  const [modeloId, setModeloId] = useState(modelos[0].id);
  const [qtd, setQtd] = useState<Record<string, number>>(Object.fromEntries(produtos.map((p) => [p.id, 1])));
  const [pular, setPular] = useState(0);
  const m = modelos.find((x) => x.id === modeloId)!;
  const porFolha = m.colunas * m.linhas;
  const etiquetas: (Produto | null)[] = [...Array.from({ length: Math.min(pular, porFolha - 1) }, () => null), ...produtos.flatMap((p) => Array.from({ length: qtd[p.id] ?? 0 }, () => p))];
  const folhas = Array.from({ length: Math.ceil(etiquetas.length / porFolha) }, (_, i) => etiquetas.slice(i * porFolha, (i + 1) * porFolha));
  const pg = tamanhoPagina(m);
  const cm = (v: number) => `${v}cm`;

  return (
    <div>
      <style>{`@media print { @page { size: ${pg.largura}cm ${pg.altura}cm; margin: 0 } .folha-etiquetas { box-shadow: none !important; margin: 0 !important; page-break-after: always; } }`}</style>
      <div className="no-print mb-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead><tr><th>Código</th><th>Produto</th><th className="text-right">Valor</th><th className="w-32 text-right">Quantidade</th></tr></thead>
            <tbody>{produtos.map((p) => (
              <tr key={p.id}><td>{p.codigo}</td><td>{p.nome}</td><td className="text-right">{brl(p.preco)}</td>
                <td><input type="number" min={0} className="campo w-24 text-right" value={qtd[p.id] ?? 0} onChange={(e) => setQtd({ ...qtd, [p.id]: Math.max(0, Number(e.target.value) || 0) })} /></td></tr>
            ))}</tbody>
          </table>
        </div>
        <div className="cartao space-y-3 p-4">
          <label className="block"><span className="rotulo">Modelo de etiqueta</span>
            <select className="campo" value={modeloId} onChange={(e) => setModeloId(e.target.value)}>{modelos.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
          <label className="block"><span className="rotulo">Pular etiquetas já usadas na 1ª folha</span>
            <input type="number" min={0} max={porFolha - 1} className="campo" value={pular} onChange={(e) => setPular(Math.max(0, Number(e.target.value) || 0))} /></label>
          <p className="text-[12px] text-slate-500">{etiquetas.length - Math.min(pular, porFolha - 1)} etiqueta(s) em {folhas.length} folha(s). Na janela de impressão use escala 100% e sem margens.</p>
          <button type="button" className="btn w-full" onClick={() => window.print()}><Icone nome="imprimir" size={15} /> Imprimir</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        {folhas.map((f, i) => (
          <div key={i} className="folha-etiquetas relative mx-auto mb-6 bg-white shadow-md" style={{ width: cm(pg.largura), height: cm(pg.altura) }}>
            {f.map((p, j) => {
              const l = Math.floor(j / m.colunas), c = j % m.colunas;
              return (
                <div key={j} className="absolute flex flex-col items-center justify-center overflow-hidden px-[0.1cm] text-center leading-tight text-black"
                  style={{ left: cm(m.margemLateral + c * (m.largura + m.distHorizontal)), top: cm(m.margemSuperior + l * (m.altura + m.distVertical)), width: cm(m.largura), height: cm(m.altura) }}>
                  {p && <>
                    {m.mostrarNome && <div className="line-clamp-2 text-[8pt] font-semibold uppercase">{p.nome}</div>}
                    {m.mostrarBarras && <Barras valor={p.gtin || p.codigo} alturaCm={m.altura} />}
                    <div className="flex w-full justify-between gap-1 text-[8pt]">
                      {m.mostrarCodigo && <span>Cód. {p.codigo}</span>}
                      {m.mostrarPreco && <b className="ml-auto text-[10pt]">{brl(p.preco)}</b>}
                    </div>
                  </>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
