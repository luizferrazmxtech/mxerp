import Link from "next/link";
import { prisma } from "@/lib/db";
import { ROTULO_PAPEL } from "@/lib/auth/permissoes";
import { dataHora } from "@/lib/ui/format";
import { alterarUsuario } from "./actions";
import { NovoUsuario, RedefinirSenha } from "./Forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Usuários" };

export default async function Usuarios() {
  const usuarios = await prisma.usuario.findMany({
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    include: { sessoes: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const papeis = Object.entries(ROTULO_PAPEL) as [string, string][];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Usuários</h1>
        <Link href="/usuarios/permissoes" className="btn-sec">Permissões por ação</Link>
      </div>
      <NovoUsuario papeis={papeis} />
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Nome</th><th>Acesso</th><th>Último login</th><th>Senha</th></tr></thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className={u.ativo ? "" : "opacity-60"}>
                <td>{u.nome}<div className="text-xs text-slate-500">{u.email}</div></td>
                <td>
                  <form action={alterarUsuario} className="flex flex-wrap items-center gap-2 text-sm">
                    <input type="hidden" name="id" value={u.id} />
                    <select name="papel" defaultValue={u.papel} className="campo w-56">
                      {papeis.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                    </select>
                    <label className="flex items-center gap-1"><input type="checkbox" name="ativo" defaultChecked={u.ativo} /> ativo</label>
                    <label className="flex items-center gap-1"><input type="checkbox" name="tecnico" defaultChecked={u.tecnico} /> técnico</label>
                    <label className="flex items-center gap-1"><input type="checkbox" name="vendedor" defaultChecked={u.vendedor} /> vendedor</label>
                    <button className="btn-sec">Salvar</button>
                  </form>
                </td>
                <td className="text-sm text-slate-600">{u.sessoes[0] ? dataHora(u.sessoes[0].createdAt) : "—"}</td>
                <td><RedefinirSenha id={u.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
