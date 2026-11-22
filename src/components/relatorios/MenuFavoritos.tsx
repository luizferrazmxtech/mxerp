"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import Suspenso from "@/components/ui/Suspenso";
import FormAcao from "@/components/financeiro/FormAcao";
import Icone from "@/components/Icone";
import { excluirFavoritoAcao, salvarFavoritoAcao } from "@/app/relatorios/actions";
import type { Favorito } from "@/lib/relatorios/favoritos";

/** "★ Favoritos ▾": abre um filtro salvo ou salva o filtro atual (relatório + período + opções) com um nome. */
export default function MenuFavoritos({ favoritos }: { favoritos: Favorito[] }) {
  const caminho = usePathname();
  const sp = useSearchParams();
  const atual = `${caminho}${sp.size ? `?${sp}` : ""}`;
  const [pendente, iniciar] = useTransition();
  return (
    <Suspenso direita classe="btn-sec" titulo="Filtros favoritos" botao={<><Icone nome="estrela" size={14} /> Favoritos <Icone nome="abaixo" size={13} /></>}>
      <div className="w-72">
        {favoritos.map((f) => (
          <div key={f.nome} className={`flex items-center gap-1 px-3 py-[6px] hover:bg-slate-100 ${f.url === atual ? "font-semibold" : ""}`}>
            <Link href={f.url} className="min-w-0 flex-1 truncate">{f.nome}</Link>
            <button type="button" disabled={pendente} onClick={() => iniciar(() => excluirFavoritoAcao(f.nome))} className="text-slate-400 hover:text-red-600" title="Tirar dos favoritos">✕</button>
          </div>
        ))}
        {!favoritos.length && <p className="px-3 py-2 text-[12px] text-slate-500">Nenhum filtro salvo ainda.</p>}
        {/* clicar no campo não pode fechar o menu (o Suspenso fecha a cada clique dentro dele) */}
        <div onClick={(e) => e.stopPropagation()}>
        <FormAcao acao={salvarFavoritoAcao} className="border-t px-3 py-2" botao="Salvar este filtro" classeBotao="btn mt-2 w-full py-1">
          <input type="hidden" name="url" value={atual} />
          <div className="mb-1 text-[12px] font-semibold">Salvar o que está na tela</div>
          <input name="nome" required maxLength={60} placeholder="Ex.: Lucro do mês por vendedor" className="campo w-full py-1 text-[12px]" />
        </FormAcao>
        </div>
      </div>
    </Suspenso>
  );
}
