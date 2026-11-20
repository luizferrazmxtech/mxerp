import { ROTULO_ESTOQUE, type SituacaoEstoque } from "@/lib/itens/estoqueSituacao";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const qtd = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

/** Fundo da linha na lista suspensa conforme o estoque (em falta e abaixo do mínimo ficam coloridos). */
export const fundoEstoque = (s?: SituacaoEstoque | null) => (s ? ROTULO_ESTOQUE[s].linha : "");

/**
 * Linha da lista "Digite para buscar" de produtos e serviços: código e nome à esquerda;
 * valor e estoque em destaque à direita, com a cor da situação (em falta, abaixo do mínimo, em estoque…).
 */
export default function LinhaItemBusca({ codigo, nome, unidade, valor, rotuloValor = "Preço", disponivel, situacao, minimo, extra }: {
  codigo?: string | null; nome: string; unidade?: string | null; valor?: number | null; rotuloValor?: string;
  disponivel?: number | null; situacao?: SituacaoEstoque | null; minimo?: number | null; extra?: React.ReactNode;
}) {
  const est = situacao ? ROTULO_ESTOQUE[situacao] : null;
  return (
    <span className="flex items-center gap-3">
      <span className="min-w-0 flex-1">
        {codigo && <span className="block font-mono text-[11px] leading-4 text-slate-500">{codigo}</span>}
        <span className="block font-semibold leading-snug text-slate-800">{nome}</span>
        {extra && <span className="block text-[11px] text-slate-500">{extra}</span>}
      </span>
      {valor != null && (
        <span className="w-24 shrink-0 text-right">
          <span className="block text-[10px] uppercase tracking-wide text-slate-500">{rotuloValor}</span>
          <span className="block text-[14px] font-bold tabular-nums text-slate-900">{brl(valor)}</span>
        </span>
      )}
      {est && (
        <span className="w-32 shrink-0 text-right">
          {situacao === "SEM_CONTROLE" ? <span className={`etiqueta ${est.cor}`}>{est.rotulo}</span> : (
            <>
              <span className={`etiqueta ${est.cor} text-[12px]`}>
                <span className="tabular-nums">{qtd(disponivel ?? 0)}</span>{unidade ? <span className="ml-1 font-normal">{unidade}</span> : null}
              </span>
              <span className={`mt-0.5 block text-[10px] font-semibold ${est.cor.split(" ")[0]}`}>
                {est.rotulo}{situacao === "ABAIXO" && minimo ? ` (mín. ${qtd(minimo)})` : ""}
              </span>
            </>
          )}
        </span>
      )}
    </span>
  );
}
