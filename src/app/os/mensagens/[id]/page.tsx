import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Pagina } from "@/components/ui/Pagina";
import { FormMensagemOrc } from "@/components/orcamentos/FormsAuxOrc";
import { salvarMensagemOsAcao } from "@/lib/os/acoes";
import { TAGS_WHATSAPP_OS, TEXTO_PADRAO_OS } from "@/lib/whatsapp/tipos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar mensagem" };

export default async function Editar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await prisma.modeloMensagem.findUnique({ where: { id } });
  if (!m || m.tipo !== "OS") notFound();
  return <Pagina titulo="Editar mensagem" trilha={[{ rotulo: "Mensagens", href: "/os/mensagens" }, { rotulo: "Editar" }]}><FormMensagemOrc m={m} acao={salvarMensagemOsAcao} voltar="/os/mensagens" whatsapp={{ tags: TAGS_WHATSAPP_OS, padrao: TEXTO_PADRAO_OS }} /></Pagina>;
}
