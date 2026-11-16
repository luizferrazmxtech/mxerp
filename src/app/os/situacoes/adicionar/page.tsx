import { prisma } from "@/lib/db";
import { Pagina } from "@/components/ui/Pagina";
import { FormSituacaoVenda } from "@/components/vendas/FormsAuxVenda";

export const dynamic = "force-dynamic";
export const metadata = { title: "Adicionar situação" };

export default async function Adicionar() {
  const modelos = await prisma.modeloMensagem.findMany({ where: { tipo: "OS" }, select: { id: true, assunto: true }, orderBy: { assunto: "asc" } });
  return <Pagina titulo="Adicionar situação" trilha={[{ rotulo: "Situações", href: "/os/situacoes" }, { rotulo: "Adicionar" }]}><FormSituacaoVenda modelos={modelos} usada={0} modulo="os" /></Pagina>;
}
