import { prisma } from "@/lib/db";
import { Pagina } from "@/components/ui/Pagina";
import { FormZerar } from "@/components/estoque/FormsEstoque";

export const dynamic = "force-dynamic";
export const metadata = { title: "Zerar estoque" };

export default async function Zerar() {
  const s = await prisma.saldo.aggregate({ where: { quantidade: { gt: 0 }, produto: { controlaEstoque: true } }, _sum: { quantidade: true } });
  const produtos = (await prisma.saldo.groupBy({ by: ["produtoId"], where: { quantidade: { gt: 0 }, produto: { controlaEstoque: true } } })).length;
  return (
    <Pagina titulo="Zerar estoque" trilha={[{ rotulo: "Ajustes de estoque", href: "/estoque/ajustes" }, { rotulo: "Zerar estoque" }]}>
      <FormZerar produtos={produtos} unidades={Number(s._sum.quantidade ?? 0)} />
    </Pagina>
  );
}
