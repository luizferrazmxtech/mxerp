import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Pagina } from "@/components/ui/Pagina";
import { FormGrade } from "@/components/itens/FormsAuxiliares";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar grade" };

export default async function Editar({ params }: { params: Promise<{ id: string }> }) {
  const g = await prisma.grade.findUnique({ where: { id: (await params).id } });
  if (!g) notFound();
  return <Pagina titulo="Editar grade" trilha={[{ rotulo: "Grades", href: "/grades" }, { rotulo: "Editar" }]}><FormGrade g={g} /></Pagina>;
}
