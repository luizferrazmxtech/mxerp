import Link from "next/link";
import { prisma } from "@/lib/db";
import { excluirCentroAcao, salvarCentroAcao } from "@/lib/financeiro/acoes";
import { Bloco, Pagina } from "@/components/ui/Pagina";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import FormAcao from "@/components/financeiro/FormAcao";
import Icone from "@/components/Icone";

export const dynamic = "force-dynamic";
export const metadata = { title: "Centros de custo" };

export default async function CentrosCusto({ searchParams }: { searchParams: Promise<{ novo?: string; editar?: string }> }) {
  const sp = await searchParams;
  const lista = await prisma.centroCusto.findMany({ orderBy: { nome: "asc" }, include: { _count: { select: { lancamentos: true } } } });
  const editando = sp.editar ? lista.find((c) => c.id === sp.editar) : undefined;
  return (
    <Pagina titulo="Centros de custo" icone="lojas" trilha={[{ rotulo: "Financeiro", href: "/financeiro" }, { rotulo: "Centros de custo" }]}>
      {sp.novo || editando ? (
        <FormAcao acao={salvarCentroAcao} limpar={false}>
          {editando && <input type="hidden" name="id" value={editando.id} />}
          <Bloco icone="editar" titulo={<>Informe o <b>centro de custo</b></>} subtitulo="Departamento, filial ou projeto. As vendas, OS e compras com o campo “Centro de custo” preenchido levam o centro para as contas geradas.">
            <div className="grid gap-3 md:grid-cols-[1fr_200px]">
              <label><span className="rotulo obrig">Nome</span><input name="nome" required autoFocus defaultValue={editando?.nome} className="campo" /></label>
              <label><span className="rotulo">Situação</span><select name="ativo" defaultValue={editando?.ativo === false ? "0" : "1"} className="campo"><option value="1">Ativo</option><option value="0">Inativo</option></select></label>
            </div>
          </Bloco>
          <div className="mb-3 flex gap-2"><Link href="/financeiro/centros-custo" className="btn-sec">Cancelar</Link><button className="btn ml-auto px-5">{editando ? "Salvar" : "Cadastrar"}</button></div>
        </FormAcao>
      ) : (
        <div className="mb-3 flex gap-2"><Link href="/financeiro/centros-custo?novo=1" className="btn"><Icone nome="mais" size={15} /> Adicionar</Link></div>
      )}
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Nome</th><th className="w-28">Lançamentos</th><th className="w-40">Relatórios</th><th className="w-24 text-right">Ações</th></tr></thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id} className={c.ativo ? "" : "opacity-50"}>
                <td>{c.nome}{!c.ativo && <span className="ml-2 text-[11px] text-slate-500">(inativo)</span>}</td>
                <td>{c._count.lancamentos}</td>
                <td className="text-[12px]"><Link className="text-marca hover:underline" href={`/financeiro/dre?centro=${c.id}`}>DRE</Link> · <Link className="text-marca hover:underline" href={`/financeiro/fluxo?centro=${c.id}`}>Fluxo</Link></td>
                <td className="text-right"><span className="inline-flex gap-1">
                  <Link href={`/financeiro/centros-custo?editar=${c.id}`} className="rounded p-1 text-slate-500 hover:bg-slate-100" title="Editar"><Icone nome="editar" size={15} /></Link>
                  {c._count.lancamentos === 0 && <BotaoExcluir acao={excluirCentroAcao.bind(null, c.id)} pergunta={`Excluir o centro ${c.nome}?`} />}
                </span></td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={4} className="py-8 text-center text-slate-500">Nenhum centro de custo. Cadastre departamentos, filiais ou projetos para separar resultados.</td></tr>}
          </tbody>
        </table>
      </div>
    </Pagina>
  );
}
