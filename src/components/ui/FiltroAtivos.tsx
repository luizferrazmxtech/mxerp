import Suspenso from "./Suspenso";
import { LinkSuspenso, urlCom } from "./BarraLista";
import Icone from "@/components/Icone";
import { situacaoAtivo, type SituacaoAtivo } from "@/lib/itens/ativos";

const ROTULOS: Record<SituacaoAtivo, string> = { sim: "Ativos", nao: "Inativos", todos: "Todos" };

/**
 * Botão "Ativos ▾" das listas de produtos e de estoque: por padrão só os ativos aparecem;
 * os inativos só entram quando o usuário escolhe "Inativos" ou "Todos" (parâmetro ?ativo=).
 */
export default function FiltroAtivos({ base, params }: { base: string; params: Record<string, string | undefined> }) {
  const atual = situacaoAtivo(params.ativo);
  const link = (v: SituacaoAtivo) => urlCom(base, params, { ativo: v === "sim" ? undefined : v, p: undefined });
  return (
    <Suspenso classe={atual === "sim" ? "btn-sec" : "btn-sec border-amber-400 bg-amber-50 text-amber-800"} titulo="Situação do cadastro"
      botao={<>{ROTULOS[atual]} <Icone nome="abaixo" size={13} /></>}>
      {(Object.keys(ROTULOS) as SituacaoAtivo[]).map((v) => (
        <LinkSuspenso key={v} href={link(v)} icone={v === atual ? "ok" : undefined}><span className={v === atual ? "font-semibold" : "pl-[23px]"}>{ROTULOS[v]}</span></LinkSuspenso>
      ))}
    </Suspenso>
  );
}
