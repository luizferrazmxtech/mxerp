import { prisma } from "@/lib/db";
import { configEstoque } from "@/lib/estoque/config";
import { estoquePadraoEntrada, estoquesDeEntrada } from "@/lib/estoque/entrada";
import { Pagina } from "@/components/ui/Pagina";
import { FormConfigEstoque } from "@/components/compras/FormsAuxCompra";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configurações de estoque" };

export default async function Configuracoes() {
  const [c, seqs] = await Promise.all([configEstoque(), prisma.sequencia.findMany({ where: { chave: { in: ["COTACAO", "COMPRA", "AJUSTE", "TRANSFERENCIA"] } } })]);
  const estoques = await estoquesDeEntrada();
  const estoquePadrao = (await estoquePadraoEntrada(prisma, estoques)) ?? "";
  const v = (k: string) => seqs.find((s) => s.chave === k)?.valor ?? 0;
  return (
    <Pagina titulo="Configurações de estoque" icone="configuracoes" trilha={[{ rotulo: "Estoque", href: "/estoque" }, { rotulo: "Configurações" }]}>
      <FormConfigEstoque c={c} ultimos={{ cotacao: v("COTACAO"), compra: v("COMPRA"), ajuste: v("AJUSTE"), transferencia: v("TRANSFERENCIA") }} estoques={estoques} estoquePadrao={estoquePadrao} />
    </Pagina>
  );
}
