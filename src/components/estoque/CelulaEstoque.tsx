import { ROTULO_ESTOQUE, situacaoEstoque } from "@/lib/itens/estoqueSituacao";
import { qtd } from "@/lib/ui/format";

/**
 * Estoque do produto nas listas, com a cor da situação do disponível (físico − reservado):
 * vermelho em falta, amarelo abaixo do mínimo, verde ok (o mesmo da busca de produtos).
 * Com carros: a pílula mostra o físico da loja e o disponível da loja; o que está nos carros vem embaixo.
 */
export default function CelulaEstoque({ fisico, reservado = 0, minimo, maximo, unidade, controla = true, fisicoCarros = 0, livreCarros = 0 }: {
  fisico: number; reservado?: number; minimo: unknown; maximo?: unknown; unidade?: string; controla?: boolean;
  /** físico nos carros das equipes e o que está livre lá (físico − reservado para OS) */
  fisicoCarros?: number; livreCarros?: number;
}) {
  if (!controla) return <span className="text-slate-400">—</span>;
  const fisicoLoja = fisico - fisicoCarros;
  const reservadoLoja = reservado - (fisicoCarros - livreCarros);
  const disp = fisicoLoja - reservadoLoja;
  const st = ROTULO_ESTOQUE[situacaoEstoque(disp, Number(minimo ?? 0), maximo == null ? null : Number(maximo))];
  const dica = [
    st.rotulo,
    fisicoCarros ? `Físico total ${qtd(fisico)}` : "",
    fisicoCarros ? `Físico - Loja ${qtd(fisicoLoja)}` : "",
    reservadoLoja ? `${qtd(reservadoLoja)} reservado` : "",
    `${qtd(disp)} disponível${fisicoCarros ? " na loja" : ""}`,
    fisicoCarros ? `Nos carros ${qtd(fisicoCarros)} (${qtd(livreCarros)} livre)` : "",
  ].filter(Boolean).join(" · ");
  return (
    <span className="inline-flex flex-col items-end">
      <span className={`pilula ${st.cor}`} title={dica}>
        {qtd(fisicoLoja)}{unidade ? ` ${unidade}` : ""}{reservadoLoja > 0 && <span className="font-normal opacity-80">&nbsp;({qtd(disp)} disp.)</span>}
      </span>
      {fisicoCarros !== 0 && <span className="mt-0.5 whitespace-nowrap text-[11px] text-slate-500" title={dica}>+{qtd(fisicoCarros)} nos carros</span>}
    </span>
  );
}
