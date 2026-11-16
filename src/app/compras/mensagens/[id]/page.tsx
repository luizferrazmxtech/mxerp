import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Pagina } from "@/components/ui/Pagina";
import { FormMensagemOrc } from "@/components/orcamentos/FormsAuxOrc";
import { salvarMensagemCompraAcao, salvarMensagemCotacaoAcao } from "@/lib/compras/acoes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar modelo de e-mail" };

export default async function Editar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await prisma.modeloMensagem.findUnique({ where: { id } });
  if (!m || !["COMPRA", "COTACAO"].includes(m.tipo)) notFound();
  return <Pagina titulo="Editar modelo de e-mail" trilha={[{ rotulo: "Modelos de e-mail", href: "/compras/mensagens" }, { rotulo: "Editar" }]}><FormMensagemOrc m={m} acao={m.tipo === "COTACAO" ? salvarMensagemCotacaoAcao : salvarMensagemCompraAcao} voltar="/compras/mensagens" /></Pagina>;
}
