import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Pagina } from "@/components/ui/Pagina";
import { FormSituacaoOrc } from "@/components/orcamentos/FormsAuxOrc";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar situação" };

export default async function Editar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [s, modelos] = await Promise.all([
    prisma.situacaoOrcamento.findUnique({ where: { id } }),
    prisma.modeloMensagem.findMany({ where: { tipo: "OR" }, select: { id: true, assunto: true }, orderBy: { assunto: "asc" } }),
  ]);
  if (!s) notFound();
  return <Pagina titulo="Editar situação" trilha={[{ rotulo: "Situações", href: "/orcamentos/situacoes" }, { rotulo: "Editar" }]}><FormSituacaoOrc s={s} modelos={modelos} /></Pagina>;
}
