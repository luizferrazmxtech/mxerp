import Link from "next/link";
import { prisma } from "@/lib/db";
import { excluirEquipeAcao } from "@/lib/os/equipes";
import { Pagina } from "@/components/ui/Pagina";
import BarraCadastro, { AcoesLinha } from "@/components/ui/BarraCadastro";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import FormEquipe from "@/components/os/FormEquipe";
import RodapeLista from "@/components/itens/RodapeLista";

export const dynamic = "force-dynamic";
export const metadata = { title: "Equipes de técnicos" };

export default async function Equipes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [lista, funcionarios] = await Promise.all([
    prisma.equipe.findMany({ where: sp.q ? { nome: { contains: sp.q, mode: "insensitive" } } : {}, orderBy: { nome: "asc" } }),
    prisma.usuario.findMany({ where: { ativo: true }, select: { id: true, nome: true, tecnico: true, papel: true }, orderBy: { nome: "asc" } }),
  ]);
  const ordenados = [...funcionarios].sort((a, b) => Number(b.tecnico || b.papel === "TECNICO") - Number(a.tecnico || a.papel === "TECNICO"));
  const nomes = new Map(funcionarios.map((f) => [f.id, f.nome]));
  const editando = sp.editar ? lista.find((x) => x.id === sp.editar) : undefined;
  return (
    <Pagina titulo="Equipes de técnicos" icone="equipe" trilha={[{ rotulo: "Ordens de serviços", href: "/os" }, { rotulo: "Equipes" }]}>
      <BarraCadastro base="/os/equipes" params={sp} adicionar={{ href: "/os/equipes?novo=1" }} placeholder="Buscar" avancada={false} />
      {(sp.novo === "1" || editando) && <FormEquipe key={editando?.id ?? "novo"} e={editando} funcionarios={ordenados.map((f) => ({ id: f.id, nome: f.nome, tecnico: f.tecnico || f.papel === "TECNICO" }))} />}
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Nome</th><th>Membros</th><th className="w-24">Situação</th><th className="w-28 text-right">Ações</th></tr></thead>
          <tbody>
            {lista.map((e) => (
              <tr key={e.id}>
                <td><Link href={`/os/equipes?editar=${e.id}`} className="hover:underline">{e.nome}</Link></td>
                <td className="text-slate-600">{e.membros.map((m) => nomes.get(m)).filter(Boolean).join(", ")}</td>
                <td>{e.ativo ? <span className="pilula border-emerald-300 bg-emerald-50 text-emerald-700">Ativa</span> : <span className="pilula border-slate-300 bg-white text-slate-600">Inativa</span>}</td>
                <td><AcoesLinha editar={`/os/equipes?editar=${e.id}`} excluir={<BotaoExcluir acao={excluirEquipeAcao.bind(null, e.id)} pergunta={`Excluir a equipe ${e.nome}?`} />} /></td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={4} className="py-6 text-center text-slate-500">Nenhuma equipe. Cadastre uma para que vários técnicos trabalhem na mesma OS.</td></tr>}
          </tbody>
        </table>
        <RodapeLista total={lista.length} />
      </div>
    </Pagina>
  );
}
