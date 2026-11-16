import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Pagina } from "@/components/ui/Pagina";
import { FormMensagemOrc } from "@/components/orcamentos/FormsAuxOrc";
import { salvarMensagemVendaAcao } from "@/lib/vendas/acoes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar mensagem" };

export default async function Editar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await prisma.modeloMensagem.findUnique({ where: { id } });
  if (!m || m.tipo !== "VE") notFound();
  return <Pagina titulo="Editar mensagem" trilha={[{ rotulo: "Mensagens", href: "/vendas/mensagens" }, { rotulo: "Editar" }]}><FormMensagemOrc m={m} acao={salvarMensagemVendaAcao} voltar="/vendas/mensagens" /></Pagina>;
}
