import { prisma } from "@/lib/db";
import { Pagina } from "@/components/ui/Pagina";
import { FormSituacaoOrc } from "@/components/orcamentos/FormsAuxOrc";

export const dynamic = "force-dynamic";
export const metadata = { title: "Adicionar situação" };

export default async function Adicionar() {
  const modelos = await prisma.modeloMensagem.findMany({ where: { tipo: "OR" }, select: { id: true, assunto: true }, orderBy: { assunto: "asc" } });
  return <Pagina titulo="Adicionar situação" trilha={[{ rotulo: "Situações", href: "/orcamentos/situacoes" }, { rotulo: "Adicionar" }]}><FormSituacaoOrc modelos={modelos} /></Pagina>;
}
