import { ROTULO_ESTOQUE, situacaoEstoque } from "@/lib/itens/estoqueSituacao";
import { qtd } from "@/lib/ui/format";

/**
 * Estoque do produto nas listas, com a cor da situação do disponível (físico − reservado):
 * vermelho em falta, amarelo abaixo do mínimo, verde ok (o mesmo da busca de produtos).
 */
export default function CelulaEstoque({ fisico, reservado = 0, minimo, maximo, unidade, controla = true }: {
  fisico: number; reservado?: number; minimo: unknown; maximo?: unknown; unidade?: string; controla?: boolean;
}) {
  if (!controla) return <span className="text-slate-400">—</span>;
  const disp = fisico - reservado;
  const st = ROTULO_ESTOQUE[situacaoEstoque(disp, Number(minimo ?? 0), maximo == null ? null : Number(maximo))];
  return (
    <span className={`pilula ${st.cor}`} title={`${st.rotulo}${reservado ? ` · ${qtd(reservado)} reservado, ${qtd(disp)} disponível` : ""}`}>
      {qtd(fisico)}{unidade ? ` ${unidade}` : ""}{reservado > 0 && <span className="font-normal opacity-80">&nbsp;({qtd(disp)} disp.)</span>}
    </span>
  );
}
