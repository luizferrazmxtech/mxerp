import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { excluirFuncionarioAcao } from "@/lib/cadastros/acoes";
import { Pagina, Pilula } from "@/components/ui/Pagina";
import BarraCadastro, { AcoesLinha } from "@/components/ui/BarraCadastro";
import Paginacao, { Ordenar, lerPagina } from "@/components/ui/Paginacao";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import { cadaPalavra, contem } from "@/lib/busca/palavras";

export const dynamic = "force-dynamic";
export const metadata = { title: "Funcionários" };

export default async function Funcionarios({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const where: Prisma.UsuarioWhereInput = { AND: cadaPalavra(sp.q, (p): Prisma.UsuarioWhereInput[] => [{ nome: contem(p) }, { email: contem(p) }]) };
  const { pagina, porPagina, skip, take } = lerPagina(sp);
  const dir = sp.o?.startsWith("-") ? "desc" : "asc";
  const orderBy: Prisma.UsuarioOrderByWithRelationInput = sp.o?.replace("-", "") === "email" ? { email: dir } : { nome: dir };
  const [lista, total] = await Promise.all([
    prisma.usuario.findMany({ where, orderBy: [{ ativo: "desc" }, orderBy], skip, take, select: { id: true, nome: true, email: true, telefone: true, celular: true, ativo: true, acessoSistema: true, senhaHash: true } }),
    prisma.usuario.count({ where }),
  ]);
  return (
    <Pagina titulo="Funcionários" icone="funcionarios" trilha={[{ rotulo: "Funcionários", href: "/funcionarios" }, { rotulo: "Listar" }]}>
      <BarraCadastro base="/funcionarios" params={sp} adicionar={{ href: "/funcionarios/adicionar" }} avancada={false} />
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr>
            <Ordenar base="/funcionarios" params={sp} campo="nome">Nome</Ordenar>
            <Ordenar base="/funcionarios" params={sp} campo="email">E-mail</Ordenar>
            <th className="w-40">Telefone</th><th className="w-28 text-center">Acesso</th><th className="w-28 text-right">Ações</th>
          </tr></thead>
          <tbody>
            {lista.map((u) => {
              const liberado = u.ativo && u.acessoSistema && !!u.senhaHash;
              return (
                <tr key={u.id} className={u.ativo ? "" : "text-slate-400"}>
                  <td><Link href={`/funcionarios/${u.id}`} className="uppercase hover:underline">{u.nome}</Link>{!u.ativo && <span className="ml-2 text-[11px]">(inativo)</span>}</td>
                  <td>{u.email}</td>
                  <td>{u.telefone ?? u.celular}</td>
                  <td className="text-center">{liberado ? <Pilula rotulo="Liberado" cor="border-emerald-300 bg-emerald-50 text-emerald-700" /> : <Pilula rotulo="Bloqueado" cor="border-slate-300 bg-slate-50 text-slate-600" />}</td>
                  <td><AcoesLinha ver={`/funcionarios/${u.id}`} editar={`/funcionarios/${u.id}/editar`}
                    excluir={<BotaoExcluir acao={excluirFuncionarioAcao.bind(null, u.id)} pergunta={`Excluir ${u.nome}?`} />} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Paginacao base="/funcionarios" params={sp} total={total} pagina={pagina} porPagina={porPagina} />
      </div>
    </Pagina>
  );
}
