import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Pagina } from "@/components/ui/Pagina";
import { FormSituacaoCompra } from "@/components/compras/FormsAuxCompra";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar situação" };

export default async function Editar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [s, usada] = await Promise.all([prisma.situacaoCompraConfig.findUnique({ where: { id } }), prisma.compra.count({ where: { situacaoId: id } })]);
  if (!s) notFound();
  return <Pagina titulo="Editar situação" trilha={[{ rotulo: "Situações", href: "/compras/situacoes" }, { rotulo: "Editar" }]}><FormSituacaoCompra s={s} usada={usada} /></Pagina>;
}
