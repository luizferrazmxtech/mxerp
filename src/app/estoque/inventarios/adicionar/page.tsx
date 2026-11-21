import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/atual";
import { Pagina } from "@/components/ui/Pagina";
import { FormInventario } from "@/components/estoque/FormsEstoque";
import { PODE_LANCAR_ESTOQUE } from "@/lib/compras/papeis";
import SemPermissao from "@/components/ui/SemPermissao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Adicionar inventário" };

export default async function AdicionarInventario() {
  const [u, usuarios, grupos] = await Promise.all([
    usuarioAtual(),
    prisma.usuario.findMany({ where: { ativo: true }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    prisma.grupoProduto.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
  ]);
  const atual = u ? { id: u.id, nome: u.nome } : usuarios[0] ?? { id: "", nome: "" };
  return (
    <Pagina titulo="Adicionar inventário" trilha={[{ rotulo: "Inventários", href: "/estoque/inventarios" }, { rotulo: "Adicionar" }]}>
      {u && !PODE_LANCAR_ESTOQUE.includes(u.papel)
        ? <SemPermissao texto="Seu perfil de usuário não pode abrir inventários. Peça a um gerente ou ao administrador." />
        : <FormInventario usuarios={usuarios} grupos={grupos} usuarioAtual={atual} />}
    </Pagina>
  );
}
