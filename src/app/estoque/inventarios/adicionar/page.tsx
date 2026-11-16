import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/atual";
import { Pagina } from "@/components/ui/Pagina";
import { FormInventario } from "@/components/estoque/FormsEstoque";

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
      <FormInventario usuarios={usuarios} grupos={grupos} usuarioAtual={atual} />
    </Pagina>
  );
}
