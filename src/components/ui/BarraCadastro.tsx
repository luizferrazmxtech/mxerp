import Link from "next/link";
import Icone from "@/components/Icone";
import Suspenso from "./Suspenso";
import { urlCom } from "./BarraLista";

/**
 * Barra das listagens de cadastro do Gestão Click:
 * [+ Adicionar] [⚙ Mais ações ▾] … [☰ colunas] [Buscar por nome][🔍] [🔍+ Busca avançada]
 */
export default function BarraCadastro({ base, params, adicionar, maisAcoes, colunas, placeholder = "Buscar por nome", avancada = true }: {
  base: string;
  params: Record<string, string | undefined>;
  adicionar?: { href: string; rotulo?: string };
  maisAcoes?: React.ReactNode;
  colunas?: React.ReactNode;
  placeholder?: string;
  avancada?: boolean;
}) {
  const aberta = params.busca === "1";
  return (
    <div className="no-print mb-3 flex flex-wrap items-center gap-2">
      {adicionar && <Link href={adicionar.href} className="btn"><Icone nome="mais" size={15} /> {adicionar.rotulo ?? "Adicionar"}</Link>}
      {maisAcoes && (
        <Suspenso classe="btn-sec" botao={<><Icone nome="ajustes" size={15} /> Mais ações <Icone nome="abaixo" size={13} /></>}>
          {maisAcoes}
        </Suspenso>
      )}
      <div className="ml-auto flex items-center gap-2">
        {colunas}
        <form action={base} className="flex">
          {Object.entries(params).filter(([k, v]) => v && !["q", "p"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <input name="q" defaultValue={params.q ?? ""} placeholder={placeholder} className="campo w-56 rounded-r-none sm:w-64" />
          <button className="btn rounded-l-none px-2.5" title="Buscar"><Icone nome="buscar" size={15} /></button>
        </form>
        {avancada && (
          <Link href={urlCom(base, params, { busca: aberta ? undefined : "1" })} className={aberta ? "btn-sec px-2.5" : "btn px-2.5"} title="Busca avançada">
            <Icone nome="filtro" size={15} />
          </Link>
        )}
      </div>
    </div>
  );
}

/** Os três botões quadrados da coluna Ações: visualizar, editar e excluir. */
export function AcoesLinha({ ver, editar, excluir }: { ver?: string; editar?: string; excluir?: React.ReactNode }) {
  return (
    <div className="flex justify-end gap-1">
      {ver && <Link href={ver} className="btn-icone" title="Visualizar"><Icone nome="ver" size={13} /></Link>}
      {editar && <Link href={editar} className="btn-icone" title="Editar"><Icone nome="editar" size={13} /></Link>}
      {excluir}
    </div>
  );
}
