import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Pagina } from "@/components/ui/Pagina";
import { FormCampoExtra } from "@/components/cadastros/Auxiliares";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar campo extra" };

export default async function Editar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await prisma.campoExtra.findUnique({ where: { id } });
  if (!c) notFound();
  return <Pagina titulo="Editar campo extra" trilha={[{ rotulo: "Campos extras", href: "/campos-extras" }, { rotulo: "Editar" }]}><FormCampoExtra c={c} /></Pagina>;
}
