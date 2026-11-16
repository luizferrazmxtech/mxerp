import Link from "next/link";
import { prisma } from "@/lib/db";
import { excluirCanalAcao } from "@/lib/vendas/acoes";
import { Pagina } from "@/components/ui/Pagina";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import { FormCanal } from "@/components/vendas/FormsAuxVenda";
import Icone from "@/components/Icone";

export const dynamic = "force-dynamic";
export const metadata = { title: "Canais de venda" };

export default async function Canais({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const lista = await prisma.canalVenda.findMany({ orderBy: [{ ordem: "asc" }, { nome: "asc" }] });
  const usos = await Promise.all(lista.map((c) => prisma.venda.count({ where: { canal: c.nome } })));
  const editando = sp.editar ? lista.find((c) => c.id === sp.editar) : undefined;
  return (
    <Pagina titulo="Canais de venda" icone="lojas" trilha={[{ rotulo: "Vendas", href: "/vendas" }, { rotulo: "Canais de venda" }]}>
      {(sp.novo || editando) ? <FormCanal key={editando?.id ?? "novo"} c={editando} /> : (
        <div className="mb-3 flex"><Link href="/vendas/canais?novo=1" className="btn"><Icone nome="mais" size={15} /> Adicionar</Link></div>
      )}
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Nome</th><th className="w-28">Vendas</th><th className="w-28 text-right">Ações</th></tr></thead>
          <tbody>{lista.map((c, i) => (
            <tr key={c.id}><td>{c.nome}{c.padrao && <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-[11px] text-sky-700">Padrão</span>}</td><td>{usos[i]}</td>
              <td className="text-right"><span className="inline-flex gap-1">
                <Link href={`/vendas/canais?editar=${c.id}`} className="rounded p-1 text-slate-500 hover:bg-slate-100" title="Editar"><Icone nome="editar" size={15} /></Link>
                <BotaoExcluir acao={excluirCanalAcao.bind(null, c.id)} pergunta={`Excluir o canal ${c.nome}?`} />
              </span></td></tr>
          ))}</tbody>
        </table>
        <div className="border-t px-3 py-2.5 text-[12px] text-slate-600"><span className="rounded border px-2 py-1">Registros <span className="mx-1 text-slate-300">|</span> <b>{lista.length}</b> no total</span></div>
      </div>
    </Pagina>
  );
}
