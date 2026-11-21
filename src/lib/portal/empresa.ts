import { prisma } from "@/lib/db";

/** Nome mostrado na Área do Cliente: a primeira loja ativa. */
export async function nomeEmpresaPortal() {
  const e = await prisma.empresa.findFirst({ where: { ativa: true }, orderBy: { createdAt: "asc" }, select: { nomeFantasia: true, razaoSocial: true } });
  return e ? e.nomeFantasia || e.razaoSocial : "MXTECH";
}
