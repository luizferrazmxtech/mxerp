import Link from "next/link";
import { prisma } from "@/lib/db";
import { excluirTipoAcao } from "@/lib/cadastros/auxiliares";
import { Pagina } from "@/components/ui/Pagina";
import BarraCadastro, { AcoesLinha } from "@/components/ui/BarraCadastro";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import { FaixaInfo, FormTipo } from "@/components/cadastros/Auxiliares";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tipos de contatos" };

export default async function PaginatipoContato({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const lista = await prisma.tipoContato.findMany({ where: sp.q ? { nome: { contains: sp.q, mode: "insensitive" } } : {}, orderBy: { nome: "asc" } });
  const editando = sp.editar ? lista.find((x) => x.id === sp.editar) : undefined;
  return (
    <Pagina titulo="Tipos de contatos" icone="auxiliares" trilha={[{ rotulo: "Tipos de contatos", href: "/tipos-contatos" }, { rotulo: "Listar" }]}>
      <BarraCadastro base="/tipos-contatos" params={sp} adicionar={{ href: "/tipos-contatos?novo=1" }} placeholder="Buscar" avancada={false} />
      <FaixaInfo chave="tipos-contatos" titulo="Tipos de contatos">Durante o cadastro de clientes, fornecedores e transportadoras é possível informar o tipo de contato ao qual eles pertencem.</FaixaInfo>
      {(sp.novo === "1" || editando) && <FormTipo key={editando?.id ?? "novo"} tabela="contato" id={editando?.id} nome={editando?.nome} voltar="/tipos-contatos" />}
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Nome</th><th className="w-28 text-right">Ações</th></tr></thead>
          <tbody>
            {lista.map((t) => (
              <tr key={t.id}>
                <td><Link href={`/tipos-contatos?editar=${t.id}`} className="hover:underline">{t.nome}</Link></td>
                <td><AcoesLinha ver={`/tipos-contatos?editar=${t.id}`} editar={`/tipos-contatos?editar=${t.id}`}
                  excluir={<BotaoExcluir acao={excluirTipoAcao.bind(null, "contato", t.id)} pergunta={`Excluir ${t.nome}?`} />} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t px-3 py-2.5 text-[12px] text-slate-600"><span className="rounded border px-2 py-1">Registros <span className="mx-1 text-slate-300">|</span> <b>{lista.length}</b> no total</span></div>
      </div>
    </Pagina>
  );
}
