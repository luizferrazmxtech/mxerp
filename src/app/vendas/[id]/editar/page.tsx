import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import PaginaFormVenda from "@/components/vendas/PaginaFormVenda";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar venda" };

export default async function Editar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await prisma.venda.findUnique({ where: { id }, select: { tipo: true } });
  if (v?.tipo === "BALCAO") redirect(`/vendas/${id}`);
  return <PaginaFormVenda id={id} />;
}
