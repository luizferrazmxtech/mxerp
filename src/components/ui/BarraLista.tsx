import Link from "next/link";
import Icone from "@/components/Icone";
import Suspenso from "./Suspenso";
import { mesesRecentes, mesSP } from "@/lib/datas";

/** Monta a URL da lista trocando alguns parâmetros e mantendo os outros. */
export function urlCom(base: string, params: Record<string, string | undefined>, mudar: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...mudar })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

/**
 * Barra das listagens: [+ Adicionar] [Mais ações ▾] à esquerda; seletor de mês e busca avançada à direita.
 * `params` são os parâmetros atuais da URL (para manter os filtros ao trocar o mês).
 */
export default function BarraLista({ base, params, adicionar, maisAcoes, mes = true, extra }: {
  base: string;
  params: Record<string, string | undefined>;
  adicionar?: { href: string; rotulo?: string };
  maisAcoes?: React.ReactNode;
  mes?: boolean;
  extra?: React.ReactNode;
}) {
  const todos = params.m === "todos";
  const atual = mesSP(params.m);
  const buscaAberta = params.busca === "1";
  return (
    <div className="no-print mb-3 flex flex-wrap items-center gap-2">
      {adicionar && (
        <Link href={adicionar.href} className="btn"><Icone nome="mais" size={15} /> {adicionar.rotulo ?? "Adicionar"}</Link>
      )}
      {maisAcoes && (
        <Suspenso botao={<><Icone nome="ajustes" size={15} /> Mais ações <Icone nome="abaixo" size={13} /></>}>
          {maisAcoes}
        </Suspenso>
      )}
      {extra}
      <div className="ml-auto flex items-center gap-2">
        {mes && (
          <Suspenso direita classe="btn" botao={<>{todos ? "Todos os meses" : atual.rotulo} <Icone nome="abaixo" size={13} /></>}>
            <Link href={urlCom(base, params, { m: "todos", n: undefined })} className="block px-3 py-[7px] hover:bg-slate-100">Todos os meses</Link>
            {mesesRecentes(13).map((m) => (
              <Link key={m.chave} href={urlCom(base, params, { m: m.chave, n: undefined })}
                className={`block px-3 py-[7px] hover:bg-slate-100 ${!todos && m.chave === atual.chave ? "font-semibold" : ""}`}>{m.rotulo}</Link>
            ))}
          </Suspenso>
        )}
        <Link href={urlCom(base, params, { busca: buscaAberta ? undefined : "1" })} className={buscaAberta ? "btn-sec" : "btn"} title="Busca avançada">
          <Icone nome="buscar" size={15} />
        </Link>
      </div>
    </div>
  );
}

/** Link de menu suspenso (para usar dentro de Suspenso em componentes de servidor). */
export function LinkSuspenso({ href, icone, children }: { href: string; icone?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100">
      {icone && <Icone nome={icone} size={15} />} {children}
    </Link>
  );
}
