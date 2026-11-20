import Link from "next/link";
import { prisma } from "@/lib/db";
import { empresaDoDocumento } from "@/lib/empresa/atual";
import { num2 } from "@/lib/ui/format";
import { periodoInstantes } from "@/lib/estoque/periodo";
import { Pagina } from "@/components/ui/Pagina";
import { LinkSuspenso } from "@/components/ui/BarraLista";
import Paginacao, { lerPagina } from "@/components/ui/Paginacao";
import Suspenso from "@/components/ui/Suspenso";
import SeletorPeriodo from "@/components/ui/SeletorPeriodo";
import Icone from "@/components/Icone";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ajustes de estoque" };

type Sp = { periodo?: string; pde?: string; pate?: string; q?: string; p?: string; pp?: string };

/** Ajustes de estoque (Gestão Click › Estoque › Ajustes): entradas e saídas manuais. */
export default async function Ajustes({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const base = "/estoque/ajustes";
  const per = periodoInstantes(sp.periodo, sp.pde, sp.pate);
  const numero = Number(sp.q);
  const where = { ...(per.filtro && !sp.q ? { createdAt: per.filtro } : {}), ...(sp.q ? (Number.isInteger(numero) && numero > 0 ? { numero } : { observacoes: { contains: sp.q, mode: "insensitive" as const } }) : {}) };
  const { pagina, porPagina, skip, take } = lerPagina(sp);
  const [lista, total, empresa] = await Promise.all([
    prisma.ajusteEstoque.findMany({ where, orderBy: { numero: "desc" }, skip, take }),
    prisma.ajusteEstoque.count({ where }),
    empresaDoDocumento(null),
  ]);
  const loja = empresa?.nomeFantasia || empresa?.razaoSocial || "";
  return (
    <Pagina titulo="Ajustes de estoque" icone="estoque" trilha={[{ rotulo: "Ajustes de estoque", href: base }, { rotulo: "Listar" }]}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href={`${base}/adicionar`} className="btn"><Icone nome="mais" size={15} /> Adicionar</Link>
        <Suspenso classe="btn-sec" botao={<><Icone nome="ajustes" size={15} /> Mais ações <Icone nome="abaixo" size={13} /></>}>
          <LinkSuspenso href="/estoque/inventarios" icone="lista">Inventários</LinkSuspenso>
          <LinkSuspenso href="/estoque/zerar" icone="excluir">Zerar estoque</LinkSuspenso>
        </Suspenso>
        <div className="ml-auto flex items-center gap-2">
          <SeletorPeriodo base={base} params={sp} />
          <form action={base} className="flex">
            <input name="q" defaultValue={sp.q} placeholder="Buscar por código ou observação" className="campo w-64 rounded-r-none" />
            <button className="btn rounded-l-none px-2.5" title="Buscar"><Icone nome="buscar" size={15} /></button>
          </form>
        </div>
      </div>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th className="w-24">Código</th><th className="w-36 text-center">Movimentação</th><th className="w-32 text-right">Frete</th><th className="w-36 text-right">Valor total</th><th>Loja</th><th className="w-36">Cadastrado em</th><th className="w-28 text-right">Ações</th></tr></thead>
          <tbody>
            {lista.map((a) => (
              <tr key={a.id}>
                <td>{a.numero}</td>
                <td className="text-center"><span className={`pilula ${a.tipo === "SAIDA" ? "border-red-300 bg-red-50 text-red-700" : "border-emerald-300 bg-emerald-50 text-emerald-700"}`}>{a.tipo === "SAIDA" ? "Saída" : "Entrada"}</span></td>
                <td className="text-right">{num2(a.frete)}</td>
                <td className="text-right">{num2(a.total)}</td>
                <td className="text-[12px] uppercase">{loja}</td>
                <td className="text-[12px]">{a.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}</td>
                <td><div className="flex justify-end gap-1">
                  <Link href={`${base}/${a.id}`} className="btn-icone" title="Visualizar"><Icone nome="ver" size={13} /></Link>
                  <Link href={`${base}/adicionar?clonar=${a.id}`} className="btn-icone" title="Clonar"><Icone nome="copiar" size={13} /></Link>
                  <a href={`${base}/${a.id}/imprimir`} target="_blank" className="btn-icone" title="Imprimir A4"><Icone nome="imprimir" size={13} /></a>
                </div></td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={7} className="py-10 text-center text-slate-500">Nenhum ajuste de estoque no período.</td></tr>}
          </tbody>
        </table>
        <Paginacao base={base} params={sp} total={total} pagina={pagina} porPagina={porPagina} />
      </div>
    </Pagina>
  );
}
