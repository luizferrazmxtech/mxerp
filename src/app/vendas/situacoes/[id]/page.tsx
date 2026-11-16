import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Pagina } from "@/components/ui/Pagina";
import { FormSituacaoVenda } from "@/components/vendas/FormsAuxVenda";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar situação" };

export default async function Editar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [s, modelos, usada] = await Promise.all([
    prisma.situacaoVendaConfig.findUnique({ where: { id } }),
    prisma.modeloMensagem.findMany({ where: { tipo: "VE" }, select: { id: true, assunto: true }, orderBy: { assunto: "asc" } }),
    prisma.venda.count({ where: { situacaoId: id } }),
  ]);
  if (!s) notFound();
  return <Pagina titulo="Editar situação" trilha={[{ rotulo: "Situações", href: "/vendas/situacoes" }, { rotulo: "Editar" }]}><FormSituacaoVenda s={s} modelos={modelos} usada={usada} /></Pagina>;
}
