import { prisma } from "@/lib/db";
import { garantirPadroes } from "@/lib/financeiro/padroes";
import Pdv from "./Pdv";

export const dynamic = "force-dynamic";

export default async function PdvPage() {
  await prisma.$transaction((tx) => garantirPadroes(tx));
  const formas = await prisma.formaPagamento.findMany({ where: { ativa: true }, orderBy: { nome: "asc" } });
  const ordem = ["Dinheiro", "PIX", "Cartão de débito", "Cartão de crédito"];
  formas.sort((a, b) => (ordem.indexOf(a.nome) + 1 || 99) - (ordem.indexOf(b.nome) + 1 || 99));
  return <Pdv formas={formas.map((f) => ({ id: f.id, nome: f.nome, diasPrazo: f.diasPrazo }))} />;
}
