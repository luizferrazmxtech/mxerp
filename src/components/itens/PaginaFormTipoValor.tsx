import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Pagina } from "@/components/ui/Pagina";
import { FormTipoValor } from "./FormsAuxiliares";

export default async function PaginaFormTipoValor({ id }: { id?: string }) {
  const empresas = await prisma.empresa.findMany({ select: { id: true, nomeFantasia: true, razaoSocial: true } });
  const t = id ? await prisma.tipoValor.findUnique({ where: { id } }) : null;
  if (id && !t) notFound();
  const acao = id ? "Editar" : "Adicionar";
  return (
    <Pagina titulo={`${acao} valor de venda`} trilha={[{ rotulo: "Valores de venda", href: "/valores-venda" }, { rotulo: acao }]}>
      <FormTipoValor t={t ? { ...t, lucro: Number(t.lucro) } : undefined} lojas={empresas.map((e) => ({ id: e.id, nome: e.nomeFantasia || e.razaoSocial }))} />
    </Pagina>
  );
}
