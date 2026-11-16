import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Pagina } from "@/components/ui/Pagina";
import { FormEtiqueta } from "@/components/itens/FormsAuxiliares";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar etiqueta" };

export default async function Editar({ params }: { params: Promise<{ id: string }> }) {
  const e = await prisma.modeloEtiqueta.findUnique({ where: { id: (await params).id } });
  if (!e) notFound();
  const n = (v: unknown) => Number(v);
  return (
    <Pagina titulo="Editar modelo de etiqueta" trilha={[{ rotulo: "Etiquetas", href: "/etiquetas" }, { rotulo: "Editar" }]}>
      <FormEtiqueta e={{ ...e, altura: n(e.altura), largura: n(e.largura), margemSuperior: n(e.margemSuperior), margemLateral: n(e.margemLateral), distVertical: n(e.distVertical), distHorizontal: n(e.distHorizontal) }} />
    </Pagina>
  );
}
